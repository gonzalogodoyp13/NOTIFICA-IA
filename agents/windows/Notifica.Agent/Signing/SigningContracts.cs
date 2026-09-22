using System.Collections.Immutable;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Notifica.Agent.Signing;

internal enum SigningProfile { PADES_B, PADES_LT, PADES_LTA }
internal enum SigningError
{
    InvalidBatch, ApprovalExpired, ApprovalMismatch, ApprovalConsumed, ReceiverForbidden,
    SessionExpired, PinFormat, PinIncorrect, PinLocked, PinExpired, LoginAlreadyAttempted,
    ExistingTokenSession, TokenMissing, TokenRemoved, DriverFailure, CertificateMissing,
    CertificateAmbiguous, CertificateInvalid, PrivateKeyPolicy, UnsupportedKey,
    SignatureInvalid, InputChanged, OutputCollision, EngineFailure, ValidationFailed,
    TimestampUnavailable, RevocationUnavailable, Cancelled
}
internal sealed class SigningFailure(SigningError code) : Exception(code.ToString())
{
    internal SigningError Code { get; } = code;
}
internal sealed record SigningDocument(string Id, string SourcePath, string SourceSha256);
internal sealed record SigningBatch(Guid Id, int OfficeId, string OfficeName, string Requester,
    string SignerName, string SignerFingerprint, SigningProfile Profile, ImmutableArray<SigningDocument> Documents)
{
    internal static bool IsSha256(string value) => Regex.IsMatch(value, "^[a-f0-9]{64}$", RegexOptions.CultureInvariant);
    internal void Validate()
    {
        if (Id == Guid.Empty || OfficeId < 1 || !Label(OfficeName) || !Label(Requester) || !Label(SignerName)
            || !IsSha256(SignerFingerprint) || !Enum.IsDefined(Profile) || Documents.IsDefaultOrEmpty || Documents.Length > 100
            || Documents.Any(d => d is null || !Label(d.Id) || !Path.IsPathFullyQualified(d.SourcePath) || !IsSha256(d.SourceSha256))
            || Documents.Select(d => d.Id).Distinct(StringComparer.Ordinal).Count() != Documents.Length
            || Documents.Select(d => Path.GetFullPath(d.SourcePath)).Distinct(StringComparer.OrdinalIgnoreCase).Count() != Documents.Length)
            throw new SigningFailure(SigningError.InvalidBatch);
    }
    private static bool Label(string value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 200 && !value.Any(char.IsControl);
    internal string Digest()
    {
        Validate();
        return Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(this, Configuration.Json)));
    }
}
internal sealed record SignedPdf(string DocumentId, string OutputPath, string Sha256, SigningProfile Profile);

internal interface ISigningToken : IDisposable
{
    byte[] Certificate { get; }
    IReadOnlyList<byte[]> CertificateChain { get; }
    void Authenticate(PinBuffer pin);
    byte[] SignSha256(ReadOnlySpan<byte> data);
}

// PDF formatting, TSA and revocation acquisition belong to the replaceable
// adapter. Only the token implementation has access to the local PIN.
internal interface IPdfSignerAdapter
{
    Task<SignedPdf> SignAsync(SigningDocument document, SigningProfile profile,
        ISigningToken token, CancellationToken cancellation);
}

internal sealed class BatchApproval
{
    private readonly Guid batchId;
    private readonly string digest;
    private readonly TimeProvider clock;
    private readonly long created;
    private int consumed;
    internal Guid ApprovalId { get; } = Guid.NewGuid();
    internal static readonly TimeSpan MaximumLifetime = TimeSpan.FromMinutes(5);
    internal TimeSpan RemainingLifetime => TimeSpan.FromTicks(Math.Max(0,
        (MaximumLifetime - clock.GetElapsedTime(created)).Ticks));
    internal BatchApproval(SigningBatch batch, TimeProvider? clock = null)
    {
        batchId = batch.Id;
        digest = batch.Digest();
        this.clock = clock ?? TimeProvider.System;
        created = this.clock.GetTimestamp();
    }
    internal void Consume(SigningBatch batch, Guid approvalId, string approvedDigest, string role)
    {
        if (role is not ("SIGNER" or "SIGNER_RECEIVER")) throw new SigningFailure(SigningError.ReceiverForbidden);
        if (RemainingLifetime == TimeSpan.Zero) throw new SigningFailure(SigningError.ApprovalExpired);
        if (batch.Id != batchId || approvalId != ApprovalId || approvedDigest != digest || batch.Digest() != digest)
            throw new SigningFailure(SigningError.ApprovalMismatch);
        if (Interlocked.Exchange(ref consumed, 1) != 0) throw new SigningFailure(SigningError.ApprovalConsumed);
    }
}

internal sealed class BatchSigningSession(TimeProvider? timeProvider = null)
{
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    internal static readonly TimeSpan MaximumLifetime = TimeSpan.FromMinutes(5);
    private int started;

    internal async Task<IReadOnlyList<SignedPdf>> RunAsync(SigningBatch batch, PinBuffer pin,
        Func<ISigningToken> openToken, IPdfSignerAdapter adapter, CancellationToken cancellation)
    {
        try
        {
            batch.Validate();
            if (Interlocked.Exchange(ref started, 1) != 0) throw new SigningFailure(SigningError.ApprovalConsumed);
            cancellation.ThrowIfCancellationRequested();
            long start = clock.GetTimestamp();
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
            deadline.CancelAfter(MaximumLifetime);
            using var token = openToken();
            if (Convert.ToHexStringLower(SHA256.HashData(token.Certificate)) != batch.SignerFingerprint)
                throw new SigningFailure(SigningError.CertificateInvalid);
            using var bounded = new BoundedToken(token, clock, start, deadline.Token);
            // One login only. Every failure terminates this batch session.
            try { token.Authenticate(pin); }
            finally { pin.Dispose(); }
            var results = new List<SignedPdf>();
            foreach (var document in batch.Documents)
            {
                bounded.Check();
                var result = await adapter.SignAsync(document, batch.Profile, bounded, deadline.Token);
                bounded.Check();
                if (result.DocumentId != document.Id || result.Profile != batch.Profile || !SigningBatch.IsSha256(result.Sha256))
                    throw new SigningFailure(SigningError.ValidationFailed);
                results.Add(result);
            }
            return results;
        }
        finally { pin.Dispose(); }
    }

    private sealed class BoundedToken(ISigningToken inner, TimeProvider clock, long started, CancellationToken cancellation) : ISigningToken
    {
        public byte[] Certificate => inner.Certificate;
        public IReadOnlyList<byte[]> CertificateChain => inner.CertificateChain;
        public void Authenticate(PinBuffer pin) => throw new SigningFailure(SigningError.LoginAlreadyAttempted);
        internal void Check()
        {
            cancellation.ThrowIfCancellationRequested();
            if (clock.GetElapsedTime(started) >= MaximumLifetime) throw new SigningFailure(SigningError.SessionExpired);
        }
        public byte[] SignSha256(ReadOnlySpan<byte> data) { Check(); return inner.SignSha256(data); }
        public void Dispose() { /* The session owns and disposes the underlying token. */ }
    }
}
