using System.Runtime.CompilerServices;
using JobProcessor.Api.Queue;

namespace JobProcessor.Api.Tests.Fakes;

public class FakeBackgroundJobQueue : IBackgroundJobQueue
{
    public List<Guid> Enqueued { get; } = new();

    public bool TryEnqueue(Guid jobId)
    {
        Enqueued.Add(jobId);
        return true;
    }

    public Task<bool> EnqueueAsync(Guid jobId, CancellationToken ct = default)
    {
        Enqueued.Add(jobId);
        return Task.FromResult(true);
    }

    public async IAsyncEnumerable<Guid> DequeueAllAsync([EnumeratorCancellation] CancellationToken ct)
    {
        await Task.CompletedTask;
        yield break;
    }

    public void Release(Guid jobId) { }

    public bool IsInFlight(Guid jobId) => false;

    public int InFlightCount => 0;
}
