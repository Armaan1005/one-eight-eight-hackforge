namespace JobProcessor.Api.DTOs;

public class StatsResponse
{
    public int Total { get; set; }
    public int Queued { get; set; }
    public int Processing { get; set; }
    public int Completed { get; set; }
    public int Retrying { get; set; }
    public int Failed { get; set; }
    public int DeadLetter { get; set; }
    public int Cancelled { get; set; }
    public double SuccessRatePercent { get; set; }
    public double? AverageProcessingTimeMs { get; set; }
}
