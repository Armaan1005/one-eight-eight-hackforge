using JobProcessor.Api.Configuration;
using JobProcessor.Api.Data;
using JobProcessor.Api.Hubs;
using JobProcessor.Api.Jobs;
using JobProcessor.Api.Queue;
using JobProcessor.Api.Services;
using JobProcessor.Api.Workers;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---- Configuration ----
builder.Services.Configure<RetrySettings>(builder.Configuration.GetSection("RetrySettings"));
builder.Services.Configure<WorkerSettings>(builder.Configuration.GetSection("WorkerSettings"));

// ---- Persistence ----
var connectionString = builder.Configuration.GetConnectionString("Default") ?? "Data Source=jobprocessor.db";
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connectionString));

// ---- Queue + core services ----
builder.Services.AddSingleton<IBackgroundJobQueue, BackgroundJobQueue>();
builder.Services.AddSingleton<IRetryPolicy, RetryPolicy>();
builder.Services.AddSingleton<IJobEventNotifier, JobEventNotifier>();
builder.Services.AddSingleton<WorkerActivityTracker>();
builder.Services.AddScoped<IJobService, JobService>();

// ---- Demo job handlers ----
builder.Services.AddSingleton<IJobHandler, SuccessfulJobHandler>();
builder.Services.AddSingleton<IJobHandler, RandomFailureJobHandler>();
builder.Services.AddSingleton<IJobHandler, AlwaysFailJobHandler>();
builder.Services.AddSingleton<IJobHandler, DelayedJobHandler>();
builder.Services.AddSingleton<IJobHandler, FlakyJobHandler>();
builder.Services.AddSingleton<JobHandlerRegistry>();

// ---- Background processing ----
builder.Services.AddHostedService<JobWorker>();
builder.Services.AddHostedService<RetryScannerService>();

// ---- Web / API ----
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddJobProcessorSwagger();
builder.Services.AddSignalR();

var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173" };

builder.Services.AddCors(options =>
{
    options.AddPolicy("Dashboard", policy => policy
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});

var app = builder.Build();

// ---- Apply migrations + tune SQLite for concurrent access on startup ----
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
}

app.UseStaticFiles();
app.UseJobProcessorSwaggerUi();

app.UseExceptionHandler();

app.UseCors("Dashboard");
app.UseAuthorization();

app.MapControllers();
app.MapHub<JobsHub>("/hubs/jobs");
app.MapGet("/", () => Results.Redirect("/swagger"));

app.Run();

// Exposed for WebApplicationFactory-based integration tests.
public partial class Program { }
