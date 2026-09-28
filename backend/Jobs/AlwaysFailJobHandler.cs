namespace JobProcessor.Api.Jobs;

/// <summary>Always fails. Used to demonstrate the full retry -> exhaustion -> dead-letter path.</summary>
public class AlwaysFailJobHandler : IJobHandler
{
    public string JobType => "AlwaysFailJob";

    public async Task ExecuteAsync(JobExecutionContext context, CancellationToken ct)
    {
        await Task.Delay(TimeSpan.FromMilliseconds(400), ct);
        throw new InvalidOperationException("Simulated permanent failure: this job type always fails");
    }
}
