using Microsoft.AspNetCore.SignalR;

namespace JobProcessor.Api.Hubs;

/// <summary>
/// Push channel for the dashboard. Server-to-client only (jobChanged, statsChanged) -
/// clients don't call back into this hub. The dashboard also polls on a timer as a
/// fallback in case the SignalR connection drops, so real-time updates are a
/// nice-to-have, not a hard dependency for correctness.
/// </summary>
public class JobsHub : Hub
{
}
