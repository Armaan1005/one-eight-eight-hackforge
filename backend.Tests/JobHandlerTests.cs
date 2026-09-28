using System.Text.Json;
using JobProcessor.Api.Jobs;
using Xunit;

namespace JobProcessor.Api.Tests;

public class FlakyJobHandlerTests
{
    [Fact]
    public async Task ExecuteAsync_FailsForConfiguredAttemptsThenSucceeds()
    {
        var handler = new FlakyJobHandler();
        var payload = JsonDocument.Parse("""{"failuresBeforeSuccess":2}""").RootElement;

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.ExecuteAsync(new JobExecutionContext { JobId = Guid.NewGuid(), AttemptNumber = 1, Payload = payload }, CancellationToken.None));

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.ExecuteAsync(new JobExecutionContext { JobId = Guid.NewGuid(), AttemptNumber = 2, Payload = payload }, CancellationToken.None));

        // Third attempt succeeds - this is the exact "automatic recovery" scenario from the demo script.
        await handler.ExecuteAsync(new JobExecutionContext { JobId = Guid.NewGuid(), AttemptNumber = 3, Payload = payload }, CancellationToken.None);
    }
}

public class AlwaysFailJobHandlerTests
{
    [Fact]
    public async Task ExecuteAsync_AlwaysThrows()
    {
        var handler = new AlwaysFailJobHandler();
        var payload = JsonDocument.Parse("{}").RootElement;

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.ExecuteAsync(new JobExecutionContext { JobId = Guid.NewGuid(), AttemptNumber = 1, Payload = payload }, CancellationToken.None));
    }
}

public class JobHandlerRegistryTests
{
    [Fact]
    public void IsKnown_ReturnsFalseForUnregisteredType()
    {
        var registry = new JobHandlerRegistry(new IJobHandler[] { new SuccessfulJobHandler() });

        Assert.True(registry.IsKnown("SuccessfulJob"));
        Assert.False(registry.IsKnown("SomethingElse"));
        Assert.Null(registry.Resolve("SomethingElse"));
    }
}
