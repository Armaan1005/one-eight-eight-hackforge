namespace JobProcessor.Api.Models;

public class DeadLetterJob
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OriginalJobId { get; set; }
    public string JobType { get; set; } = string.Empty;
    public string Payload { get; set; } = "{}";
    public int RetryCount { get; set; }
    public int MaxRetries { get; set; }
    public string? FinalError { get; set; }
    public string FailureReason { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime DeadLetteredAt { get; set; } = DateTime.UtcNow;
}
