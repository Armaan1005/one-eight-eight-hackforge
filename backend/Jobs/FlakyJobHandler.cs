namespace JobProcessor.Api.Jobs;

/// <summary>Fails the first payload.failuresBeforeSuccess attempts (default 2), then succeeds. Demonstrates automatic recovery via retries.</summary>
public class FlakyJobHandler : IJobHandler
{
    public string JobType => "FlakyJob";

    public async Task ExecuteAsync(JobExecutionContext context, CancellationToken ct)
    {
        await Task.Delay(TimeSpan.FromMilliseconds(400), ct);
        var failuresBeforeSuccess = context.GetInt("failuresBeforeSuccess", 2);
        if (context.AttemptNumber <= failuresBeforeSuccess)
        {
            throw new InvalidOperationException(
                $"Simulated transient failure (attempt {context.AttemptNumber}, configured to fail first {failuresBeforeSuccess} attempts)");
        }
    }
}
