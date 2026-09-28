namespace JobProcessor.Api.Models;

public enum AttemptOutcome
{
    Succeeded,
    Failed
}

public static class AttemptOutcomeNames
{
    public static string ToWire(this AttemptOutcome outcome) => outcome switch
    {
        AttemptOutcome.Succeeded => "COMPLETED",
        AttemptOutcome.Failed => "FAILED",
        _ => outcome.ToString().ToUpperInvariant()
    };

    public static AttemptOutcome FromWire(string value) => value.ToUpperInvariant() switch
    {
        "COMPLETED" => AttemptOutcome.Succeeded,
        "SUCCEEDED" => AttemptOutcome.Succeeded,
        "FAILED" => AttemptOutcome.Failed,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, "Unknown attempt outcome")
    };
}
