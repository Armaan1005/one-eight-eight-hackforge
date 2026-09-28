using JobProcessor.Api.DTOs;
using JobProcessor.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace JobProcessor.Api.Controllers;

[ApiController]
[Route("api/dead-letters")]
[Produces("application/json")]
public class DeadLettersController : ControllerBase
{
    private readonly IJobService _jobService;

    public DeadLettersController(IJobService jobService)
    {
        _jobService = jobService;
    }

    /// <summary>List all permanently-failed jobs that exhausted their retries.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<DeadLetterResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<DeadLetterResponse>>> List(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
        => Ok(await _jobService.ListDeadLettersAsync(page, pageSize, ct));

    /// <summary>Full failure history (all attempts) for a dead-lettered job.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(DeadLetterResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DeadLetterResponse>> Get(Guid id, CancellationToken ct)
    {
        var dl = await _jobService.GetDeadLetterAsync(id, ct);
        return dl == null ? NotFound(new { message = $"Dead-letter record '{id}' was not found" }) : Ok(dl);
    }

    /// <summary>
    /// Requeue a dead-lettered job. This creates a brand-new job (fresh ID, retry count
    /// reset to zero) with the same job type and payload, and enqueues it immediately.
    /// The original job and this dead-letter record are left untouched as permanent history.
    /// </summary>
    [HttpPost("{id:guid}/requeue")]
    [ProducesResponseType(typeof(JobResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<JobResponse>> Requeue(Guid id, CancellationToken ct)
    {
        var job = await _jobService.RequeueDeadLetterAsync(id, ct);
        if (job == null) return NotFound(new { message = $"Dead-letter record '{id}' was not found" });
        return CreatedAtAction("GetJob", "Jobs", new { id = job.Id }, job);
    }
}
