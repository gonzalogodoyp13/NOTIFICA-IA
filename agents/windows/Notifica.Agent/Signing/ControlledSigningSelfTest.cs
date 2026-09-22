using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;

namespace Notifica.Agent.Signing;

internal static class ControlledSigningSelfTest
{
    internal static async Task<int> Run(string enginePath)
    {
        var engine = JsonSerializer.Deserialize<DssEngineOptions>(File.ReadAllText(enginePath), Configuration.Json)!;
        int checks = 0;
        foreach (string role in new[] { "SIGNER", "RECEIVER" })
        {
            string directory = Path.Combine(engine.OutputDirectory, "pipe-test-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(directory);
            string source = Path.Combine(directory, "unchanged.pdf");
            await File.WriteAllBytesAsync(source, "%PDF-1.7\nsynthetic preflight-only input\n"u8.ToArray());
            var batch = new SigningBatch(Guid.NewGuid(), 1, "Controlled test", "Test requester", "Synthetic signer", new string('a', 64),
                SigningProfile.PADES_B, [new("controlled-1", source, Convert.ToHexStringLower(SHA256.HashData(await File.ReadAllBytesAsync(source))))]);
            string manifest = Path.Combine(directory, "batch.json");
            await File.WriteAllTextAsync(manifest, JsonSerializer.Serialize(batch, Configuration.Json));
            var config = new Configuration("https://localhost/", directory, WindowsIdentity.GetCurrent().User!.Value, Guid.NewGuid().ToString(),
                Path.Combine(directory, "deliberately-missing-provider.dll"), batch.SignerFingerprint, false,
                new(manifest, 1, role, engine));
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            using var serving = new CancellationTokenSource();
            try
            {
                if (role == "SIGNER")
                {
                    var clock = new ApprovalClock();
                    await using var expiring = new ControlledSigning(config,
                        _ => throw new InvalidOperationException("EXPIRED_WORKER_STARTED"), _ => Task.CompletedTask, clock);
                    clock.Advance(TimeSpan.FromSeconds(291));
                    var late = expiring.View();
                    if (late.State != "AWAITING_APPROVAL" || late.RemainingApprovalMilliseconds != 9000)
                        throw new InvalidOperationException("LATE_PREVIEW_RENEWS_APPROVAL");
                    checks++;
                    clock.Advance(TimeSpan.FromSeconds(9));
                    var expired = expiring.View();
                    if (expired.State != "EXPIRED" || expired.Error != "ApprovalExpired" || expired.RemainingApprovalMilliseconds != 0)
                        throw new InvalidOperationException("EXPIRED_PREVIEW");
                    try { expiring.Reserve(late.ApprovalId, late.Digest); throw new InvalidOperationException("EXPIRED_APPROVAL_ACCEPTED"); }
                    catch (SigningFailure failure) when (failure.Code == SigningError.ApprovalExpired) { }
                    checks++;
                    await using var unpolled = new ControlledSigning(config,
                        _ => throw new InvalidOperationException("EXPIRED_WORKER_STARTED"), _ => Task.CompletedTask, clock);
                    var original = unpolled.View();
                    clock.Advance(TimeSpan.FromSeconds(301));
                    try { unpolled.Reserve(original.ApprovalId, original.Digest); throw new InvalidOperationException("UNPOLLED_EXPIRY_ACCEPTED"); }
                    catch (SigningFailure failure) when (failure.Code == SigningError.ApprovalExpired) { }
                    if (unpolled.View().State != "EXPIRED") throw new InvalidOperationException("UNPOLLED_EXPIRY_STATE");
                    checks++;
                }
                using var worker = new AgentWorker(config, Path.Combine(directory, "unused-config.json"));
                Task server = LocalPipe.Serve(config, worker, serving.Token);
                try
                {
                    var response = await LocalPipe.Request(config, new { action = "controlled-batch" }, timeout.Token);
                    var view = response.GetProperty("batch").Deserialize<ControlledBatchView>(Configuration.Json)!;
                    if (view.Batch.Digest() != batch.Digest()) throw new InvalidOperationException("PREVIEW_BINDING");
                    checks++;
                    using var pin = new PinBuffer("synthetic-not-a-token-pin"u8);
                    if (role == "RECEIVER")
                    {
                        try { await LocalPipe.Approve(config, view, pin, timeout.Token); throw new InvalidOperationException("RECEIVER_ACCEPTED"); }
                        catch (SigningFailure failure) when (failure.Code == SigningError.ApprovalMismatch) { }
                        if (!pin.IsCleared) throw new InvalidOperationException("RECEIVER_PIN_CLEAR");
                        checks++; continue;
                    }
                    await LocalPipe.Approve(config, view, pin, timeout.Token);
                    if (!pin.IsCleared) throw new InvalidOperationException("SENDER_PIN_CLEAR");
                    checks++;
                    do
                    {
                        await Task.Delay(50, timeout.Token);
                        response = await LocalPipe.Request(config, new { action = "controlled-batch" }, timeout.Token);
                        view = response.GetProperty("batch").Deserialize<ControlledBatchView>(Configuration.Json)!;
                    } while (view.State == "SIGNING");
                    if (view.State != "FAILED" || view.Error != "DriverFailure") throw new InvalidOperationException("WORKER_FAILURE_BOUNDARY");
                    checks++;
                    using var repeated = new PinBuffer("synthetic-not-a-token-pin"u8);
                    try { await LocalPipe.Approve(config, view, repeated, timeout.Token); throw new InvalidOperationException("REPLAY_ACCEPTED"); }
                    catch (SigningFailure failure) when (failure.Code == SigningError.ApprovalMismatch) { }
                    if (!repeated.IsCleared) throw new InvalidOperationException("REPLAY_PIN_CLEAR");
                    checks++;
                }
                finally { serving.Cancel(); try { await server; } catch (OperationCanceledException) { } }
            }
            finally
            {
                if (CngKey.Exists(config.KeyName)) { using var key = CngKey.Open(config.KeyName); key.Delete(); }
            }
        }
        Console.WriteLine(JsonSerializer.Serialize(new { passed = checks, realTokenLoginAttempts = 0,
            checks = new[] { "Real secured pipe preserves approved metadata", "Binary transfer clears tray PIN buffer",
                "Owned worker returns a fixed missing-driver failure", "Replay rejected before a second worker or PIN transfer", "Receiver approval rejected",
                "Late preview preserves the original approval deadline", "Expired preview reports expiry and rejects approval",
                "Expiry is enforced even without polling" } }, Configuration.Json));
        return 0;
    }
    private sealed class ApprovalClock : TimeProvider
    {
        private long ticks;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override long GetTimestamp() => ticks;
        internal void Advance(TimeSpan elapsed) => ticks += elapsed.Ticks;
    }
}
