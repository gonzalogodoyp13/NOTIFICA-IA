using System.Security.Cryptography;

namespace Notifica.Agent.Signing;

// One explicit local login enables requests for this office/certificate only.
// The PIN is destroyed after login; the native token session is kept in memory.
internal sealed class OfficeTokenSession : IDisposable
{
    internal static readonly TimeSpan MaximumLifetime = TimeSpan.FromHours(8);
    private readonly ISigningToken token;
    private readonly int officeId;
    private readonly string fingerprint;
    private readonly TimeProvider clock;
    private readonly long started;
    private bool disposed;
    private readonly SemaphoreSlim serial = new(1);
    internal OfficeTokenSession(int officeId, string fingerprint, PinBuffer pin, Func<ISigningToken> open,
        TimeProvider? clock = null)
    {
        this.officeId = officeId; this.fingerprint = fingerprint; this.clock = clock ?? TimeProvider.System;
        started = this.clock.GetTimestamp();
        ISigningToken? opened = null;
        try {
            if (officeId < 1 || !SigningBatch.IsSha256(fingerprint)) throw new SigningFailure(SigningError.InvalidBatch);
            opened = open();
            if (Convert.ToHexStringLower(SHA256.HashData(opened.Certificate)) != fingerprint)
                throw new SigningFailure(SigningError.CertificateInvalid);
            opened.Authenticate(pin);
            token = opened;
        } catch { opened?.Dispose(); throw; }
        finally { pin.Dispose(); }
    }
    internal void Check()
    {
        if (disposed || clock.GetElapsedTime(started) >= MaximumLifetime) throw new SigningFailure(SigningError.SessionExpired);
        if (token is Pkcs11SigningToken native) native.CheckAuthenticated();
    }
    internal async Task<IReadOnlyList<SignedPdf>> Sign(SigningBatch batch, IPdfSignerAdapter adapter, CancellationToken ct)
    {
        await serial.WaitAsync(ct);
        try {
            Check(); batch.Validate();
            if (batch.OfficeId != officeId || batch.SignerFingerprint != fingerprint || batch.Documents.Length != 1)
                throw new SigningFailure(SigningError.ApprovalMismatch);
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
            deadline.CancelAfter(BatchSigningSession.MaximumLifetime);
            using var guarded = new GuardedToken(this, deadline.Token);
            var result = await adapter.SignAsync(batch.Documents[0], batch.Profile, guarded, deadline.Token);
            Check();
            if (result.DocumentId != batch.Documents[0].Id || result.Profile != batch.Profile || !SigningBatch.IsSha256(result.Sha256))
                throw new SigningFailure(SigningError.ValidationFailed);
            return [result];
        } catch { Dispose(); throw; }
        finally { serial.Release(); }
    }
    private sealed class GuardedToken(OfficeTokenSession owner, CancellationToken cancellation) : ISigningToken
    {
        public byte[] Certificate => owner.token.Certificate;
        public IReadOnlyList<byte[]> CertificateChain => owner.token.CertificateChain;
        public void Authenticate(PinBuffer pin) => throw new SigningFailure(SigningError.LoginAlreadyAttempted);
        public byte[] SignSha256(ReadOnlySpan<byte> bytes) { cancellation.ThrowIfCancellationRequested(); owner.Check(); return owner.token.SignSha256(bytes); }
        public void Dispose() { }
    }
    public void Dispose() { if (disposed) return; disposed = true; token.Dispose(); }
}
