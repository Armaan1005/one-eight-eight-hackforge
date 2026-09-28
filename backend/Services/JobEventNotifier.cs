using JobProcessor.Api.DTOs;
using JobProcessor.Api.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace JobProcessor.Api.Services;

public class JobEventNotifier : IJobEventNotifier
{
    private readonly IHubContext<JobsHub> _hub;
    private readonly ILogger<JobEventNotifier> _logger;

    public JobEventNotifier(IHubContext<JobsHub> hub, ILogger<JobEventNotifier> logger)
    {
        _hub = hub;
        _logger = logger;
    }

    public async Task NotifyJobChangedAsync(JobSummaryEvent evt)
    {
        try
        {
            await _hub.Clients.All.SendAsync("jobChanged", evt);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast job change for {JobId}", evt.Id);
        }
    }

    public async Task NotifyStatsChangedAsync()
    {
        try
        {
            await _hub.Clients.All.SendAsync("statsChanged");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast stats change");
        }
    }
}
