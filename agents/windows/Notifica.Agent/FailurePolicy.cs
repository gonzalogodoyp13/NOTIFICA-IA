using System.Text.Json;

namespace Notifica.Agent;

internal static class FailurePolicy
{
    internal const int MaximumTransportAttempts = 6;
    internal static TimeSpan Delay(int attempt) => TimeSpan.FromSeconds(Math.Min(300, 15 * Math.Pow(2, Math.Clamp(attempt - 1, 0, 10))));
    internal static string SigningCode(string? error) => error switch {
        "PinIncorrect" => "PIN_INCORRECT", "PinLocked" => "PIN_LOCKED", "PinExpired" => "PIN_EXPIRED",
        "TokenMissing" or "TokenRemoved" => "TOKEN_MISSING", "DriverFailure" => "DRIVER_ERROR",
        "TimestampUnavailable" => "TSA_UNAVAILABLE", "RevocationUnavailable" => "REVOCATION_UNAVAILABLE",
        "ValidationFailed" or "SignatureInvalid" => "VALIDATION_FAILED", "InputChanged" => "CHECKSUM_MISMATCH",
        _ => "OUTCOME_UNKNOWN"
    };
    internal static string TransferCode(Exception error) => error switch {
        ApiFailure api when api.Code == "AGENT_UPDATE_REQUIRED" => api.Code,
        IOException when error.Message == "LOCAL_CONFLICT" => "LOCAL_CONFLICT",
        UnauthorizedAccessException or IOException => "DISK",
        InvalidOperationException when error.Message == "CHECKSUM_MISMATCH" => "CHECKSUM_MISMATCH",
        ApiFailure api when api.Code is "VALIDATION_FAILED" or "CERT_REVOKED" or "CHECKSUM_MISMATCH" => api.Code,
        HttpRequestException or ApiFailure or OperationCanceledException or DeliveryAcknowledgementUncertain => "NETWORK",
        _ => "UNKNOWN"
    };
    // Fixed codes only; bounded local diagnostics, never exception strings or PINs.
    internal static void Log(Configuration config, string code, Guid correlationId)
    {
        try {
            if (!Allowed.Contains(code)) code = "UNKNOWN";
            string path = Path.Combine(config.DataDirectory, "operations.jsonl");
            Signing.LocalSigningFiles.RequireLocalPath(path);
            lock (Gate) {
                string previous = path + ".previous";
                Signing.LocalSigningFiles.RequireLocalPath(previous);
                if (File.Exists(previous) && File.GetCreationTimeUtc(previous) < DateTime.UtcNow.AddDays(-30)) File.Delete(previous);
                if (File.Exists(path) && File.GetCreationTimeUtc(path) < DateTime.UtcNow.AddDays(-30)) File.Delete(path);
                if (File.Exists(path) && new FileInfo(path).Length >= 1024 * 1024) File.Move(path, previous, true);
                File.AppendAllText(path, JsonSerializer.Serialize(new { code, correlationId, at = DateTimeOffset.UtcNow }) + Environment.NewLine);
            }
        } catch { /* Failure remains in heartbeat; diagnostics cannot kill the worker. */ }
    }
    private static readonly object Gate = new();
    private static readonly HashSet<string> Allowed = ["AGENT_UPDATE_REQUIRED", "NETWORK", "STORAGE", "DISK", "CHECKSUM_MISMATCH", "LOCAL_CONFLICT", "UNKNOWN", "OUTCOME_UNKNOWN", "PIN_INCORRECT", "PIN_LOCKED", "PIN_EXPIRED", "TSA_UNAVAILABLE", "REVOCATION_UNAVAILABLE", "VALIDATION_FAILED", "DRIVER_ERROR", "TOKEN_MISSING", "CERT_REVOKED"];
}
