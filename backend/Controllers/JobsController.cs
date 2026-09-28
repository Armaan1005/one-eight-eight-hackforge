using JobProcessor.Api.DTOs;
using JobProcessor.Api.Jobs;
using JobProcessor.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace JobProcessor.Api.Controllers;

[ApiController]
[Route("api/jobs")]
[Produces("application/json")]
public class JobsController : ControllerBase
{
    private readonly IJobService _jobService;
    private readonly JobHandlerRegistry _registry;

    public JobsController(IJobService jobService, JobHandlerRegistry registry)
    {
        _jobService = jobService;
        _registry = registry;
    }

    /// <summary>Registered demo job types that can be submitted to POST /api/jobs.</summary>
    [HttpGet("types")]
    [ProducesResponseType(typeof(IEnumerable<string>), StatusCodes.Status200OK)]
    public ActionResult<IEnumerable<string>> GetJobTypes() => Ok(_registry.KnownJobTypes);

    /// <summary>Submit a new job. It is persisted as QUEUED and immediately handed to the background queue.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(JobResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<JobResponse>> CreateJob([FromBody] CreateJobRequest request, CancellationToken ct)
    {
        try
        {
            var job = await _jobService.CreateJobAsync(request, ct);
            return CreatedAtAction(nameof(GetJob), new { id = job.Id }, job);
        }
        catch (ArgumentException ex)
        {
            return Problem(title: "Invalid job request", detail: ex.Message, statusCode: StatusCodes.Status400BadRequest);
        }
    }

    /// <summary>List jobs, optionally filtered by status (e.g. FAILED, COMPLETED) and/or job type, paginated.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<JobResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PagedResult<JobResponse>>> ListJobs(
        [FromQuery] string? status,
        [FromQuery] string? jobType,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        try
        {
            return Ok(await _jobService.ListJobsAsync(status, jobType, page, pageSize, ct));
        }
        catch (ArgumentException ex)
        {
            return Problem(title: "Invalid filter", detail: ex.Message, statusCode: StatusCodes.Status400BadRequest);
        }
    }

    /// <summary>Aggregate dashboard statistics across all jobs (used by the top stat cards).</summary>
    [HttpGet("stats")]
    [ProducesResponseType(typeof(StatsResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<StatsResponse>> GetStats(CancellationToken ct)
        => Ok(await _jobService.GetStatsAsync(ct));

    /// <summary>Full details of a single job, including its complete attempt history.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(JobDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<JobDetailResponse>> GetJob(Guid id, CancellationToken ct)
    {
        var job = await _jobService.GetJobAsync(id, ct);
        return job == null ? NotFound(new { message = $"Job '{id}' was not found" }) : Ok(job);
    }

    /// <summary>Just the attempt history for a job.</summary>
    [HttpGet("{id:guid}/attempts")]
    [ProducesResponseType(typeof(IEnumerable<JobAttemptResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<JobAttemptResponse>>> GetAttempts(Guid id, CancellationToken ct)
        => Ok(await _jobService.GetJobAttemptsAsync(id, ct));

    /// <summary>Clear history: permanently deletes every finished job (COMPLETED, DEAD_LETTER, CANCELLED) with its attempts and dead-letter record. Queued, running and retrying jobs are kept.</summary>
    [HttpDelete("finished")]
    [ProducesResponseType(typeof(ClearJobsResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ClearJobsResponse>> ClearFinished(CancellationToken ct)
        => Ok(new ClearJobsResponse { Deleted = await _jobService.ClearFinishedJobsAsync(ct) });

    /// <summary>Cancel a job that is still QUEUED or waiting to RETRY. Jobs already PROCESSING or terminal cannot be cancelled.</summary>
    [HttpPost("{id:guid}/cancel")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CancelJob(Guid id, CancellationToken ct)
    {
        try
        {
            var cancelled = await _jobService.CancelJobAsync(id, ct);
            return cancelled ? NoContent() : NotFound(new { message = $"Job '{id}' was not found" });
        }
        catch (InvalidOperationException ex)
        {
            return Problem(title: "Job cannot be cancelled", detail: ex.Message, statusCode: StatusCodes.Status409Conflict);
        }
    }
}
