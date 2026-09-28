using System.Collections.Concurrent;
using System.Threading.Channels;

namespace JobProcessor.Api.Queue;

/// <summary>
/// Channel-backed job queue. The in-flight dictionary is what prevents a job
/// from being processed twice concurrently within this process: a job ID can
/// only be enqueued while it is not already tracked, and it is only released
/// once a worker has fully finished handling it (success, retry scheduled, or
/// dead-lettered). This is a single-process guarantee only - see README for
/// the documented limitation if this were ever scaled out horizontally.
/// </summary>
public class BackgroundJobQueue : IBackgroundJobQueue
{
    private readonly Channel<Guid> _channel = Channel.CreateUnbounded<Guid>(new UnboundedChannelOptions
    {
        SingleReader = false,
        SingleWriter = false
    });

    private readonly ConcurrentDictionary<Guid, byte> _inFlight = new();
    private readonly ILogger<BackgroundJobQueue> _logger;

    public BackgroundJobQueue(ILogger<BackgroundJobQueue> logger)
    {
        _logger = logger;
    }

    public int InFlightCount => _inFlight.Count;

    public bool IsInFlight(Guid jobId) => _inFlight.ContainsKey(jobId);

    public bool TryEnqueue(Guid jobId)
    {
        if (!_inFlight.TryAdd(jobId, 0))
        {
            _logger.LogDebug("Job {JobId} is already queued or in-flight; skipping duplicate enqueue", jobId);
            return false;
        }

        if (!_channel.Writer.TryWrite(jobId))
        {
            _inFlight.TryRemove(jobId, out _);
            return false;
        }

        return true;
    }

    public async Task<bool> EnqueueAsync(Guid jobId, CancellationToken ct = default)
    {
        if (!_inFlight.TryAdd(jobId, 0))
        {
            return false;
        }

        await _channel.Writer.WriteAsync(jobId, ct);
        return true;
    }

    public IAsyncEnumerable<Guid> DequeueAllAsync(CancellationToken ct) => _channel.Reader.ReadAllAsync(ct);

    public void Release(Guid jobId) => _inFlight.TryRemove(jobId, out _);
}
