using JobProcessor.Api.Configuration;
using JobProcessor.Api.Data;
using JobProcessor.Api.DTOs;
using JobProcessor.Api.Jobs;
using JobProcessor.Api.Models;
using JobProcessor.Api.Queue;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace JobProcessor.Api.Services;

/// <summary>
/// Owns the job lifecycle state machine. All status transitions happen here so
/// there is exactly one place that decides what a valid transition looks like.
/// </summary>
public class JobService : IJobService
{
    private readonly AppDbContext _db;
    private readonly JobHandlerRegistry _registry;
    private readonly IBackgroundJobQueue _queue;
    private readonly IRetryPolicy _retryPolicy;
    private readonly RetrySettings _retrySettings;
    private readonly IJobEventNotifier _notifier;
    private readonly ILogger<JobService> _logger;

    public JobService(
        AppDbContext db,
        JobHandlerRegistry registry,
        IBackgroundJobQueue queue,
        IRetryPolicy retryPolicy,
        IOptions<RetrySettings> retrySettings,
        IJobEventNotifier notifier,
        ILogger<JobService> logger)
    {
        _db = db;
        _registry = registry;
        _queue = queue;
        _retryPolicy = retryPolicy;
        _retrySettings = retrySettings.Value;
        _notifier = notifier;
        _logger = logger;
    }

