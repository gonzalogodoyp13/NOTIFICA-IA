using System.Security.Cryptography;
using System.Text.Json;

namespace Notifica.Agent.Signing;

internal static class SigningSelfTest
{
    private static void Require(bool condition, string name)
    {
        if (!condition) throw new InvalidOperationException(name);
    }
    private static void Reject(Action operation, SigningError code)
    {
        try { operation(); }
        catch (SigningFailure failure) when (failure.Code == code) { return; }
        throw new InvalidOperationException("EXPECTED_" + code);
    }
    private static async Task RejectAsync(Func<Task> operation, SigningError code)
    {
        try { await operation(); }
        catch (SigningFailure failure) when (failure.Code == code) { return; }
        throw new InvalidOperationException("EXPECTED_" + code);
    }
    internal static async Task<int> Run()
    {
        var checks = new List<string>();
        byte[] certificate = "synthetic-public-certificate"u8.ToArray();
        string fingerprint = Convert.ToHexStringLower(SHA256.HashData(certificate));
        var batch = new SigningBatch(Guid.NewGuid(), 1, "Synthetic office", "Synthetic requester", "Synthetic signer", fingerprint,
            SigningProfile.PADES_LT, [new("doc-1", Path.GetFullPath("synthetic-1.pdf"), new string('a', 64)),
                new("doc-2", Path.GetFullPath("synthetic-2.pdf"), new string('b', 64))]);

        using (var pin = new PinBuffer("synthetic-pin-never-sent-to-hardware"u8))
        {
            Require(pin.ToString() == "[PIN REDACTED]", "PIN_DISPLAY");
            pin.Dispose();
            Require(pin.IsCleared, "PIN_CLEAR");
            checks.Add("PIN memory is explicitly zeroed and display is redacted");
        }
        Reject(() => { using var pin = new PinBuffer([]); }, SigningError.PinFormat);
        Reject(() => { using var pin = new PinBuffer(new byte[257]); }, SigningError.PinFormat);
        checks.Add("Empty and oversized PIN inputs rejected");

        using (var stream = new MemoryStream())
        using (var pin = new PinBuffer("synthetic-local-transfer"u8))
        {
            await PinTransfer.SendAsync(stream, pin, CancellationToken.None);
            Require(pin.IsCleared, "TRANSFER_SOURCE_CLEAR");
            stream.Position = 0;
            using var received = await PinTransfer.ReceiveAsync(stream, CancellationToken.None);
            Require(received.Span.SequenceEqual("synthetic-local-transfer"u8), "TRANSFER_ROUNDTRIP");
            received.Dispose();
            Require(received.IsCleared, "TRANSFER_RECEIVER_CLEAR");
            // MemoryStream exists only in this test. Real transport uses an OS pipe.
            CryptographicOperations.ZeroMemory(stream.GetBuffer());
            checks.Add("Binary PIN transfer clears the sender and receiver buffers");
        }
        using (var closed = new MemoryStream())
        using (var pin = new PinBuffer("synthetic"u8))
        {
            closed.Dispose();
            try { await PinTransfer.SendAsync(closed, pin, CancellationToken.None); }
            catch (ObjectDisposedException) { }
            Require(pin.IsCleared, "BROKEN_PIPE_CLEAR");
            checks.Add("Failed PIN transmission still clears its source buffer");
        }
        using (var malformed = new MemoryStream(new byte[] { 1, 1 }))
            await RejectAsync(async () => { using var pin = await PinTransfer.ReceiveAsync(malformed, CancellationToken.None); }, SigningError.PinFormat);
        checks.Add("Oversized binary PIN frame is rejected before allocation");

        var clock = new TestClock();
        var approval = new BatchApproval(batch, clock);
        Reject(() => approval.Consume(batch, approval.ApprovalId, batch.Digest(), "RECEIVER"), SigningError.ReceiverForbidden);
        checks.Add("Receiver cannot authorize signing");
        Reject(() => approval.Consume(batch with { OfficeId = 2 }, approval.ApprovalId, batch.Digest(), "SIGNER"), SigningError.ApprovalMismatch);
        Reject(() => approval.Consume(batch with { Profile = SigningProfile.PADES_B }, approval.ApprovalId, batch.Digest(), "SIGNER"), SigningError.ApprovalMismatch);
        Reject(() => approval.Consume(batch with { Documents = [batch.Documents[0] with { SourceSha256 = new string('c', 64) }] }, approval.ApprovalId, batch.Digest(), "SIGNER"), SigningError.ApprovalMismatch);
        checks.Add("Approval binds office, profile and exact document digests");
        approval.Consume(batch, approval.ApprovalId, batch.Digest(), "SIGNER");
        Reject(() => approval.Consume(batch, approval.ApprovalId, batch.Digest(), "SIGNER"), SigningError.ApprovalConsumed);
        checks.Add("Approval is consumed once");
        approval = new BatchApproval(batch, clock);
        clock.Advance(TimeSpan.FromMinutes(5));
        Reject(() => approval.Consume(batch, approval.ApprovalId, batch.Digest(), "SIGNER"), SigningError.ApprovalExpired);
        checks.Add("Approval expires at five minutes using monotonic time");

        using (var pin = new PinBuffer("synthetic"u8))
        {
            var token = new FakeToken(certificate);
            var adapter = new FakeAdapter();
            var session = new BatchSigningSession();
            var output = await session.RunAsync(batch, pin, () => token, adapter, CancellationToken.None);
            Require(output.Count == 2 && token.LoginAttempts == 1 && token.Signatures == 2 && token.Disposed && pin.IsCleared, "BATCH_SESSION");
            using var secondPin = new PinBuffer("synthetic"u8);
            await RejectAsync(() => session.RunAsync(batch, secondPin, () => token, adapter, CancellationToken.None), SigningError.ApprovalConsumed);
            Require(secondPin.IsCleared && token.LoginAttempts == 1, "SESSION_REUSE");
            checks.Add("Two documents share one login and the session cannot be reused");
        }
        foreach (var failure in new[] { SigningError.PinIncorrect, SigningError.PinLocked, SigningError.PinExpired })
        {
            using var pin = new PinBuffer("synthetic"u8);
            var token = new FakeToken(certificate) { LoginFailure = failure };
            await RejectAsync(() => new BatchSigningSession().RunAsync(batch, pin, () => token, new FakeAdapter(), CancellationToken.None), failure);
            Require(token.LoginAttempts == 1 && token.Signatures == 0 && token.Disposed && pin.IsCleared, "NO_LOGIN_RETRY");
        }
        checks.Add("Incorrect, locked and expired PINs stop after exactly one simulated login");
        using (var pin = new PinBuffer("synthetic"u8))
        {
            var token = new FakeToken("wrong-certificate"u8.ToArray());
            await RejectAsync(() => new BatchSigningSession().RunAsync(batch, pin, () => token, new FakeAdapter(), CancellationToken.None), SigningError.CertificateInvalid);
            Require(token.LoginAttempts == 0 && token.Disposed && pin.IsCleared, "CERTIFICATE_BOUND");
            checks.Add("Certificate mismatch stops before login and clears the PIN");
        }
        using (var pin = new PinBuffer("synthetic"u8))
        {
            await RejectAsync(() => new BatchSigningSession().RunAsync(batch, pin, () => throw new SigningFailure(SigningError.TokenMissing), new FakeAdapter(), CancellationToken.None), SigningError.TokenMissing);
            Require(pin.IsCleared, "OPEN_FAILURE_CLEAR");
            checks.Add("Driver/token open failure clears the PIN");
        }
        using (var pin = new PinBuffer("synthetic"u8))
        using (var cancelled = new CancellationTokenSource())
        {
            cancelled.Cancel();
            bool opened = false;
            try
            {
                await new BatchSigningSession().RunAsync(batch, pin, () => { opened = true; return new FakeToken(certificate); }, new FakeAdapter(), cancelled.Token);
                throw new InvalidOperationException("CANCELLATION_IGNORED");
            }
            catch (OperationCanceledException) { }
            Require(!opened && pin.IsCleared, "CANCEL_BEFORE_LOGIN");
            checks.Add("Cancellation before start never opens or logs in to the token");
        }
        using (var pin = new PinBuffer("synthetic"u8))
        {
            clock = new TestClock();
            var token = new FakeToken(certificate);
            var adapter = new FakeAdapter { BeforeSign = () => clock.Advance(TimeSpan.FromMinutes(5)) };
            await RejectAsync(() => new BatchSigningSession(clock).RunAsync(batch, pin, () => token, adapter, CancellationToken.None), SigningError.SessionExpired);
            Require(token.Signatures == 0 && token.Disposed && pin.IsCleared, "EXPIRED_BEFORE_SIGN");
            checks.Add("Session expiry blocks the private-key operation");
        }
        using (var pin = new PinBuffer("synthetic"u8))
        {
            var token = new FakeToken(certificate) { SignFailure = SigningError.TokenRemoved };
            await RejectAsync(() => new BatchSigningSession().RunAsync(batch, pin, () => token, new FakeAdapter(), CancellationToken.None), SigningError.TokenRemoved);
            Require(token.Signatures == 1 && token.LoginAttempts == 1 && token.Disposed, "REMOVAL_NO_RETRY");
            checks.Add("Token removal stops the batch without relogin or signature retry");
        }
        using (var pin = new PinBuffer("synthetic"u8))
        {
            var token = new FakeToken(certificate);
            await RejectAsync(() => new BatchSigningSession().RunAsync(batch, pin, () => token,
                new FakeAdapter { OutputProfile = SigningProfile.PADES_B }, CancellationToken.None), SigningError.ValidationFailed);
            Require(token.Signatures == 1 && token.Disposed, "DOWNGRADE_REJECTED");
            checks.Add("A lower output profile is rejected and stops the remaining batch");
        }
        Reject(() => Pkcs11SigningToken.Check(0xa0), SigningError.PinIncorrect);
        Reject(() => Pkcs11SigningToken.Check(0xa4), SigningError.PinLocked);
        Reject(() => Pkcs11SigningToken.Check(0xa3), SigningError.PinExpired);
        Reject(() => Pkcs11SigningToken.Check(0x32), SigningError.TokenRemoved);
        Reject(() => Pkcs11SigningToken.Check(0x100), SigningError.ExistingTokenSession);
        checks.Add("Native provider error codes map to fixed errors without raw diagnostics");

        using (var frame = new MemoryStream(new byte[] { 0x7f, 0xff, 0xff, 0xff }))
            await RejectAsync(() => SigningFrames.Read<SigningWork>(frame, CancellationToken.None), SigningError.InvalidBatch);
        checks.Add("Oversized worker metadata rejected before allocation");
        using (var frame = new MemoryStream())
        {
            await SigningFrames.Write(frame, batch, CancellationToken.None); frame.Position = 0;
            var restored = await SigningFrames.Read<SigningBatch>(frame, CancellationToken.None);
            Require(restored.Digest() == batch.Digest(), "WORKER_BATCH_BINDING");
        }
        checks.Add("Worker metadata preserves the exact approved batch digest");
        Reject(() => LocalSigningFiles.RequireLocalPath(Path.GetFullPath("synthetic.pdf") + ":hidden"), SigningError.InvalidBatch);
        Reject(() => LocalSigningFiles.RequireLocalPath(@"\\server\share\synthetic.pdf"), SigningError.InvalidBatch);
        checks.Add("Alternate data streams and network signing paths rejected");
        using (var child = new System.Diagnostics.Process { StartInfo = new System.Diagnostics.ProcessStartInfo(Environment.ProcessPath!) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true } })
        {
            child.StartInfo.ArgumentList.Add("--signing-worker-wait-test");
            using var job = new SigningProcessJob();
            try
            {
                Require(child.Start(), "JOB_CHILD_START");
                job.Assign(child);
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
                Require(await child.StandardOutput.ReadLineAsync(timeout.Token) == "WAITING_FOR_JOB_CLOSE", "JOB_CHILD_READY");
                job.Dispose();
                await child.WaitForExitAsync(timeout.Token);
                Require(child.HasExited, "JOB_CHILD_TERMINATED");
            }
            finally { if (!child.HasExited) { child.Kill(entireProcessTree: true); await child.WaitForExitAsync(); } }
        }
        checks.Add("Closing the owning Windows job terminates a real blocked child process");

