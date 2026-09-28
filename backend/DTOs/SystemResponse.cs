namespace JobProcessor.Api.DTOs;

public class WorkerSlotDto
{
    public int WorkerIndex { get; set; }
    public string State { get; set; } = "IDLE";
    public Guid? JobId { get; set; }
    public string? JobType { get; set; }
    public int? AttemptNumber { get; set; }
    public DateTime? StartedAt { get; set; }
    public int ProcessedCount { get; set; }
    public Guid? LastJobId { get; set; }
    public string? LastJobType { get; set; }
    public int? LastAttemptNumber { get; set; }
    public string? LastOutcome { get; set; }
    public DateTime? LastFinishedAt { get; set; }
    public long? LastDurationMs { get; set; }

    public WorkerSlotDto Clone() => (WorkerSlotDto)MemberwiseClone();
}

/// <summary>Pushed over SignalR as "workersChanged" and embedded in GET /api/system.</summary>
public class WorkersSnapshot
{
    public List<WorkerSlotDto> Workers { get; set; } = new();
    public int QueueDepth { get; set; }
    public int InFlight { get; set; }
    public DateTime? LastRetryScanAt { get; set; }
    public int LastRetryScanEnqueued { get; set; }
    public DateTime? LastRetryEnqueueAt { get; set; }
}

public class SystemResponse
{
    public DateTime StartedAt { get; set; }
    public int WorkerCount { get; set; }
    public int RetryScanIntervalSeconds { get; set; }
    public int DefaultMaxRetries { get; set; }
    public double InitialDelaySeconds { get; set; }
    public double BackoffMultiplier { get; set; }
    public double MaxDelaySeconds { get; set; }
    public bool UseJitter { get; set; }
    /// <summary>Delay before retry N+1 after the Nth failure, for N = 1..DefaultMaxRetries-1.</summary>
    public List<double> BackoffScheduleSeconds { get; set; } = new();
    public WorkersSnapshot Activity { get; set; } = new();
}