    public async Task<JobResponse> CreateJobAsync(CreateJobRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.JobType) || !_registry.IsKnown(request.JobType))
        {
            throw new ArgumentException(
                $"Unknown job type '{request.JobType}'. Known types: {string.Join(", ", _registry.KnownJobTypes)}");
        }

        var payloadJson = request.Payload.HasValue ? request.Payload.Value.GetRawText() : "{}";
        var now = DateTime.UtcNow;

        var job = new Job
        {
            Id = Guid.NewGuid(),
            JobType = request.JobType,
            Payload = payloadJson,
            Status = JobStatus.Queued,
            RetryCount = 0,
            MaxRetries = request.MaxRetries ?? _retrySettings.MaxRetries,
            Priority = request.Priority,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Jobs.Add(job);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Job {JobId} ({JobType}) created", job.Id, job.JobType);

        _queue.TryEnqueue(job.Id);

        await _notifier.NotifyJobChangedAsync(ToEvent(job, "Created"));
        await _notifier.NotifyStatsChangedAsync();

        return ToResponse(job);
    }

    public async Task<JobDetailResponse?> GetJobAsync(Guid id, CancellationToken ct = default)
    {
        var job = await _db.Jobs.Include(j => j.Attempts).AsNoTracking().FirstOrDefaultAsync(j => j.Id == id, ct);
        return job == null ? null : ToDetailResponse(job);
    }

    public async Task<List<JobAttemptResponse>> GetJobAttemptsAsync(Guid id, CancellationToken ct = default)
    {
        var attempts = await _db.JobAttempts.AsNoTracking()
            .Where(a => a.JobId == id)
            .OrderBy(a => a.AttemptNumber)
            .ToListAsync(ct);

        return attempts.Select(ToAttemptResponse).ToList();
    }

    public async Task<PagedResult<JobResponse>> ListJobsAsync(string? status, string? jobType, int page, int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.Jobs.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsedStatus = JobStatusNames.FromWire(status);
            query = query.Where(j => j.Status == parsedStatus);
        }

        if (!string.IsNullOrWhiteSpace(jobType))
        {
            query = query.Where(j => j.JobType == jobType);
        }

        var totalCount = await query.CountAsync(ct);

        var jobs = await query
            .OrderByDescending(j => j.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<JobResponse>
        {
            Items = jobs.Select(ToResponse).ToList(),
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount
        };
    }

    public async Task<StatsResponse> GetStatsAsync(CancellationToken ct = default)
    {
        var counts = await _db.Jobs
            .GroupBy(j => j.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        int Get(JobStatus s) => counts.FirstOrDefault(c => c.Status == s)?.Count ?? 0;

        var total = counts.Sum(c => c.Count);
        var completed = Get(JobStatus.Completed);
        var deadLetter = Get(JobStatus.DeadLetter);
        var finished = completed + deadLetter;

        var durations = await _db.Jobs.AsNoTracking()
            .Where(j => j.Status == JobStatus.Completed && j.StartedAt != null && j.CompletedAt != null)
            .Select(j => new { j.StartedAt, j.CompletedAt })
            .ToListAsync(ct);

        double? avgMs = durations.Count == 0
            ? null
            : durations.Average(d => (d.CompletedAt!.Value - d.StartedAt!.Value).TotalMilliseconds);

        return new StatsResponse
        {
            Total = total,
            Queued = Get(JobStatus.Queued),
            Processing = Get(JobStatus.Processing),
            Completed = completed,
            Retrying = Get(JobStatus.Retrying),
            Failed = Get(JobStatus.Failed),
            DeadLetter = deadLetter,
            Cancelled = Get(JobStatus.Cancelled),
            SuccessRatePercent = finished == 0 ? 0 : Math.Round(completed * 100.0 / finished, 1),
            AverageProcessingTimeMs = avgMs.HasValue ? Math.Round(avgMs.Value, 0) : null
        };
    }

    public async Task<bool> CancelJobAsync(Guid id, CancellationToken ct = default)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(j => j.Id == id, ct);
        if (job == null) return false;

        if (job.Status != JobStatus.Queued && job.Status != JobStatus.Retrying)
        {
            throw new InvalidOperationException($"Job cannot be cancelled while in status '{job.Status.ToWire()}'");
        }

        job.Status = JobStatus.Cancelled;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Job {JobId} cancelled by user request", job.Id);
        await _notifier.NotifyJobChangedAsync(ToEvent(job, "StatusChanged"));
        await _notifier.NotifyStatsChangedAsync();
        return true;
    }

    public async Task<PagedResult<DeadLetterResponse>> ListDeadLettersAsync(int page, int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.DeadLetterJobs.AsNoTracking().OrderByDescending(d => d.DeadLetteredAt);
        var totalCount = await query.CountAsync(ct);
        var items = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        return new PagedResult<DeadLetterResponse>
        {
            Items = items.Select(d => ToDeadLetterResponse(d, null)).ToList(),
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount
        };
    }

    public async Task<DeadLetterResponse?> GetDeadLetterAsync(Guid id, CancellationToken ct = default)
    {
        var dl = await _db.DeadLetterJobs.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, ct);
        if (dl == null) return null;

        var attempts = await _db.JobAttempts.AsNoTracking()
            .Where(a => a.JobId == dl.OriginalJobId)
            .OrderBy(a => a.AttemptNumber)
            .ToListAsync(ct);

        return ToDeadLetterResponse(dl, attempts.Select(ToAttemptResponse).ToList());
    }

    public async Task<JobResponse?> RequeueDeadLetterAsync(Guid id, CancellationToken ct = default)
    {
        var dl = await _db.DeadLetterJobs.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, ct);
        if (dl == null) return null;

        var now = DateTime.UtcNow;
        var newJob = new Job
        {
            Id = Guid.NewGuid(),
            JobType = dl.JobType,
            Payload = dl.Payload,
            Status = JobStatus.Queued,
            RetryCount = 0,
            MaxRetries = dl.MaxRetries,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Jobs.Add(newJob);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Dead-lettered job {OriginalJobId} requeued as new job {NewJobId}", dl.OriginalJobId, newJob.Id);

        _queue.TryEnqueue(newJob.Id);
        await _notifier.NotifyJobChangedAsync(ToEvent(newJob, "Created"));
        await _notifier.NotifyStatsChangedAsync();

        return ToResponse(newJob);
    }

    /// <summary>Deletes jobs in a final state (completed, dead-lettered, cancelled) plus their attempts and dead-letter records. Active jobs are left alone.</summary>
    public async Task<int> ClearFinishedJobsAsync(CancellationToken ct = default)
    {
        var finished = new[] { JobStatus.Completed, JobStatus.DeadLetter, JobStatus.Cancelled };
        var ids = await _db.Jobs.Where(j => finished.Contains(j.Status)).Select(j => j.Id).ToListAsync(ct);
        if (ids.Count == 0) return 0;

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        await _db.JobAttempts.Where(a => ids.Contains(a.JobId)).ExecuteDeleteAsync(ct);
        await _db.DeadLetterJobs.Where(d => ids.Contains(d.OriginalJobId)).ExecuteDeleteAsync(ct);
        var deleted = await _db.Jobs.Where(j => ids.Contains(j.Id)).ExecuteDeleteAsync(ct);
        await tx.CommitAsync(ct);

        _logger.LogInformation("Cleared {Count} finished job(s)", deleted);
        await _notifier.NotifyStatsChangedAsync();
        return deleted;
    }

    public async Task<Job?> ClaimForProcessingAsync(Guid jobId, CancellationToken ct = default)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(j => j.Id == jobId, ct);
        if (job == null)
        {
            _logger.LogWarning("Worker attempted to claim missing job {JobId}", jobId);
            return null;
        }

        if (job.Status != JobStatus.Queued && job.Status != JobStatus.Retrying)
        {
            _logger.LogInformation("Skipping job {JobId}: not in a claimable state ({Status})", jobId, job.Status.ToWire());
            return null;
        }

        var now = DateTime.UtcNow;
        job.Status = JobStatus.Processing;
        job.StartedAt ??= now;
        job.LastAttemptAt = now;
        job.UpdatedAt = now;
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Job {JobId} started (attempt {Attempt})", job.Id, job.RetryCount + 1);
        await _notifier.NotifyJobChangedAsync(ToEvent(job, "StatusChanged"));

        return job;
    }

    public async Task RecordSuccessAsync(Guid jobId, int attemptNumber, DateTime startedAt, DateTime completedAt, long durationMs, CancellationToken ct = default)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(j => j.Id == jobId, ct);
        if (job == null) return;

        _db.JobAttempts.Add(new JobAttempt
        {
            JobId = jobId,
            AttemptNumber = attemptNumber,
            StartedAt = startedAt,
            CompletedAt = completedAt,
            Outcome = AttemptOutcome.Succeeded,
            DurationMs = durationMs
        });

        job.Status = JobStatus.Completed;
        job.CompletedAt = completedAt;
        job.UpdatedAt = completedAt;
        job.LastError = null;
        job.NextRetryAt = null;

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Job {JobId} succeeded on attempt {Attempt}", jobId, attemptNumber);
        await _notifier.NotifyJobChangedAsync(ToEvent(job, "StatusChanged"));
        await _notifier.NotifyStatsChangedAsync();
    }

    public async Task RecordFailureAsync(Guid jobId, int attemptNumber, DateTime startedAt, DateTime completedAt, long? durationMs, string errorMessage, string? stackTrace, CancellationToken ct = default)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(j => j.Id == jobId, ct);
        if (job == null) return;

        _db.JobAttempts.Add(new JobAttempt
        {
            JobId = jobId,
            AttemptNumber = attemptNumber,
            StartedAt = startedAt,
            CompletedAt = completedAt,
            Outcome = AttemptOutcome.Failed,
            ErrorMessage = errorMessage,
            StackTrace = stackTrace,
            DurationMs = durationMs
        });

        job.RetryCount = attemptNumber;
        job.LastError = errorMessage;
        job.Status = JobStatus.Failed;
        job.UpdatedAt = DateTime.UtcNow;

        _logger.LogWarning("Job {JobId} failed on attempt {Attempt}: {Error}", jobId, attemptNumber, errorMessage);

        if (job.RetryCount < job.MaxRetries)
        {
            var delay = _retryPolicy.CalculateDelay(job.RetryCount);
            job.Status = JobStatus.Retrying;
            job.NextRetryAt = DateTime.UtcNow.Add(delay);
            await _db.SaveChangesAsync(ct);

            _logger.LogInformation("Job {JobId} retry {Next}/{Max} scheduled in {Delay:F1}s", jobId, job.RetryCount + 1, job.MaxRetries, delay.TotalSeconds);
            await _notifier.NotifyJobChangedAsync(ToEvent(job, "StatusChanged"));
        }
        else
        {
            job.Status = JobStatus.DeadLetter;
            job.FailureReason = $"Exceeded maximum retry count ({job.MaxRetries})";
            job.NextRetryAt = null;

            _db.DeadLetterJobs.Add(new DeadLetterJob
            {
                OriginalJobId = job.Id,
                JobType = job.JobType,
                Payload = job.Payload,
                RetryCount = job.RetryCount,
                MaxRetries = job.MaxRetries,
                FinalError = errorMessage,
                FailureReason = job.FailureReason,
                CreatedAt = job.CreatedAt
            });

            await _db.SaveChangesAsync(ct);

            _logger.LogError("Job {JobId} moved to dead-letter storage after {Attempts} attempts", jobId, job.RetryCount);
            await _notifier.NotifyJobChangedAsync(ToEvent(job, "StatusChanged"));
        }

        await _notifier.NotifyStatsChangedAsync();
    }

    private static JobResponse ToResponse(Job job) => new()
    {
        Id = job.Id,
        JobType = job.JobType,
        Status = job.Status.ToWire(),
        RetryCount = job.RetryCount,
        MaxRetries = job.MaxRetries,
        CreatedAt = job.CreatedAt,
        StartedAt = job.StartedAt,
        CompletedAt = job.CompletedAt,
        LastAttemptAt = job.LastAttemptAt,
        NextRetryAt = job.NextRetryAt,
        LastError = job.LastError
    };

    private static JobDetailResponse ToDetailResponse(Job job) => new()
    {
        Id = job.Id,
        JobType = job.JobType,
        Status = job.Status.ToWire(),
        RetryCount = job.RetryCount,
        MaxRetries = job.MaxRetries,
        CreatedAt = job.CreatedAt,
        StartedAt = job.StartedAt,
        CompletedAt = job.CompletedAt,
        LastAttemptAt = job.LastAttemptAt,
        NextRetryAt = job.NextRetryAt,
        LastError = job.LastError,
        Payload = job.Payload,
        FailureReason = job.FailureReason,
        Attempts = job.Attempts.OrderBy(a => a.AttemptNumber).Select(ToAttemptResponse).ToList()
    };

    private static JobAttemptResponse ToAttemptResponse(JobAttempt a) => new()
    {
        Id = a.Id,
        AttemptNumber = a.AttemptNumber,
        Outcome = a.Outcome.ToWire(),
        StartedAt = a.StartedAt,
        CompletedAt = a.CompletedAt,
        DurationMs = a.DurationMs,
        ErrorMessage = a.ErrorMessage,
        StackTrace = a.StackTrace
    };

    private static DeadLetterResponse ToDeadLetterResponse(DeadLetterJob d, List<JobAttemptResponse>? attempts) => new()
    {
        Id = d.Id,
        OriginalJobId = d.OriginalJobId,
        JobType = d.JobType,
        Payload = d.Payload,
        RetryCount = d.RetryCount,
        MaxRetries = d.MaxRetries,
        FinalError = d.FinalError,
        FailureReason = d.FailureReason,
        CreatedAt = d.CreatedAt,
        DeadLetteredAt = d.DeadLetteredAt,
        Attempts = attempts ?? new List<JobAttemptResponse>()
    };

    private static JobSummaryEvent ToEvent(Job job, string eventType) => new()
    {
        Id = job.Id,
        JobType = job.JobType,
        Status = job.Status.ToWire(),
        RetryCount = job.RetryCount,
        MaxRetries = job.MaxRetries,
        NextRetryAt = job.NextRetryAt,
        LastError = job.LastError,
        EventType = eventType
    };
}
