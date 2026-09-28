namespace JobProcessor.Api.Models;

public enum JobStatus
{
    Queued,
    Processing,
    Completed,
    Failed,
    Retrying,
    DeadLetter,
    Cancelled
}

public static class JobStatusNames
{
    public static string ToWire(this JobStatus status) => status switch
    {
        JobStatus.Queued => "QUEUED",
        JobStatus.Processing => "PROCESSING",
        JobStatus.Completed => "COMPLETED",
        JobStatus.Failed => "FAILED",
        JobStatus.Retrying => "RETRYING",
        JobStatus.DeadLetter => "DEAD_LETTER",
        JobStatus.Cancelled => "CANCELLED",
        _ => status.ToString().ToUpperInvariant()
    };

    public static JobStatus FromWire(string value) => value.ToUpperInvariant() switch
    {
        "QUEUED" => JobStatus.Queued,
        "PROCESSING" => JobStatus.Processing,
        "COMPLETED" => JobStatus.Completed,
        "FAILED" => JobStatus.Failed,
        "RETRYING" => JobStatus.Retrying,
        "DEAD_LETTER" => JobStatus.DeadLetter,
        "CANCELLED" => JobStatus.Cancelled,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, "Unknown job status")
    };
}
