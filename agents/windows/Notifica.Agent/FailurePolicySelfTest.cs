using System.Text.Json;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Collections.Immutable;
using System.Net;
using Notifica.Agent.Signing;

namespace Notifica.Agent;
internal static class FailurePolicySelfTest
{
    internal static async Task<int> Run()
    {
        string directory = Path.Combine(Path.GetTempPath(), "notifica-failure-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var config = new Configuration("https://localhost/", directory, WindowsIdentity.GetCurrent().User!.Value,
            Guid.NewGuid().ToString(), Path.Combine(directory, "missing-provider.dll"), null, false);
        int checks = 0;
        void Check(bool condition) { if (!condition) throw new InvalidOperationException("FAILURE_POLICY_TEST"); checks++; }
        try {
            foreach (var pair in new[] { ("PinIncorrect", "PIN_INCORRECT"), ("PinLocked", "PIN_LOCKED"), ("PinExpired", "PIN_EXPIRED"),
                ("TimestampUnavailable", "TSA_UNAVAILABLE"), ("RevocationUnavailable", "REVOCATION_UNAVAILABLE"),
                ("DriverFailure", "DRIVER_ERROR"), ("TokenRemoved", "TOKEN_MISSING"), ("ValidationFailed", "VALIDATION_FAILED") })
                Check(FailurePolicy.SigningCode(pair.Item1) == pair.Item2);
            Check(FailurePolicy.Delay(1).TotalSeconds == 15 && FailurePolicy.Delay(2).TotalSeconds == 30 && FailurePolicy.Delay(99).TotalSeconds == 300);
            Check(FailurePolicy.MaximumTransportAttempts == 6);
            Check(FailurePolicy.TransferCode(new IOException("disk failure with SECRET")) == "DISK");
            Check(FailurePolicy.TransferCode(new HttpRequestException("SECRET")) == "NETWORK");
            Check(FailurePolicy.TransferCode(new ApiFailure("AGENT_UPDATE_REQUIRED", (HttpStatusCode)426)) == "AGENT_UPDATE_REQUIRED");
            Check(FailurePolicy.TransferCode(new InvalidOperationException("CHECKSUM_MISMATCH")) == "CHECKSUM_MISMATCH");
            FailurePolicy.Log(config, "PIN=SECRET service_role=SECRET", Guid.NewGuid());
            string file = Path.Combine(directory, "operations.jsonl");
            Check(!File.ReadAllText(file).Contains("SECRET"));
            File.WriteAllText(file, new string('x', 1024 * 1024));
            FailurePolicy.Log(config, "NETWORK", Guid.NewGuid());
            Check(new FileInfo(file).Length < 1024 && File.Exists(file + ".previous"));
            File.SetCreationTimeUtc(file + ".previous", DateTime.UtcNow.AddDays(-31));
            FailurePolicy.Log(config, "DISK", Guid.NewGuid());
            Check(!File.Exists(file + ".previous"));
            await CommittedRecovery(config);
            checks++;
            Console.WriteLine(JsonSerializer.Serialize(new { passed = checks, tokenLoginAttempts = 0, sanitizedLogs = true, boundedRetention = true }));
            return 0;
        } finally { Directory.Delete(directory, true); }
    }
    private static async Task CommittedRecovery(Configuration original)
    {
        var config = original with { CertificateFingerprint = new string('b', 64) };
        using var key = new DeviceKey(config);
        using var api = new DeviceApi(config, key, new CommittedHandler());
        string source = Path.Combine(config.DataDirectory, "source.pdf");
        File.WriteAllText(source, "%PDF-1.7 synthetic test");
        var batch = new SigningBatch(Guid.NewGuid(), 1, "Test", "Test", "Test", config.CertificateFingerprint!, SigningProfile.PADES_B,
            ImmutableArray.Create(new SigningDocument("document", source, new string('a', 64))));
        string journal = Path.Combine(config.DataDirectory, "signing-work.json");
        File.WriteAllText(journal, JsonSerializer.Serialize(new RemoteJournal("item", Guid.NewGuid().ToString(), batch, "WAITING_FOR_OPERATOR",
            new SignedPdf("document", source, new string('c', 64), SigningProfile.PADES_B), 6), Configuration.Json));
        await using var remote = new RemoteSigning(config, api, () => new Identity("device", 1, "SIGNER"), _ => {}, _ => Task.CompletedTask);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var running = remote.Run(stop.Token);
        try {
            bool reconciled = false;
            while (!reconciled) {
                stop.Token.ThrowIfCancellationRequested();
                try { reconciled = JsonSerializer.Deserialize<RemoteJournal>(File.ReadAllText(journal), Configuration.Json)?.State == "COMMITTED"; } catch (IOException) { }
                if (!reconciled) await Task.Delay(25, stop.Token);
            }
        } finally {
            stop.Cancel(); try { await running; } catch (OperationCanceledException) { }
            if (CngKey.Exists(config.KeyName)) { using var stored = CngKey.Open(config.KeyName); stored.Delete(); }
        }
    }
    private sealed class CommittedHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            object value = request.RequestUri!.Segments.Last() switch {
                "challenge" => new { challengeId = "challenge", nonce = "nonce" },
                "session-renew" => new { token = new string('a', 43), expiresAt = DateTimeOffset.UtcNow.AddMinutes(5) },
                "recovery" => new { released = false, committed = true, checksumSha256 = new string('c', 64) },
                _ => throw new InvalidOperationException("MUST_NOT_UPLOAD_OR_SIGN_AGAIN")
            };
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { ok = true, data = value })) });
        }
    }
}
