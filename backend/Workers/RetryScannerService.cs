using JobProcessor.Api.Configuration;
using JobProcessor.Api.Data;
using JobProcessor.Api.Models;
using JobProcessor.Api.Queue;
using JobProcessor.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace JobProcessor.Api.Workers;

/// <summary>
/// Two jobs in one service, both about turning persisted state back into queue
/// activity:
///
/// 1. Startup recovery (runs once at boot): jobs left in PROCESSING from a
///    previous crash are treated as a failed attempt (so they go through the
///    normal retry/dead-letter decision); persisted QUEUED jobs are re-enqueued;
///    persisted RETRYING jobs whose NextRetryAt has already passed are re-enqueued.
///
/// 2. Ongoing retry scanning (every RetryScanIntervalSeconds): finds RETRYING
///    jobs whose backoff has elapsed and enqueues them. This is what actually
///    implements the delay - a failed job is never put back on the queue
///    immediately, it waits here until it's due.
/// </summary>
public class RetryScannerService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IBackgroundJobQueue _queue;
    private readonly WorkerSettings _settings;
    private readonly WorkerActivityTracker _activity;
    private readonly ILogger<RetryScannerService> _logger;

    public RetryScannerService(
        IServiceScopeFactory scopeFactory,
        IBackgroundJobQueue queue,
        IOptions<WorkerSettings> settings,
        WorkerActivityTracker activity,
        ILogger<RetryScannerService> logger)
    {
        _scopeFactory = scopeFactory;
        _queue = queue;
        _settings = settings.Value;
        _activity = activity;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await RunStartupRecoveryAsync(stoppingToken);

        var interval = TimeSpan.FromSeconds(Math.Max(1, _settings.RetryScanIntervalSeconds));
        using var timer = new PeriodicTimer(interval);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await ScanDueRetriesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Retry scanner iteration failed");
            }
        }
    }

    private async Task RunStartupRecoveryAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var jobService = scope.ServiceProvider.GetRequiredService<IJobService>();

        var stuckProcessing = await db.Jobs.Where(j => j.Status == JobStatus.Processing).ToListAsync(ct);
        if (stuckProcessing.Count > 0)
        {
            _logger.LogWarning("Found {Count} job(s) stuck in PROCESSING from a previous run; re-evaluating them as failed attempts", stuckProcessing.Count);

            foreach (var job in stuckProcessing)
            {
                var attemptNumber = job.RetryCount + 1;
                await jobService.RecordFailureAsync(
                    job.Id, attemptNumber, job.LastAttemptAt ?? job.CreatedAt, DateTime.UtcNow, null,
                    "Job was interrupted by an application restart while it was processing", null, ct);
            }
        }

        var queued = await db.Jobs.AsNoTracking().Where(j => j.Status == JobStatus.Queued).Select(j => j.Id).ToListAsync(ct);
        foreach (var id in queued)
        {
            _queue.TryEnqueue(id);
        }

        if (queued.Count > 0)
        {
            _logger.LogInformation("Recovered {Count} queued job(s) on startup", queued.Count);
        }

        await ScanDueRetriesAsync(ct);
    }

    private async Task ScanDueRetriesAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var now = DateTime.UtcNow;
        var due = await db.Jobs.AsNoTracking()
            .Where(j => j.Status == JobStatus.Retrying && j.NextRetryAt != null && j.NextRetryAt <= now)
            .Select(j => j.Id)
            .ToListAsync(ct);

        var enqueued = 0;
        foreach (var id in due)
        {
            if (_queue.TryEnqueue(id))
            {
                enqueued++;
                _logger.LogDebug("Enqueued due retry for job {JobId}", id);
            }
        }

        _activity.RecordRetryScan(enqueued);
    }
}
