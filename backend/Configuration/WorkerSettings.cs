namespace JobProcessor.Api.Configuration;

public class WorkerSettings
{
    public int WorkerCount { get; set; } = 3;
    public int RetryScanIntervalSeconds { get; set; } = 1;
}
