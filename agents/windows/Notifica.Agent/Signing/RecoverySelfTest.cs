using System.Net;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;

namespace Notifica.Agent.Signing;

// Exercises the actual coordinator, durable journal and owned worker. The
// provider deliberately does not exist: no USB key or real PIN can be used.
internal static class RecoverySelfTest
{
    internal static async Task<int> Run(string enginePath)
    {
        var engine = JsonSerializer.Deserialize<DssEngineOptions>(File.ReadAllText(enginePath), Configuration.Json)!;
        string directory = Path.Combine(engine.OutputDirectory, "recovery-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var config = new Configuration("https://localhost/", directory, WindowsIdentity.GetCurrent().User!.Value,
            Guid.NewGuid().ToString(), Path.Combine(directory, "missing-provider.dll"), new string('b', 64), false, null, engine);
        using var key = new DeviceKey(config);
        using var handler = new RecoveryHandler();
        using var api = new DeviceApi(config, key, handler);
        var coordinator = new RemoteSigning(config, api, () => new Identity("device", 1, "SIGNER"), _ => { }, _ => Task.CompletedTask);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(100));
        Task running = coordinator.Run(stop.Token);
        async Task Until(Func<bool> condition) {
            while (!condition()) { stop.Token.ThrowIfCancellationRequested(); await Task.Delay(100, stop.Token); }
        }
        try {
            await Until(() => coordinator.Current?.View().State == "AWAITING_APPROVAL");
            var first = coordinator.Current!;
            var approval = first.View();
            first.Reserve(approval.ApprovalId, approval.Digest);
            var pin = new PinBuffer("synthetic-only"u8);
            first.Start(pin);
            await Until(() => first.View().State == "FAILED" && handler.Failures == 1);
            if (!pin.IsCleared || handler.Starts != 1 || handler.Claims != 1) throw new InvalidOperationException("RECOVERY_INITIAL_FAILURE");
            var saved = JsonSerializer.Deserialize<RemoteJournal>(File.ReadAllText(Path.Combine(directory, "signing-work.json")), Configuration.Json)!;
            if (saved.State != "WAITING_FOR_OPERATOR") throw new InvalidOperationException("RECOVERY_JOURNAL_NOT_RETAINED");
            string sourcePath = saved.Batch.Documents[0].SourcePath;
            handler.Reviewed = true;
            await Until(() => coordinator.Current is not null && coordinator.Current != first && coordinator.Current.View().State == "AWAITING_APPROVAL");
            var second = coordinator.Current!.View();
            if (second.ApprovalId == approval.ApprovalId || handler.Starts != 1 || handler.Claims != 2 || !File.Exists(sourcePath))
                throw new InvalidOperationException("RECOVERY_REUSED_APPROVAL_OR_REMOVED_SOURCE");
            var next = JsonSerializer.Deserialize<RemoteJournal>(File.ReadAllText(Path.Combine(directory, "signing-work.json")), Configuration.Json)!;
            if (next.LeaseToken == saved.LeaseToken || next.State != "CLAIMED") throw new InvalidOperationException("RECOVERY_REUSED_LEASE");
            Console.WriteLine(JsonSerializer.Serialize(new { passed = 5, realTokenLoginAttempts = 0,
                failedJournalRetained = true, reviewedRecoveryConsumed = true, freshLeaseAndApproval = true,
                noAutomaticSecondSignature = true, originalSourceRetained = true }));
            return 0;
        } finally {
            stop.Cancel();
            try { await running; } catch (OperationCanceledException) { }
            if (CngKey.Exists(config.KeyName)) { using var stored = CngKey.Open(config.KeyName); stored.Delete(); }
            Directory.Delete(directory, true);
        }
    }
    private sealed class RecoveryHandler : HttpMessageHandler
    {
        internal int Claims, Starts, Failures;
        internal volatile bool Reviewed;
        private readonly byte[] bytes = "%PDF-1.7\ncontrolled recovery test\n%%EOF"u8.ToArray();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            object? value;
            switch (request.RequestUri!.Segments.Last()) {
                case "challenge": value = new { challengeId = "challenge", nonce = "nonce" }; break;
                case "session-renew": value = new { token = new string('a', 43), expiresAt = DateTimeOffset.UtcNow.AddMinutes(5) }; break;
                case "claim":
                    Claims++; value = new { itemId = "item", leaseToken = Guid.NewGuid().ToString() }; break;
                case "input": value = new { transferAvailable = true, officeId = 1, officeName = "Synthetic office", requester = "Synthetic requester",
                    signerFingerprint = new string('b', 64), documentoId = "document", checksumSha256 = Convert.ToHexStringLower(SHA256.HashData(bytes)),
                    sizeBytes = bytes.Length, requestedLevel = "PADES_B" }; break;
                case "download":
                    var pdf = new ByteArrayContent(bytes); pdf.Headers.ContentType = new("application/pdf");
                    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = pdf });
                case "recovery": value = new { released = Reviewed && Claims == 1 }; break;
                case "start": Starts++; value = new { accepted = true }; break;
                case "fail": Failures++; value = new { accepted = true }; break;
                case "renew": value = new { leaseExpiresAt = DateTimeOffset.UtcNow.AddMinutes(1) }; break;
                default: throw new InvalidOperationException("UNEXPECTED_RECOVERY_ACTION");
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { ok = true, data = value })) });
        }
    }
}
