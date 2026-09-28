using System.Diagnostics;
using System.Text.Json;
using JobProcessor.Api.DTOs;
using JobProcessor.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace JobProcessor.Api.Controllers;

[ApiController]
[Route("api/demo")]
[Produces("application/json")]
public class DemoController : ControllerBase
{
    private static readonly string[] TerminalStatuses = { "COMPLETED", "DEAD_LETTER", "CANCELLED" };

    private static readonly DemoScenario[] Scenarios =
    {
        new("Happy path", "SuccessfulJob", null, null, "COMPLETED on attempt 1"),
        new("Transient failure, recovers", "FlakyJob", new { failuresBeforeSuccess = 2 }, null, "Fails twice, waits 2s then 4s, COMPLETED on attempt 3"),
        new("Permanent failure", "AlwaysFailJob", null, 3, "Fails 3 times, then DEAD_LETTER"),
        new("Long-running work", "DelayedJob", new { delaySeconds = 5 }, null, "Keeps one worker busy for 5s, then COMPLETED"),
        new("Unpredictable failure", "RandomFailureJob", new { failureRate = 0.5 }, null, "50% chance per attempt; usually COMPLETED, rarely DEAD_LETTER"),
    };

    private readonly IServiceScopeFactory _scopeFactory;

    public DemoController(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    /// <summary>
    /// One-click demo: submits one job for each path through the pipeline (success, retry-then-recover,
    /// dead letter, long-running, random) and, by default, waits for them all to finish and reports
    /// what happened to each, attempt by attempt.
    /// </summary>
    /// <param name="waitForResults">true: wait (up to maxWaitSeconds) and return final outcomes. false: return immediately after submitting, then watch the dashboard.</param>
    /// <param name="maxWaitSeconds">How long to wait for every job to reach a final state (5-60).</param>
    [HttpPost("run")]
    [ProducesResponseType(typeof(DemoRunResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<DemoRunResponse>> Run(
        [FromQuery] bool waitForResults = true,
        [FromQuery] int maxWaitSeconds = 30,
        CancellationToken ct = default)
    {
        var clock = Stopwatch.StartNew();
        var submitted = new List<(DemoScenario Scenario, Guid Id)>();

        using (var scope = _scopeFactory.CreateScope())
        {
            var jobs = scope.ServiceProvider.GetRequiredService<IJobService>();
            foreach (var s in Scenarios)
            {
                var job = await jobs.CreateJobAsync(new CreateJobRequest
                {
                    JobType = s.JobType,
                    Payload = s.Payload == null ? null : JsonSerializer.SerializeToElement(s.Payload),
                    MaxRetries = s.MaxRetries,
                }, ct);
                submitted.Add((s, job.Id));
            }
        }

        var results = await Snapshot(submitted, ct);
        if (waitForResults)
        {
            var deadline = TimeSpan.FromSeconds(Math.Clamp(maxWaitSeconds, 5, 60));
            while (clock.Elapsed < deadline && results.Any(r => !TerminalStatuses.Contains(r.FinalStatus)))
            {
                await Task.Delay(500, ct);
                results = await Snapshot(submitted, ct);
            }
        }

        var done = results.Count(r => TerminalStatuses.Contains(r.FinalStatus));
        return Ok(new DemoRunResponse
        {
            Summary = waitForResults
                ? $"{done}/{results.Count} jobs finished in {clock.Elapsed.TotalSeconds:F1}s: " +
                  $"{results.Count(r => r.FinalStatus == "COMPLETED")} completed, {results.Count(r => r.FinalStatus == "DEAD_LETTER")} dead-lettered" +
                  (done < results.Count ? " (others still running - check GET /api/jobs/{id})" : "")
                : $"Submitted {results.Count} jobs. Open the dashboard's Live Pipeline page or call GET /api/jobs/{{id}} to follow them.",
            ElapsedSeconds = Math.Round(clock.Elapsed.TotalSeconds, 1),
            Jobs = results,
        });
    }

    // Fresh scope per poll so EF's change tracker never hands back a stale cached entity.
    private async Task<List<DemoJobResult>> Snapshot(List<(DemoScenario Scenario, Guid Id)> submitted, CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var jobs = scope.ServiceProvider.GetRequiredService<IJobService>();
        var results = new List<DemoJobResult>();
        foreach (var (s, id) in submitted)
        {
            var job = await jobs.GetJobAsync(id, ct);
            results.Add(new DemoJobResult
            {
                Scenario = s.Name,
                JobType = s.JobType,
                JobId = id,
                Expected = s.Expected,
                FinalStatus = job?.Status ?? "UNKNOWN",
                Attempts = job?.Attempts.Count ?? 0,
                Timeline = job == null ? "" : Timeline(job),
                LastError = job?.LastError,
            });
        }
        return results;
    }

    private static string Timeline(JobDetailResponse job)
    {
        var parts = new List<string>();
        JobAttemptResponse? prev = null;
        foreach (var a in job.Attempts.OrderBy(a => a.AttemptNumber))
        {
            if (prev?.CompletedAt != null)
                parts.Add($"wait {(a.StartedAt - prev.CompletedAt.Value).TotalSeconds:F1}s");
            var ok = a.Outcome == "COMPLETED";
            parts.Add($"attempt {a.AttemptNumber} {(ok ? "succeeded" : "failed")} ({(a.DurationMs ?? 0) / 1000.0:F1}s)");
            prev = a;
        }
        parts.Add(job.Status);
        return string.Join(" -> ", parts);
    }

    private sealed record DemoScenario(string Name, string JobType, object? Payload, int? MaxRetries, string Expected);
}

public class DemoRunResponse
{
    public string Summary { get; set; } = string.Empty;
    public double ElapsedSeconds { get; set; }
    public List<DemoJobResult> Jobs { get; set; } = new();
}

public class DemoJobResult
{
    public string Scenario { get; set; } = string.Empty;
    public string JobType { get; set; } = string.Empty;
    public Guid JobId { get; set; }
    public string Expected { get; set; } = string.Empty;
    public string FinalStatus { get; set; } = string.Empty;
    public int Attempts { get; set; }
    public string Timeline { get; set; } = string.Empty;
    public string? LastError { get; set; }
}
