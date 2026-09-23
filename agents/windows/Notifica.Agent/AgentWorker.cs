using System.Diagnostics;
using System.Text.Json;

namespace Notifica.Agent;

internal sealed class AgentWorker : IDisposable
{
    private readonly Configuration config;
    private readonly string configPath;
    private readonly DeviceKey key;
    private readonly DeviceApi api;
    private readonly SemaphoreSlim operations = new(1);
    private Identity? identity;
    private DateTimeOffset? lastContact;
    internal volatile bool SigningActive;
    internal Signing.RemoteSigning? Remote { get; }
    internal ReceiverMirror Mirror { get; }
    private volatile AgentStatus status = new("WAITING_ENROLLMENT", "OFFLINE", null, null, null, null, null);
    internal AgentStatus Status => status with { DeviceKeyFingerprint = DeviceKey.Hash(key.PublicKey), MirrorError = Mirror.ErrorCode };
    internal async Task WaitForProbeIdle(CancellationToken ct)
    {
        await operations.WaitAsync(ct);
        operations.Release();
    }
    internal AgentWorker(Configuration config, string configPath, HttpMessageHandler? testHandler = null)
    {
        this.config = config; this.configPath = configPath;
        Directory.CreateDirectory(config.DataDirectory);
        key = new DeviceKey(config);
        api = new DeviceApi(config, key, testHandler);
        Mirror = new(config, api, () => identity);
        string path = Path.Combine(config.DataDirectory, "identity.json");
        if (File.Exists(path)) identity = JsonSerializer.Deserialize<Identity>(File.ReadAllText(path), Configuration.Json);
        if (config.ControlledSigning is not null && identity is not null) throw new InvalidOperationException("CONTROLLED_MODE_REQUIRES_UNENROLLED_DEVICE");
        if (config.SigningEngine is not null) Remote = new(config, api, () => identity, active => SigningActive = active, WaitForProbeIdle);
    }
    internal async Task Enroll(string code, string name, CancellationToken ct, string? receiverDirectory = null)
    {
        if (config.ControlledSigning is not null) throw new InvalidOperationException("CONTROLLED_MODE_CANNOT_ENROLL");
        if (!System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Za-z0-9_-]{43}$") || name.Length is < 1 or > 100 || name.Trim() != name)
            throw new InvalidOperationException("INVALID_ENROLLMENT");
        await operations.WaitAsync(ct);
        try
        {
            if (identity is not null) throw new InvalidOperationException("ALREADY_ENROLLED");
            if (receiverDirectory is not null) {
                Signing.LocalSigningFiles.RequireLocalPath(receiverDirectory);
                Directory.CreateDirectory(receiverDirectory);
                // Check service-account write access before consuming the enrollment code.
                string probe = Path.Combine(receiverDirectory, ".notifica-" + Guid.NewGuid().ToString("N") + ".part");
                using (var file = new FileStream(probe, FileMode.CreateNew, FileAccess.Write, FileShare.None)) file.Flush(true);
                File.Delete(probe);
                ReceiverMirror.SaveJson(Path.Combine(config.DataDirectory, "receiver-folder.json"), Path.GetFullPath(receiverDirectory));
            }
            identity = await api.Enroll(code, name, ct);
            string temporary = Path.Combine(config.DataDirectory, "identity.json.part");
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(identity, Configuration.Json), ct);
            File.Move(temporary, Path.Combine(config.DataDirectory, "identity.json"), true);
        }
        finally { operations.Release(); }
    }
    internal async Task Run(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            // Keep the health probe from opening another provider session while
            // a controlled batch owns an authenticated token session.
            if (SigningActive) { await Task.Delay(TimeSpan.FromSeconds(1), ct); continue; }
            await operations.WaitAsync(ct);
            try
            {
                if (SigningActive) continue;
                if (identity is null)
                {
                    var token = await Probe(ct);
                    status = new("WAITING_ENROLLMENT", TokenProbe.Health(token, DateTimeOffset.UtcNow),
                        token.Token == "READY" ? null : token.Token, null, null, null, token.Certificate);
                }
                else
                {
                    var token = identity.Role == "RECEIVER" ? new TokenHealth("NOT_APPLICABLE", null) : await Probe(ct);
                    await api.Authenticate(identity, ct);
                    var disk = new DriveInfo(Path.GetPathRoot(config.DataDirectory)!);
                    var response = await api.Post("heartbeat", new {
                        agentVersion = "0.9.0", role = identity.Role, diskFreeBytes = disk.AvailableFreeSpace,
                        lastSuccessfulContactAt = lastContact?.UtcDateTime.ToString("O"), token = token.Token,
                        certificate = token.Certificate is null ? null : new {
                            fingerprint = token.Certificate.Fingerprint, subject = token.Certificate.Subject, issuer = token.Certificate.Issuer,
                            notBefore = token.Certificate.NotBefore.UtcDateTime.ToString("O"), expiresAt = token.Certificate.ExpiresAt.UtcDateTime.ToString("O"), digitalSignature = true }
                    }, ct, true);
                    lastContact = DateTimeOffset.UtcNow;
                    status = new("ONLINE", response.GetProperty("health").GetString()!,
                        token.Token is "READY" or "NOT_APPLICABLE" ? null : token.Token, identity.DeviceId, identity.Role, lastContact, token.Certificate);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (ApiFailure error) { status = new("OFFLINE", "OFFLINE", error.Code, identity?.DeviceId, identity?.Role, lastContact, null); }
            catch { status = new("OFFLINE", "OFFLINE", "CONNECTION_OR_LOCAL_ERROR", identity?.DeviceId, identity?.Role, lastContact, null); }
            finally { operations.Release(); }
            // Foundation does not claim/sign/download jobs. Phase 6/7 attach the
            // work processor after local approval and cryptographic validation exist.
            await Task.Delay(TimeSpan.FromSeconds(30), ct);
        }
    }
    private async Task<TokenHealth> Probe(CancellationToken ct)
    {
        // A defective/hung vendor DLL cannot block the service or pipe. Only this
        // owned child is terminated on timeout; no SafeNet/user process is killed.
        using var process = new Process { StartInfo = new ProcessStartInfo(Environment.ProcessPath!) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true } };
        process.StartInfo.ArgumentList.Add("--probe");
        process.StartInfo.ArgumentList.Add("--config");
        process.StartInfo.ArgumentList.Add(configPath);
        process.Start();
        var output = process.StandardOutput.ReadToEndAsync(ct);
        var stderr = process.StandardError.ReadToEndAsync(ct);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(12));
        try
        {
            await process.WaitForExitAsync(deadline.Token);
            await stderr;
            string json = await output;
            if (process.ExitCode != 0 || json.Length > 16384) return new("DRIVER_ERROR", null);
            return JsonSerializer.Deserialize<TokenHealth>(json, Configuration.Json) ?? new("DRIVER_ERROR", null);
        }
        catch (OperationCanceledException)
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync(CancellationToken.None);
            if (ct.IsCancellationRequested) throw;
            return new("DRIVER_ERROR", null);
        }
    }
    public void Dispose() { api.Dispose(); key.Dispose(); operations.Dispose(); }
}
