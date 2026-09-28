using System.Text.Json;

namespace JobProcessor.Api.Jobs;

public class JobExecutionContext
{
    public required Guid JobId { get; init; }
    public required int AttemptNumber { get; init; }
    public required JsonElement Payload { get; init; }

    public int GetInt(string key, int fallback)
    {
        if (Payload.ValueKind == JsonValueKind.Object &&
            Payload.TryGetProperty(key, out var prop) &&
            prop.TryGetInt32(out var value))
        {
            return value;
        }
        return fallback;
    }

    public double GetDouble(string key, double fallback)
    {
        if (Payload.ValueKind == JsonValueKind.Object &&
            Payload.TryGetProperty(key, out var prop) &&
            prop.TryGetDouble(out var value))
        {
            return value;
        }
        return fallback;
    }
}
