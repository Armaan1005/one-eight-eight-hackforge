namespace JobProcessor.Api.Models;

public class JobAttempt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid JobId { get; set; }
    public Job? Job { get; set; }

    public int AttemptNumber { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public AttemptOutcome Outcome { get; set; }
    public string? ErrorMessage { get; set; }
    public string? StackTrace { get; set; }
    public long? DurationMs { get; set; }
}
