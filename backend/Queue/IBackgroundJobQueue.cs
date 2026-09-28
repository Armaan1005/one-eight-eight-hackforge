namespace JobProcessor.Api.Queue;

/// <summary>
/// Thread-safe in-process queue of job IDs ready to be worked on.
/// Also tracks which job IDs are currently queued or being processed so the
/// same job is never handed to two workers at once (see BackgroundJobQueue).
/// </summary>
public interface IBackgroundJobQueue
{
    /// <summary>Enqueue a job for processing. Returns false if it is already queued or in-flight.</summary>
    bool TryEnqueue(Guid jobId);

    Task<bool> EnqueueAsync(Guid jobId, CancellationToken ct = default);

    /// <summary>Stream of job IDs to process. Safe to consume from multiple concurrent workers.</summary>
    IAsyncEnumerable<Guid> DequeueAllAsync(CancellationToken ct);

    /// <summary>Must be called once a job has finished being handled, whatever the outcome.</summary>
    void Release(Guid jobId);

    bool IsInFlight(Guid jobId);

    int InFlightCount { get; }
}
