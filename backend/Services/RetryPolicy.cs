using JobProcessor.Api.Configuration;
using Microsoft.Extensions.Options;

namespace JobProcessor.Api.Services;

/// <summary>
/// Exponential backoff: delay = InitialDelaySeconds * BackoffMultiplier^(failureCount-1), capped at MaxDelaySeconds.
/// Example with defaults (Initial=2, Multiplier=2, Max=60): 2s, 4s, 8s, 16s, 32s, 60s, 60s, ...
/// Optional jitter (+/-20%) can be enabled via RetrySettings.UseJitter to avoid synchronized retry storms;
/// it is off by default so demo timing stays predictable.
/// </summary>
public class RetryPolicy : IRetryPolicy
{
    private readonly RetrySettings _settings;

    public RetryPolicy(IOptions<RetrySettings> settings)
    {
        _settings = settings.Value;
    }

    public TimeSpan CalculateDelay(int failureCount)
    {
        if (failureCount < 1) failureCount = 1;

        var rawSeconds = _settings.InitialDelaySeconds * Math.Pow(_settings.BackoffMultiplier, failureCount - 1);
        var cappedSeconds = Math.Min(rawSeconds, _settings.MaxDelaySeconds);

        if (_settings.UseJitter)
        {
            var jitterFactor = 0.8 + (Random.Shared.NextDouble() * 0.4); // +/-20%
            cappedSeconds = Math.Min(cappedSeconds * jitterFactor, _settings.MaxDelaySeconds);
        }

        return TimeSpan.FromSeconds(cappedSeconds);
    }
}
