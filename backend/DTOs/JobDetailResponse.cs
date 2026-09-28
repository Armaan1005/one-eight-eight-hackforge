namespace JobProcessor.Api.DTOs;

public class JobDetailResponse : JobResponse
{
    public string Payload { get; set; } = "{}";
    public string? FailureReason { get; set; }
    public List<JobAttemptResponse> Attempts { get; set; } = new();
}
