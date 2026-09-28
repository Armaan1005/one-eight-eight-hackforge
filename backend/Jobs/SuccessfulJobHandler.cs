namespace JobProcessor.Api.Jobs;

/// <summary>Always succeeds. Simulates a small amount of work.</summary>
public class SuccessfulJobHandler : IJobHandler
{
    public string JobType => "SuccessfulJob";

    public async Task ExecuteAsync(JobExecutionContext context, CancellationToken ct)
    {
        await Task.Delay(TimeSpan.FromMilliseconds(500), ct);
    }
}
