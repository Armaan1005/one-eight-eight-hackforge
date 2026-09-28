using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace JobProcessor.Api.DTOs;

/// <summary>Request body for POST /api/jobs.</summary>
public class CreateJobRequest
{
    /// <summary>One of the registered demo job types. See GET /api/jobs/types for the full list.</summary>
    [Required]
    public string JobType { get; set; } = string.Empty;

    /// <summary>Arbitrary JSON object interpreted by the chosen job type (e.g. failuresBeforeSuccess, delaySeconds, failureRate).</summary>
    public JsonElement? Payload { get; set; }

    /// <summary>Overrides the globally configured maximum retry count for this job only.</summary>
    [Range(1, 20)]
    public int? MaxRetries { get; set; }

    public int Priority { get; set; } = 0;
}
