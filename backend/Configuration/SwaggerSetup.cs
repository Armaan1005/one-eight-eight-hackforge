using System.Reflection;
using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;
using Swashbuckle.AspNetCore.SwaggerUI;

namespace JobProcessor.Api.Configuration;

/// <summary>Swagger doc + UI setup, tuned for walking someone through the API live.</summary>
public static class SwaggerSetup
{
    private const string Description = """
        A reliable background job processor: **submit → queue → worker → retry with exponential backoff → dead letter**.

        ### One-click demo
        **Demo → `POST /api/demo/run`** → *Execute*. It submits one job for every path (success, retry-and-recover, dead letter, long-running, random), waits ~15s for them to finish, and returns what happened to each job, attempt by attempt. Keep the dashboard's Live Pipeline page open alongside to watch it happen.

        ### Step by step
        1. **Jobs → `POST /api/jobs`** → *Try it out* → pick an example from the dropdown → *Execute*. Copy the `id` from the response.
        2. **Jobs → `GET /api/jobs/{id}`** → paste the id → *Execute* a few times. Watch `status` move `QUEUED → PROCESSING → RETRYING → COMPLETED` and the `attempts` list grow.
        3. **System → `GET /api/system`** shows which worker is running what, the queue depth, and the retry backoff schedule.
        4. **Dead Letters → `GET /api/dead-letters`** lists jobs that failed every attempt; `POST …/requeue` gives one a second life.

        Every response is JSON. Errors use the standard `ProblemDetails` shape (`400`, `404`, `409`).
        """;

    private static readonly (string Name, string Description)[] Tags =
    {
        ("Demo", "Automated walkthrough: one call runs every scenario and reports the results."),
        ("Jobs", "Submit jobs, list and filter them, see full attempt history, cancel, and get dashboard stats."),
        ("DeadLetters", "Jobs that exhausted every retry. Inspect why they failed, or requeue them as a fresh job."),
        ("System", "Live view of the processing engine: worker activity, queue depth, retry policy."),
    };

    public static void AddJobProcessorSwagger(this IServiceCollection services)
    {
        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "Background Job Processor API",
                Version = "v1",
                Description = Description,
            });

            var xml = Path.Combine(AppContext.BaseDirectory, $"{Assembly.GetExecutingAssembly().GetName().Name}.xml");
            if (File.Exists(xml)) options.IncludeXmlComments(xml);

            options.DocumentFilter<TagDescriptionsFilter>();
            options.OperationFilter<CreateJobExamplesFilter>();
        });
    }

    public static void UseJobProcessorSwaggerUi(this WebApplication app)
    {
        app.UseSwagger();
        app.UseSwaggerUI(options =>
        {
            options.SwaggerEndpoint("/swagger/v1/swagger.json", "Background Job Processor API v1");
            options.DocumentTitle = "Job Processor API";
            options.InjectStylesheet("/swagger-ui/apple.css");
            options.DocExpansion(DocExpansion.List);
            options.DefaultModelsExpandDepth(-1);
            options.DefaultModelExpandDepth(3);
            options.EnableTryItOutByDefault();
            options.DisplayRequestDuration();
            options.EnableFilter();
            options.EnableDeepLinking();
        });
    }

    private sealed class TagDescriptionsFilter : IDocumentFilter
    {
        public void Apply(OpenApiDocument doc, DocumentFilterContext context)
        {
            doc.Tags = Tags.Select(t => new OpenApiTag { Name = t.Name, Description = t.Description }).ToList();
        }
    }

    /// <summary>Named examples for POST /api/jobs, one per pipeline path, selectable from a dropdown.</summary>
    private sealed class CreateJobExamplesFilter : IOperationFilter
    {
        public void Apply(OpenApiOperation operation, OperationFilterContext context)
        {
            if (context.ApiDescription.HttpMethod != "POST" || context.ApiDescription.RelativePath != "api/jobs") return;
            if (operation.RequestBody?.Content.TryGetValue("application/json", out var media) != true) return;

            media!.Examples = new Dictionary<string, OpenApiExample>
            {
                ["flaky"] = Example("Flaky — fails twice, then recovers", "Shows retries with 2s then 4s backoff, ending COMPLETED.",
                    new OpenApiObject { ["jobType"] = new OpenApiString("FlakyJob"), ["payload"] = new OpenApiObject { ["failuresBeforeSuccess"] = new OpenApiInteger(2) } }),
                ["success"] = Example("Successful — happy path", "Completes on the first attempt in ~0.5s.",
                    new OpenApiObject { ["jobType"] = new OpenApiString("SuccessfulJob") }),
                ["alwaysFail"] = Example("Always fails — ends in dead letter", "Fails all 3 attempts and moves to dead-letter storage (~7s).",
                    new OpenApiObject { ["jobType"] = new OpenApiString("AlwaysFailJob"), ["maxRetries"] = new OpenApiInteger(3) }),
                ["delayed"] = Example("Long running — keeps a worker busy", "Runs for 8 seconds; check GET /api/system while it runs.",
                    new OpenApiObject { ["jobType"] = new OpenApiString("DelayedJob"), ["payload"] = new OpenApiObject { ["delaySeconds"] = new OpenApiInteger(8) } }),
                ["random"] = Example("Random failure — 50% per attempt", "Each attempt is a coin flip.",
                    new OpenApiObject { ["jobType"] = new OpenApiString("RandomFailureJob"), ["payload"] = new OpenApiObject { ["failureRate"] = new OpenApiDouble(0.5) } }),
                ["invalid"] = Example("Invalid — unknown job type (400)", "Shows the ProblemDetails error response.",
                    new OpenApiObject { ["jobType"] = new OpenApiString("NoSuchJob") }),
            };
        }

        private static OpenApiExample Example(string summary, string description, IOpenApiAny value) =>
            new() { Summary = summary, Description = description, Value = value };
    }
}
