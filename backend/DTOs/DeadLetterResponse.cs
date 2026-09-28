namespace JobProcessor.Api.DTOs;

public class DeadLetterResponse
{
    public Guid Id { get; set; }
    public Guid OriginalJobId { get; set; }
    public string JobType { get; set; } = string.Empty;
    public string Payload { get; set; } = "{}";
    public int RetryCount { get; set; }
    public int MaxRetries { get; set; }
    public string? FinalError { get; set; }
    public string FailureReason { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime DeadLetteredAt { get; set; }
    public List<JobAttemptResponse> Attempts { get; set; } = new();
}
