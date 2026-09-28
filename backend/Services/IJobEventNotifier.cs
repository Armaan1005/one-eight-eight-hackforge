using JobProcessor.Api.DTOs;

namespace JobProcessor.Api.Services;

public interface IJobEventNotifier
{
    Task NotifyJobChangedAsync(JobSummaryEvent evt);
    Task NotifyStatsChangedAsync();
}
