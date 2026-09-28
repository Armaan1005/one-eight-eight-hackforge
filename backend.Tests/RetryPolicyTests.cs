using JobProcessor.Api.Configuration;
using JobProcessor.Api.Services;
using Microsoft.Extensions.Options;
using Xunit;

namespace JobProcessor.Api.Tests;

public class RetryPolicyTests
{
    private static RetryPolicy CreatePolicy(RetrySettings settings) => new(Options.Create(settings));

    [Theory]
    [InlineData(1, 2)]
    [InlineData(2, 4)]
    [InlineData(3, 8)]
    [InlineData(4, 16)]
    [InlineData(5, 32)]
    public void CalculateDelay_FollowsExponentialBackoff(int failureCount, double expectedSeconds)
    {
        var policy = CreatePolicy(new RetrySettings { InitialDelaySeconds = 2, BackoffMultiplier = 2, MaxDelaySeconds = 60, UseJitter = false });

        var delay = policy.CalculateDelay(failureCount);

        Assert.Equal(expectedSeconds, delay.TotalSeconds, 3);
    }

    [Fact]
    public void CalculateDelay_CapsAtMaxDelaySeconds()
    {
        var policy = CreatePolicy(new RetrySettings { InitialDelaySeconds = 2, BackoffMultiplier = 2, MaxDelaySeconds = 10, UseJitter = false });

        var delay = policy.CalculateDelay(10); // uncapped this would be 2*2^9 = 1024s

        Assert.Equal(10, delay.TotalSeconds, 3);
    }

    [Fact]
    public void CalculateDelay_TreatsNonPositiveFailureCountAsOne()
    {
        var policy = CreatePolicy(new RetrySettings { InitialDelaySeconds = 2, BackoffMultiplier = 2, MaxDelaySeconds = 60, UseJitter = false });

        var delay = policy.CalculateDelay(0);

        Assert.Equal(2, delay.TotalSeconds, 3);
    }

    [Fact]
    public void CalculateDelay_WithJitter_StaysWithinExpectedRange()
    {
        var policy = CreatePolicy(new RetrySettings { InitialDelaySeconds = 10, BackoffMultiplier = 2, MaxDelaySeconds = 60, UseJitter = true });

        var delay = policy.CalculateDelay(1); // base 10s, jitter +/-20% => [8,12]

        Assert.InRange(delay.TotalSeconds, 7.9, 12.1);
    }
}
