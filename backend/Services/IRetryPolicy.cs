using JobProcessor.Api.Configuration;

namespace JobProcessor.Api.Services;

public interface IRetryPolicy
{
    /// <summary>Delay to wait before the next attempt, given how many failures have occurred so far.</summary>
    TimeSpan CalculateDelay(int failureCount);
}
