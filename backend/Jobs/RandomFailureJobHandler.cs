namespace JobProcessor.Api.Jobs;

/// <summary>Fails randomly based on payload.failureRate (0.0-1.0, default 0.5). Demonstrates unpredictable transient failures.</summary>
public class RandomFailureJobHandler : IJobHandler
{
    public string JobType => "RandomFailureJob";

    public async Task ExecuteAsync(JobExecutionContext context, CancellationToken ct)
    {
        await Task.Delay(TimeSpan.FromMilliseconds(400), ct);
        var failureRate = Math.Clamp(context.GetDouble("failureRate", 0.5), 0, 1);
        if (Random.Shared.NextDouble() < failureRate)
        {
            throw new InvalidOperationException($"Simulated random failure (failureRate={failureRate:P0})");
        }
    }
}
