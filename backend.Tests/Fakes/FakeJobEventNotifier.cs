using JobProcessor.Api.DTOs;
using JobProcessor.Api.Services;

namespace JobProcessor.Api.Tests.Fakes;

public class FakeJobEventNotifier : IJobEventNotifier
{
    public List<JobSummaryEvent> Events { get; } = new();
    public int StatsChangedCount { get; private set; }

    public Task NotifyJobChangedAsync(JobSummaryEvent evt)
    {
        Events.Add(evt);
        return Task.CompletedTask;
    }

    public Task NotifyStatsChangedAsync()
    {
        StatsChangedCount++;
        return Task.CompletedTask;
    }
}
