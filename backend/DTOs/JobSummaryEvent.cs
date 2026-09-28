namespace JobProcessor.Api.DTOs;

/// <summary>Small payload pushed over SignalR whenever a job is created or changes status.</summary>
public class JobSummaryEvent
{
    public Guid Id { get; set; }
    public string JobType { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public int RetryCount { get; set; }
    public int MaxRetries { get; set; }
    public DateTime? NextRetryAt { get; set; }
    public string? LastError { get; set; }
    public string EventType { get; set; } = string.Empty;
}
