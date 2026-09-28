using JobProcessor.Api.DTOs;
using JobProcessor.Api.Hubs;
using JobProcessor.Api.Queue;
using Microsoft.AspNetCore.SignalR;

namespace JobProcessor.Api.Services;

/// <summary>
/// In-memory view of what each worker loop and the retry scanner are doing right now,
/// so the dashboard can show the pipeline live. Observability only - nothing in the
/// processing path reads from it. Every change is pushed as a "workersChanged" SignalR event
/// because demo jobs finish in ~0.5s, faster than any sensible polling interval.
/// </summary>
public class WorkerActivityTracker
{
    private readonly object _gate = new();
    private readonly IHubContext<JobsHub> _hub;
    private readonly IBackgroundJobQueue _queue;
    private readonly ILogger<WorkerActivityTracker> _logger;
    private WorkerSlotDto[] _slots = Array.Empty<WorkerSlotDto>();
    private DateTime? _lastRetryScanAt;
    private int _lastRetryScanEnqueued;
    private DateTime? _lastRetryEnqueueAt;

    public WorkerActivityTracker(IHubContext<JobsHub> hub, IBackgroundJobQueue queue, ILogger<WorkerActivityTracker> logger)
    {
        _hub = hub;
        _queue = queue;
        _logger = logger;
    }

    public DateTime StartedAt { get; } = DateTime.UtcNow;

    public void RegisterWorkers(int count)
    {
        lock (_gate)
        {
            _slots = Enumerable.Range(0, count).Select(i => new WorkerSlotDto { WorkerIndex = i, State = "IDLE" }).ToArray();
        }
        Broadcast();
    }

    public void MarkRunning(int workerIndex, Guid jobId, string jobType, int attemptNumber)
    {
        lock (_gate)
        {
            var slot = _slots[workerIndex];
            slot.State = "RUNNING";
            slot.JobId = jobId;
            slot.JobType = jobType;
            slot.AttemptNumber = attemptNumber;
            slot.StartedAt = DateTime.UtcNow;
        }
        Broadcast();
    }

    public void MarkFinished(int workerIndex, string outcome)
    {
        lock (_gate)
        {
            var slot = _slots[workerIndex];
            slot.LastJobId = slot.JobId;
            slot.LastJobType = slot.JobType;
            slot.LastAttemptNumber = slot.AttemptNumber;
            slot.LastOutcome = outcome;
            slot.LastFinishedAt = DateTime.UtcNow;
            slot.LastDurationMs = slot.StartedAt.HasValue ? (long)(DateTime.UtcNow - slot.StartedAt.Value).TotalMilliseconds : null;
            slot.ProcessedCount++;
            slot.State = "IDLE";
            slot.JobId = null;
            slot.JobType = null;
            slot.AttemptNumber = null;
            slot.StartedAt = null;
        }
        Broadcast();
    }

    public void RecordRetryScan(int enqueued)
    {
        lock (_gate)
        {
            _lastRetryScanAt = DateTime.UtcNow;
            if (enqueued > 0)
            {
                _lastRetryScanEnqueued = enqueued;
                _lastRetryEnqueueAt = _lastRetryScanAt;
            }
        }
        // Only broadcast scans that did something, otherwise every client gets a message per second.
        if (enqueued > 0) Broadcast();
    }

    public WorkersSnapshot Snapshot()
    {
        lock (_gate)
        {
            var workers = _slots.Select(s => s.Clone()).ToList();
            var running = workers.Count(w => w.State == "RUNNING");
            return new WorkersSnapshot
            {
                Workers = workers,
                InFlight = _queue.InFlightCount,
                QueueDepth = Math.Max(0, _queue.InFlightCount - running),
                LastRetryScanAt = _lastRetryScanAt,
                LastRetryScanEnqueued = _lastRetryScanEnqueued,
                LastRetryEnqueueAt = _lastRetryEnqueueAt,
            };
        }
    }

    private void Broadcast()
    {
        var snapshot = Snapshot();
        _ = BroadcastAsync(snapshot);
    }

    private async Task BroadcastAsync(WorkersSnapshot snapshot)
    {
        try
        {
            await _hub.Clients.All.SendAsync("workersChanged", snapshot);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast worker activity");
        }
    }
}
