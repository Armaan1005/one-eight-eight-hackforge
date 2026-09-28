namespace JobProcessor.Api.Configuration;

public class RetrySettings
{
    public int MaxRetries { get; set; } = 5;
    public double InitialDelaySeconds { get; set; } = 2;
    public double BackoffMultiplier { get; set; } = 2;
    public double MaxDelaySeconds { get; set; } = 60;
    public bool UseJitter { get; set; } = false;
}
