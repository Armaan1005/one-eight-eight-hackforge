using System.Diagnostics;
using System.Text.Json;
using JobProcessor.Api.Configuration;
using JobProcessor.Api.Jobs;
using JobProcessor.Api.Queue;
using JobProcessor.Api.Services;
using Microsoft.Extensions.Options;

namespace JobProcessor.Api.Workers;

/// <summary>
/// Consumes ready-to-run job IDs from the queue and executes them.
/// Runs WorkerSettings.WorkerCount concurrent consumer loops against the same
/// Channel-backed queue (a standard competing-consumers pattern), so each
/// queued job is delivered to exactly one loop. Combined with the queue's
/// in-flight tracking, this is what keeps a job from being processed twice at
/// once - see IBackgroundJobQueue for the full explanation.
/// </summary>
public class JobWorker : BackgroundService
{
    private readonly IBackgroundJobQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly JobHandlerRegistry _registry;
    private readonly WorkerSettings _settings;
    private readonly WorkerActivityTracker _activity;
    private readonly ILogger<JobWorker> _logger;

    public JobWorker(
        IBackgroundJobQueue queue,
        IServiceScopeFactory scopeFactory,
        JobHandlerRegistry registry,
        IOptions<WorkerSettings> settings,
        WorkerActivityTracker activity,
        ILogger<JobWorker> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _registry = registry;
        _settings = settings.Value;
        _activity = activity;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var workerCount = Math.Max(1, _settings.WorkerCount);
        _logger.LogInformation("Starting job worker pool with {Count} concurrent worker(s)", workerCount);
        _activity.RegisterWorkers(workerCount);

        var consumers = Enumerable.Range(0, workerCount)
            .Select(i => ConsumeLoopAsync(i, stoppingToken));

        await Task.WhenAll(consumers);
    }

    private async Task ConsumeLoopAsync(int workerIndex, CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var jobId in _queue.DequeueAllAsync(stoppingToken))
            {
                try
                {
                    await ProcessJobAsync(workerIndex, jobId, stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Worker {Worker} hit an unhandled error processing job {JobId}", workerIndex, jobId);
                }
                finally
                {
                    _queue.Release(jobId);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Graceful shutdown.
        }
    }

    private async Task ProcessJobAsync(int workerIndex, Guid jobId, CancellationToken stoppingToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var jobService = scope.ServiceProvider.GetRequiredService<IJobService>();

        var job = await jobService.ClaimForProcessingAsync(jobId, stoppingToken);
        if (job == null)
        {
            // Not found, already terminal, or already claimed - nothing to do.
            return;
        }

        var attemptNumber = job.RetryCount + 1;
        _activity.MarkRunning(workerIndex, job.Id, job.JobType, attemptNumber);
        var succeeded = false;
        try
        {
            succeeded = await ExecuteClaimedJobAsync(jobService, job, attemptNumber, stoppingToken);
        }
        finally
        {
            _activity.MarkFinished(workerIndex, succeeded ? "COMPLETED" : "FAILED");
        }
    }

    private async Task<bool> ExecuteClaimedJobAsync(IJobService jobService, Models.Job job, int attemptNumber, CancellationToken stoppingToken)
    {
        var jobId = job.Id;
        var handler = _registry.Resolve(job.JobType);
        var startedAt = DateTime.UtcNow;
        var stopwatch = Stopwatch.StartNew();

        if (handler == null)
        {
            stopwatch.Stop();
            await jobService.RecordFailureAsync(
                jobId, attemptNumber, startedAt, DateTime.UtcNow, stopwatch.ElapsedMilliseconds,
                $"Unknown job type '{job.JobType}': no handler registered", null, stoppingToken);
            return false;
        }

        using var payloadDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(job.Payload) ? "{}" : job.Payload);
        var context = new JobExecutionContext
        {
            JobId = job.Id,
            AttemptNumber = attemptNumber,
            Payload = payloadDoc.RootElement.Clone()
        };

        try
        {
            await handler.ExecuteAsync(context, stoppingToken);
            stopwatch.Stop();
            await jobService.RecordSuccessAsync(jobId, attemptNumber, startedAt, DateTime.UtcNow, stopwatch.ElapsedMilliseconds, stoppingToken);
            return true;
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            await jobService.RecordFailureAsync(
                jobId, attemptNumber, startedAt, DateTime.UtcNow, stopwatch.ElapsedMilliseconds,
                ex.Message, ex.StackTrace, stoppingToken);
            return false;
        }
    }
}
