namespace JobProcessor.Api.Jobs;

/// <summary>Resolves a job type name (as submitted via the API) to its registered handler.</summary>
public class JobHandlerRegistry
{
    private readonly Dictionary<string, IJobHandler> _handlers;

    public JobHandlerRegistry(IEnumerable<IJobHandler> handlers)
    {
        _handlers = handlers.ToDictionary(h => h.JobType, StringComparer.OrdinalIgnoreCase);
    }

    public IReadOnlyCollection<string> KnownJobTypes => _handlers.Keys;

    public bool IsKnown(string jobType) => _handlers.ContainsKey(jobType);

    public IJobHandler? Resolve(string jobType) => _handlers.GetValueOrDefault(jobType);
}
