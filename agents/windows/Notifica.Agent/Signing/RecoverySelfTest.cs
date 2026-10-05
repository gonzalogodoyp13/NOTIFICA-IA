using System.Net;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;

namespace Notifica.Agent.Signing;

// Exercises the actual coordinator and durable journal with an injected token
// session. No USB key or real PIN can be used by this recovery test.
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
        using var session = new FailedSession();
        var coordinator = new RemoteSigning(config, api, () => new Identity("device", 1, "SIGNER"), _ => { }, _ => Task.CompletedTask, session);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(130));
        Task running = coordinator.Run(stop.Token);
        async Task Until(Func<bool> condition) {
            while (!condition()) { stop.Token.ThrowIfCancellationRequested(); await Task.Delay(100, stop.Token); }
        }
        try {
            await Task.Delay(1000, stop.Token);
            if (handler.Claims != 0) throw new InvalidOperationException("CLAIMED_WHILE_LOCKED");
            var pin = new PinBuffer("synthetic-only"u8);
            await coordinator.Enable(pin, stop.Token);
            await Until(() => coordinator.Current?.View().State == "FAILED" && handler.Failures == 1);
            var first = coordinator.Current!;
            await Task.Delay(200, stop.Token);
            if (!pin.IsCleared || handler.Starts != 1 || handler.Claims != 1) throw new InvalidOperationException("RECOVERY_INITIAL_FAILURE");
            var saved = JsonSerializer.Deserialize<RemoteJournal>(File.ReadAllText(Path.Combine(directory, "signing-work.json")), Configuration.Json)!;
            if (saved.State != "WAITING_FOR_OPERATOR") throw new InvalidOperationException("RECOVERY_JOURNAL_NOT_RETAINED");
            string sourcePath = saved.Batch.Documents[0].SourcePath;
            using var secondPin = new PinBuffer("synthetic-only"u8);
            await coordinator.Enable(secondPin, stop.Token);
            await Task.Delay(TimeSpan.FromSeconds(17), stop.Token);
            if (session.Signatures != 1 || handler.Claims != 1) throw new InvalidOperationException("UNREVIEWED_RETRY");
            handler.Reviewed = true;
            await Until(() => handler.Starts == 2 && coordinator.Current != first && coordinator.Current?.View().State == "FAILED");
            if (session.Signatures != 2 || handler.Claims != 2 || !File.Exists(sourcePath))
                throw new InvalidOperationException("RECOVERY_REUSED_APPROVAL_OR_REMOVED_SOURCE");
            var next = JsonSerializer.Deserialize<RemoteJournal>(File.ReadAllText(Path.Combine(directory, "signing-work.json")), Configuration.Json)!;
            if (next.LeaseToken == saved.LeaseToken || next.Batch.Id == saved.Batch.Id) throw new InvalidOperationException("RECOVERY_REUSED_LEASE");
            Console.WriteLine(JsonSerializer.Serialize(new { passed = 7, realTokenLoginAttempts = 0,
                lockedSessionDoesNotClaim = true, enabledSessionNeedsNoPerDocumentApproval = true,
                failedJournalRetained = true, reviewedRecoveryConsumed = true, freshLeaseAndBatch = true,
                noUnreviewedSecondSignature = true, originalSourceRetained = true }));
            return 0;
        } finally {
            stop.Cancel();
            try { await running; } catch (OperationCanceledException) { }
            if (CngKey.Exists(config.KeyName)) { using var stored = CngKey.Open(config.KeyName); stored.Delete(); }
            Directory.Delete(directory, true);
        }
    }
    private sealed class FailedSession : IRemoteTokenSession
    {
        private Guid? id;
        internal int Signatures;
        public RemoteSessionView View => new(id is not null, id, id is null ? null : DateTimeOffset.UtcNow.AddHours(8), null);
        public Task Enable(int officeId, PinBuffer pin, CancellationToken ct) { pin.Dispose(); id = Guid.NewGuid(); return Task.CompletedTask; }
        public Task Check(CancellationToken ct) => Task.CompletedTask;
        public Task<IReadOnlyList<SignedPdf>> Sign(SigningBatch batch, Guid sessionId, CancellationToken ct) {
            if (id != sessionId) throw new SigningFailure(SigningError.SessionExpired);
            Signatures++; Disable(); throw new SigningFailure(SigningError.DriverFailure);
        }
        public void Disable() => id = null;
        public void Dispose() => Disable();
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
                case "start":
                    using (var body = JsonDocument.Parse(request.Content!.ReadAsStringAsync(cancellationToken).GetAwaiter().GetResult())) {
                        if (!body.RootElement.TryGetProperty("remoteSessionId", out var id) || !Guid.TryParse(id.GetString(), out _)
                            || body.RootElement.TryGetProperty("locallyApproved", out _)) throw new InvalidOperationException("REMOTE_AUTHORIZATION_MISSING");
                    }
                    Starts++; value = new { accepted = true }; break;
                case "fail": Failures++; value = new { accepted = true }; break;
                case "renew": value = new { leaseExpiresAt = DateTimeOffset.UtcNow.AddMinutes(1) }; break;
                default: throw new InvalidOperationException("UNEXPECTED_RECOVERY_ACTION");
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { ok = true, data = value })) });
        }
    }
}
