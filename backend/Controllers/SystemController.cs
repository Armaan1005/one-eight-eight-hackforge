using JobProcessor.Api.Configuration;
using JobProcessor.Api.DTOs;
using JobProcessor.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace JobProcessor.Api.Controllers;

[ApiController]
[Route("api/system")]
[Produces("application/json")]
public class SystemController : ControllerBase
{
    private readonly WorkerActivityTracker _activity;
    private readonly IRetryPolicy _retryPolicy;
    private readonly RetrySettings _retry;
    private readonly WorkerSettings _workers;

    public SystemController(
        WorkerActivityTracker activity,
        IRetryPolicy retryPolicy,
        IOptions<RetrySettings> retry,
        IOptions<WorkerSettings> workers)
    {
        _activity = activity;
        _retryPolicy = retryPolicy;
        _retry = retry.Value;
        _workers = workers.Value;
    }

    /// <summary>Live view of the processing pipeline: worker slots, queue depth, retry scanner and retry policy.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(SystemResponse), StatusCodes.Status200OK)]
    public ActionResult<SystemResponse> Get() => Ok(new SystemResponse
    {
        StartedAt = _activity.StartedAt,
        WorkerCount = Math.Max(1, _workers.WorkerCount),
        RetryScanIntervalSeconds = Math.Max(1, _workers.RetryScanIntervalSeconds),
        DefaultMaxRetries = _retry.MaxRetries,
        InitialDelaySeconds = _retry.InitialDelaySeconds,
        BackoffMultiplier = _retry.BackoffMultiplier,
        MaxDelaySeconds = _retry.MaxDelaySeconds,
        UseJitter = _retry.UseJitter,
        BackoffScheduleSeconds = Enumerable.Range(1, Math.Max(0, _retry.MaxRetries - 1))
            .Select(n => _retryPolicy.CalculateDelay(n).TotalSeconds)
            .ToList(),
        Activity = _activity.Snapshot(),
    });
}
