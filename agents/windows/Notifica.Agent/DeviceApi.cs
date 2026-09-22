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
    internal DeviceApi(Configuration config, DeviceKey key, HttpMessageHandler? handler = null)
    {
        this.key = key;
        client = new HttpClient(handler ?? new SocketsHttpHandler { AllowAutoRedirect = false, ConnectTimeout = TimeSpan.FromSeconds(10) })
        { BaseAddress = new Uri(config.ServerUrl), Timeout = TimeSpan.FromSeconds(20) };
    }
    internal async Task<JsonElement> Post(string action, object body, CancellationToken ct, bool authenticated = false)
    {
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
        if (session is not null && sessionExpires > DateTimeOffset.UtcNow.AddSeconds(30)) return;
        var challenge = await Post("challenge", new { deviceId = identity.DeviceId }, ct);
        string id = challenge.GetProperty("challengeId").GetString()!;
        string nonce = challenge.GetProperty("nonce").GetString()!;
        var result = await Post("session-renew", new { deviceId = identity.DeviceId, challengeId = id, nonce,
            signature = key.SessionProof(identity.DeviceId, id, nonce) }, ct);
        session = result.GetProperty("token").GetString();
        sessionExpires = result.GetProperty("expiresAt").GetDateTimeOffset();
    }
    public void Dispose() { session = null; client.Dispose(); }
}
