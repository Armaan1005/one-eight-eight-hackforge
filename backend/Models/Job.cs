namespace JobProcessor.Api.Models;

public class Job
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string JobType { get; set; } = string.Empty;
    public string Payload { get; set; } = "{}";
    public JobStatus Status { get; set; } = JobStatus.Queued;
    public int RetryCount { get; set; }
    public int MaxRetries { get; set; }
    public int Priority { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime? LastAttemptAt { get; set; }
    public DateTime? NextRetryAt { get; set; }

    public string? LastError { get; set; }
    public string? FailureReason { get; set; }

    public List<JobAttempt> Attempts { get; set; } = new();
}
