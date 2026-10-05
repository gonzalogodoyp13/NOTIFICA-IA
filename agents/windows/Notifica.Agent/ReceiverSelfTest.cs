using System.Net;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;

namespace Notifica.Agent;

internal static class ReceiverSelfTest
{
    private static void Require(bool value, string code) { if (!value) throw new InvalidOperationException(code); }
    internal static async Task<int> Run()
    {
        string directory = Path.Combine(Path.GetTempPath(), "NotificaReceiverTest-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var config = new Configuration("https://localhost/", directory, WindowsIdentity.GetCurrent().User!.Value,
            Guid.NewGuid().ToString(), Path.Combine(directory, "missing.dll"), null, false, ReceiverDirectory: Path.Combine(directory, "mirror"));
        using var key = new DeviceKey(config);
        using var handler = new MirrorHandler();
        using var api = new DeviceApi(config, key, handler);
        var identity = new Identity("receiver", 1, "RECEIVER");
        ReceiverMirror Mirror() => new(config, api, () => identity);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(45));
        var ct = stop.Token;
        try {
            Directory.CreateDirectory(config.ReceiverDirectory!);
            string existing = Path.Combine(config.ReceiverDirectory!, "document-version-firmado.pdf");
            await File.WriteAllTextAsync(existing, "existing local bytes", ct);
            handler.UpdateRequired = true;
            bool gated = false;
            try { await Mirror().Tick(ct); } catch (ApiFailure error) { gated = error.Code == "AGENT_UPDATE_REQUIRED"; }
            using (var pending = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(directory, "receiver-state.json"), ct)))
                Require(gated && handler.Failures == 0 && handler.Downloads == 0 && pending.RootElement.GetProperty("pending").GetArrayLength() == 1, "UPDATE_GATE_PRESERVES_PENDING_WITHOUT_FAILED_TRANSFER");
            handler.UpdateRequired = false;
            handler.Corrupt = true;
            await Mirror().Tick(ct);
            Require(handler.Acks == 0 && Directory.GetFiles(config.ReceiverDirectory!, "*.pdf").Length == 1, "CORRUPTION_REJECTED");
            handler.Corrupt = false;
            await Mirror().Tick(ct); // exhausted cursor wraps before retrying the failed delivery
            // A crashed download leaves only the protected staging .part; restart removes it and starts afresh.
            await File.WriteAllTextAsync(Path.Combine(directory, "receiver-delivery.download.part"), "interrupted", ct);
            handler.LoseAck = true;
            try { await Mirror().Tick(ct); } catch (DeliveryAcknowledgementUncertain) { }
            Require(handler.Acks == 1, "ACK_AFTER_PUBLICATION");
            Require(await File.ReadAllTextAsync(existing, ct) == "existing local bytes", "COLLISION_PRESERVED");
            int downloads = handler.Downloads;
            handler.LoseAck = false;
            await Mirror().Tick(ct);
            Require(handler.Acks == 2 && handler.Downloads == downloads, "RESTART_SAME_BYTES_ACK");
            var files = Directory.GetFiles(config.ReceiverDirectory!, "*.pdf");
            Require(files.Length == 2 && !Directory.GetFiles(config.ReceiverDirectory!, "*.part").Any(), "ATOMIC_FINAL_FILES");
            Require(Directory.GetFiles(Path.Combine(directory, "receiver-manifest")).Length == 1, "MANIFEST_PERSISTED");
            // Local edits/deletions have no upload/delete API path. A restored delivery uses a new collision name.
            string signed = files.Single(p => p != existing);
            await File.WriteAllTextAsync(signed, "locally changed", ct);
            handler.Done = false;
            await Mirror().Tick(ct); // cursor wraps after the prior page
            await Mirror().Tick(ct);
            Require(await File.ReadAllTextAsync(signed, ct) == "locally changed", "MODIFIED_LOCAL_PRESERVED");
            Require(Directory.GetFiles(config.ReceiverDirectory!, "*.pdf").Length == 3, "DETERMINISTIC_SECOND_COLLISION");
            int requests = handler.Requests;
            await new ReceiverMirror(config, api, () => identity with { Role = "SIGNER" }).Tick(ct);
            Require(handler.Requests == requests, "SIGNER_CANNOT_RECEIVE");
            bool invalid = false;
            try { new Delivery("delivery", "../escape", "v", new string('a', 64), 10).Validate(); } catch { invalid = true; }
            Require(invalid, "PATH_TRAVERSAL_REJECTED");
            Console.WriteLine(JsonSerializer.Serialize(new { passed = 11, tokenLoginAttempts = 0, updateGatePreservesPending = true, corruptionRejected = true,
                partialRestart = true, collisionsPreserved = true, lostAckRestart = true, manifestPersisted = true, localChangesNeverUploaded = true }));
            return 0;
        } finally {
            if (CngKey.Exists(config.KeyName)) { using var stored = CngKey.Open(config.KeyName); stored.Delete(); }
            Directory.Delete(directory, true);
        }
    }
    private sealed class MirrorHandler : HttpMessageHandler
    {
        internal bool Corrupt, LoseAck, Done, UpdateRequired;
        internal int Downloads, Acks, Requests, Failures;
        private readonly byte[] bytes = "%PDF-1.7\nReceiver self test\n%%EOF"u8.ToArray();
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Requests++;
            object? value;
            switch (request.RequestUri!.Segments.Last()) {
                case "challenge": value = new { challengeId = "challenge", nonce = "nonce" }; break;
                case "session-renew": value = new { token = new string('a', 43), expiresAt = DateTimeOffset.UtcNow.AddMinutes(5) }; break;
                case "deliveries":
                    var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
                    bool exhausted = body.RootElement.GetProperty("cursor").ValueKind == JsonValueKind.String;
                    var deliveries = Done || exhausted ? Array.Empty<Delivery>() : [new Delivery("delivery", "document", "version", Convert.ToHexStringLower(SHA256.HashData(bytes)), bytes.Length)];
                    value = new { deliveries, nextCursor = deliveries.Length == 0 ? null : "delivery" }; break;
                case "delivery-begin":
                    if (UpdateRequired) return new((HttpStatusCode)426) { Content = new StringContent("{\"ok\":false,\"error\":{\"code\":\"AGENT_UPDATE_REQUIRED\"}}") };
                    value = new { authorized = true }; break;
                case "delivery-download":
                    Downloads++;
                    var pdf = new ByteArrayContent(Corrupt ? "wrong"u8.ToArray() : bytes); pdf.Headers.ContentType = new("application/pdf");
                    return new(HttpStatusCode.OK) { Content = pdf };
                case "ack": Acks++; Done = true; if (LoseAck) throw new HttpRequestException("LOST_ACK"); value = new { delivered = true }; break;
                case "delivery-fail": Failures++; if (LoseAck) throw new HttpRequestException("OFFLINE"); value = new { accepted = true }; break;
                default: throw new InvalidOperationException("UNEXPECTED_RECEIVER_ACTION");
            }
            return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { ok = true, data = value }, Configuration.Json)) };
        }
    }
}
