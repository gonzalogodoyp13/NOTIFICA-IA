using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Notifica.Agent;

internal sealed class ApiFailure(string code, HttpStatusCode status) : Exception(code)
{
    internal string Code { get; } = code;
    internal HttpStatusCode Status { get; } = status;
}
internal sealed class DeviceApi : IDisposable
{
    private readonly HttpClient client;
    private readonly DeviceKey key;
    private string? session;
    private DateTimeOffset sessionExpires;
    private readonly SemaphoreSlim authentication = new(1);
    internal DeviceApi(Configuration config, DeviceKey key, HttpMessageHandler? handler = null)
    {
        this.key = key;
        client = new HttpClient(handler ?? new SocketsHttpHandler { AllowAutoRedirect = false, ConnectTimeout = TimeSpan.FromSeconds(10) })
        { BaseAddress = new Uri(config.ServerUrl), Timeout = TimeSpan.FromSeconds(120) };
    }
    internal async Task<JsonElement> Post(string action, object body, CancellationToken ct, bool authenticated = false)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(20)); ct = deadline.Token;
        using var request = new HttpRequestMessage(HttpMethod.Post, "api/signing/device/" + action)
        { Content = new StringContent(JsonSerializer.Serialize(body, Configuration.Json), Encoding.UTF8, "application/json") };
        if (authenticated) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session ?? throw new InvalidOperationException("SESSION_REQUIRED"));
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var output = new MemoryStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = await stream.ReadAsync(buffer, ct)) > 0)
        {
            if (output.Length + count > 65536) throw new InvalidOperationException("RESPONSE_TOO_LARGE");
            output.Write(buffer, 0, count);
        }
        using var parsed = JsonDocument.Parse(output.ToArray());
        if (!response.IsSuccessStatusCode)
        {
            // Only locally recognized codes reach status/tray. Never expose body/errors.
            string code = response.StatusCode switch {
                HttpStatusCode.Unauthorized => "DEVICE_UNAUTHORIZED", HttpStatusCode.TooManyRequests => "RATE_LIMITED",
                HttpStatusCode.Forbidden => "DEVICE_FORBIDDEN", _ => "SERVER_UNAVAILABLE" };
            if (response.StatusCode == HttpStatusCode.Unauthorized) session = null;
            throw new ApiFailure(code, response.StatusCode);
        }
        return parsed.RootElement.GetProperty("data").Clone();
    }
    internal async Task<Identity> Enroll(string code, string name, CancellationToken ct)
    {
        var result = await Post("enroll", new { code, name, publicKey = key.PublicKey, signature = key.EnrollmentProof(code, name) }, ct);
        return result.Deserialize<Identity>(Configuration.Json) ?? throw new InvalidOperationException("INVALID_IDENTITY");
    }
    internal async Task Authenticate(Identity identity, CancellationToken ct)
    {
        await authentication.WaitAsync(ct);
        try {
        if (session is not null && sessionExpires > DateTimeOffset.UtcNow.AddSeconds(30)) return;
        var challenge = await Post("challenge", new { deviceId = identity.DeviceId }, ct);
        string id = challenge.GetProperty("challengeId").GetString()!;
        string nonce = challenge.GetProperty("nonce").GetString()!;
        var result = await Post("session-renew", new { deviceId = identity.DeviceId, challengeId = id, nonce,
            signature = key.SessionProof(identity.DeviceId, id, nonce) }, ct);
        session = result.GetProperty("token").GetString();
        sessionExpires = result.GetProperty("expiresAt").GetDateTimeOffset();
        } finally { authentication.Release(); }
    }
    internal async Task Download(object lease, string destination, long expectedLength, string expectedHash, CancellationToken ct, string action = "download")
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(120)); ct = deadline.Token;
        if (expectedLength is < 8 or > 32 * 1024 * 1024) throw new InvalidOperationException("INVALID_PDF");
        Signing.LocalSigningFiles.RequireLocalPath(destination);
        string part = destination + ".part";
        bool created = false;
        using var request = new HttpRequestMessage(HttpMethod.Post, "api/signing/device/" + action) {
            Content = new StringContent(JsonSerializer.Serialize(lease, Configuration.Json), Encoding.UTF8, "application/json") };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session ?? throw new InvalidOperationException("SESSION_REQUIRED"));
        try {
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode) throw new ApiFailure("TRANSFER_REJECTED", response.StatusCode);
            if (response.Content.Headers.ContentType?.MediaType != "application/pdf") throw new InvalidOperationException("INVALID_PDF");
            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            await using (var output = new FileStream(part, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                created = true;
                using var digest = System.Security.Cryptography.IncrementalHash.CreateHash(System.Security.Cryptography.HashAlgorithmName.SHA256);
                byte[] buffer = new byte[65536]; long total = 0; int count;
                while ((count = await stream.ReadAsync(buffer, ct)) != 0) {
                    total += count;
                    if (total > expectedLength) throw new InvalidOperationException("CHECKSUM_MISMATCH");
                    digest.AppendData(buffer, 0, count); await output.WriteAsync(buffer.AsMemory(0, count), ct);
                }
                if (total != expectedLength || Convert.ToHexStringLower(digest.GetHashAndReset()) != expectedHash)
                    throw new InvalidOperationException("CHECKSUM_MISMATCH");
                output.Flush(true);
            }
            File.Move(part, destination, false);
        } finally { if (created && File.Exists(part)) File.Delete(part); }
    }
    internal async Task<JsonElement> Upload(string itemId, string leaseToken, Signing.SignedPdf pdf, CancellationToken ct)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(180)); ct = deadline.Token;
        Signing.LocalSigningFiles.RequireLocalPath(pdf.OutputPath);
        await using var file = new FileStream(pdf.OutputPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (file.Length is < 8 or > 32 * 1024 * 1024 || Convert.ToHexStringLower(await System.Security.Cryptography.SHA256.HashDataAsync(file, ct)) != pdf.Sha256)
            throw new InvalidOperationException("CHECKSUM_MISMATCH");
        file.Position = 0;
        using var request = new HttpRequestMessage(HttpMethod.Post, "api/signing/device/result") { Content = new StreamContent(file) };
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session ?? throw new InvalidOperationException("SESSION_REQUIRED"));
        request.Headers.Add("X-Signing-Item", itemId); request.Headers.Add("X-Signing-Lease", leaseToken);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode) throw new ApiFailure("RESULT_REJECTED", response.StatusCode);
        await using var body = await response.Content.ReadAsStreamAsync(ct);
        using var memory = new MemoryStream();
        byte[] buffer = new byte[4096]; int read;
        while ((read = await body.ReadAsync(buffer, ct)) > 0) {
            if (memory.Length + read > 16384) throw new InvalidOperationException("RESPONSE_TOO_LARGE");
            memory.Write(buffer, 0, read);
        }
        using var result = JsonDocument.Parse(memory.ToArray());
        var data = result.RootElement.GetProperty("data");
        if (!data.GetProperty("committed").GetBoolean() || data.GetProperty("checksumSha256").GetString() != pdf.Sha256)
            throw new InvalidOperationException("RESULT_MISMATCH");
        return data.Clone();
    }
    public void Dispose() { session = null; client.Dispose(); authentication.Dispose(); }
}
