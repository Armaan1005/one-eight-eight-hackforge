namespace JobProcessor.Api.Jobs;

/// <summary>A demo job type's execution logic. Throw to signal failure; return normally to signal success.</summary>
public interface IJobHandler
{
    string JobType { get; }
    Task ExecuteAsync(JobExecutionContext context, CancellationToken ct);
}