        var single = batch with { Documents = [batch.Documents[0]] };
        using (var pin = new PinBuffer("synthetic"u8)) {
            var token = new FakeToken(certificate);
            using var session = new OfficeTokenSession(1, fingerprint, pin, () => token);
            await session.Sign(single, new FakeAdapter(), CancellationToken.None);
            await session.Sign(single with { Id = Guid.NewGuid(), Documents = [batch.Documents[1]] }, new FakeAdapter(), CancellationToken.None);
            Require(token.LoginAttempts == 1 && token.Signatures == 2 && pin.IsCleared && !token.Disposed, "REMOTE_REUSES_LOGIN");
            session.Dispose();
            await RejectAsync(() => session.Sign(single, new FakeAdapter(), CancellationToken.None), SigningError.SessionExpired);
            Require(token.Signatures == 2 && token.Disposed, "REMOTE_CLOSED");
            checks.Add("Remote office session signs two separate requests with one login; explicit close prevents another signature");
        }
        foreach (var invalid in new[] { single with { OfficeId = 2 }, single with { SignerFingerprint = new string('f', 64) }, batch }) {
            using var pin = new PinBuffer("synthetic"u8);
            var token = new FakeToken(certificate);
            using var session = new OfficeTokenSession(1, fingerprint, pin, () => token);
            await RejectAsync(() => session.Sign(invalid, new FakeAdapter(), CancellationToken.None), SigningError.ApprovalMismatch);
            Require(token.Signatures == 0 && token.Disposed, "REMOTE_BOUNDARY");
        }
        checks.Add("Remote session rejects a foreign office, a changed certificate and multiple documents per claim");
        using (var pin = new PinBuffer("synthetic"u8)) {
            var token = new FakeToken(certificate); var elapsed = new TestClock();
            using var session = new OfficeTokenSession(1, fingerprint, pin, () => token, elapsed);
            elapsed.Advance(TimeSpan.FromHours(8));
            await RejectAsync(() => session.Sign(single, new FakeAdapter(), CancellationToken.None), SigningError.SessionExpired);
            Require(token.Signatures == 0 && token.Disposed, "REMOTE_EXPIRY");
            checks.Add("Eight-hour remote session expiry prevents a native operation and closes the token");
        }
        foreach (var failure in new[] { SigningError.PinIncorrect, SigningError.PinLocked, SigningError.PinExpired }) {
            using var pin = new PinBuffer("synthetic"u8); var token = new FakeToken(certificate) { LoginFailure = failure };
            Reject(() => { using var session = new OfficeTokenSession(1, fingerprint, pin, () => token); }, failure);
            Require(pin.IsCleared && token.LoginAttempts == 1 && token.Disposed, "REMOTE_PIN_FAILURE");
        }
        checks.Add("Remote activation never retries an incorrect, locked or expired PIN and clears the buffer");
        using (var pin = new PinBuffer("synthetic"u8)) {
            var token = new FakeToken(certificate) { SignFailure = SigningError.TokenRemoved };
            using var session = new OfficeTokenSession(1, fingerprint, pin, () => token);
            await RejectAsync(() => session.Sign(single, new FakeAdapter(), CancellationToken.None), SigningError.TokenRemoved);
            await RejectAsync(() => session.Sign(single, new FakeAdapter(), CancellationToken.None), SigningError.SessionExpired);
            Require(token.Signatures == 1 && token.LoginAttempts == 1 && token.Disposed, "REMOTE_REMOVAL");
            checks.Add("Token failure closes remote session without relogin or automatic duplicate signature");
        }
        using (var pin = new PinBuffer("synthetic"u8)) {
            var token = new FakeToken(certificate);
            using var session = new OfficeTokenSession(1, fingerprint, pin, () => token);
            await RejectAsync(() => session.Sign(single, new FakeAdapter { OutputProfile = SigningProfile.PADES_B }, CancellationToken.None), SigningError.ValidationFailed);
            Require(token.Disposed && token.Signatures == 1, "REMOTE_DOWNGRADE");
            checks.Add("Remote signatures preserve requested profile and fail closed on a downgrade");
        }
        Console.WriteLine(JsonSerializer.Serialize(new { passed = checks.Count, realTokenLoginAttempts = 0, checks }, Configuration.Json));
        return 0;
    }
    private sealed class TestClock : TimeProvider
    {
        private long ticks;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override long GetTimestamp() => ticks;
        internal void Advance(TimeSpan elapsed) => ticks += elapsed.Ticks;
    }
    private sealed class FakeToken(byte[] certificate) : ISigningToken
    {
        internal int LoginAttempts, Signatures;
        internal bool Disposed;
        internal SigningError? LoginFailure, SignFailure;
        public byte[] Certificate => certificate;
        public IReadOnlyList<byte[]> CertificateChain => [certificate];
        public void Authenticate(PinBuffer pin)
        {
            LoginAttempts++;
            if (LoginFailure is { } failure) throw new SigningFailure(failure);
        }
        public byte[] SignSha256(ReadOnlySpan<byte> data)
        {
            Signatures++;
            if (SignFailure is { } failure) throw new SigningFailure(failure);
            return SHA256.HashData(data);
        }
        public void Dispose() => Disposed = true;
    }
    private sealed class FakeAdapter : IPdfSignerAdapter
    {
        internal Action? BeforeSign;
        internal SigningProfile? OutputProfile;
        public Task<SignedPdf> SignAsync(SigningDocument document, SigningProfile profile, ISigningToken token, CancellationToken cancellation)
        {
            BeforeSign?.Invoke();
            byte[] signature = token.SignSha256("synthetic-CMS-data"u8);
            return Task.FromResult(new SignedPdf(document.Id, Path.GetFullPath("synthetic-output.pdf"),
                Convert.ToHexStringLower(SHA256.HashData(signature)), OutputProfile ?? profile));
        }
    }
}
