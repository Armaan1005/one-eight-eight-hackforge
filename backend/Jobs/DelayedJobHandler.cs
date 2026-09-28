namespace JobProcessor.Api.Jobs;

/// <summary>Sleeps for payload.delaySeconds (default 5, capped at 120) before succeeding.</summary>
public class DelayedJobHandler : IJobHandler
{
    public string JobType => "DelayedJob";

    public async Task ExecuteAsync(JobExecutionContext context, CancellationToken ct)
    {
        var delaySeconds = Math.Clamp(context.GetDouble("delaySeconds", 5), 0, 120);
        await Task.Delay(TimeSpan.FromSeconds(delaySeconds), ct);
    }
}
