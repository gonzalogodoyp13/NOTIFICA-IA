using System.Collections.Immutable;
using System.Text.Json;

namespace Notifica.Agent.Signing;

internal sealed record RemoteJournal(string ItemId, string LeaseToken, SigningBatch Batch, string State, SignedPdf? Output = null,
    int TransportFailures = 0, DateTimeOffset? RetryAt = null);

// Web-authorized documents execute through a separately enabled local token session.
// A durable signed output is retried as the SAME bytes, never signed again.
internal sealed class RemoteSigning : IAsyncDisposable
{
    private readonly Configuration config;
    private readonly DeviceApi api;
    private readonly Func<Identity?> identity;
    private readonly Action<bool> setActive;
    private readonly Func<CancellationToken, Task> waitForProbeIdle;
    private readonly string journalPath;
    private readonly IRemoteTokenSession tokenSession;
    private readonly SemaphoreSlim enabling = new(1);
    internal RemoteSessionView Session => tokenSession.View;
    internal int? OfficeId => identity()?.OfficeId;
    private RemoteJournal? journal;
    private volatile ControlledSigning? current;
    private DateTimeOffset nextClaim = DateTimeOffset.MinValue;
    internal ControlledSigning? Current => current;
    internal string? ErrorCode { get; private set; }
    internal RemoteSigning(Configuration config, DeviceApi api, Func<Identity?> identity,
        Action<bool> setActive, Func<CancellationToken, Task> waitForProbeIdle, IRemoteTokenSession? tokenSession = null)
    {
        this.config = config; this.api = api; this.identity = identity; this.setActive = setActive; this.waitForProbeIdle = waitForProbeIdle;
        this.tokenSession = tokenSession ?? new RemoteTokenSession(config);
        LocalSigningFiles.RequireLocalPath(config.DataDirectory);
        journalPath = Path.Combine(config.DataDirectory, "signing-work.json");
        if (File.Exists(journalPath)) {
            using var file = new FileStream(journalPath, FileMode.Open, FileAccess.Read, FileShare.Read);
            if (file.Length > 128 * 1024) throw new SigningFailure(SigningError.InvalidBatch);
            journal = JsonSerializer.Deserialize<RemoteJournal>(file, Configuration.Json) ?? throw new SigningFailure(SigningError.InvalidBatch);
            journal.Batch.Validate();
        }
    }
    internal async Task Enable(PinBuffer pin, CancellationToken ct)
    {
        try {
            await enabling.WaitAsync(ct);
            try {
                var enrolled = identity();
                if (enrolled is null || enrolled.Role is not ("SIGNER" or "SIGNER_RECEIVER")) throw new SigningFailure(SigningError.ReceiverForbidden);
                if (Session.Enabled || current?.View().State == "SIGNING") throw new SigningFailure(SigningError.ExistingTokenSession);
                await api.Authenticate(enrolled, ct);
                setActive(true);
                try {
                    await waitForProbeIdle(ct);
                    await tokenSession.Enable(enrolled.OfficeId, pin, ct);
                    ErrorCode = null;
                } catch (Exception failure) {
                    setActive(false);
                    ErrorCode = failure is SigningFailure known ? FailurePolicy.SigningCode(known.Code.ToString()) : "UNKNOWN";
                    throw;
                }
            } finally { enabling.Release(); }
        } finally { pin.Dispose(); }
    }
    internal void Disable() { tokenSession.Disable(); setActive(false); }
    private void Save(RemoteJournal value)
    {
        string temporary = journalPath + ".part";
        using (var file = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None)) {
            JsonSerializer.Serialize(file, value, Configuration.Json); file.Flush(true);
        }
        File.Move(temporary, journalPath, true); journal = value;
    }
    private object Lease(RemoteJournal value) => new { itemId = value.ItemId, leaseToken = value.LeaseToken };
    private async Task Upload(RemoteJournal value, CancellationToken ct)
    {
        await api.Authenticate(identity() ?? throw new SigningFailure(SigningError.InvalidBatch), ct);
        await api.Upload(value.ItemId, value.LeaseToken, value.Output ?? throw new SigningFailure(SigningError.InvalidBatch), ct);
        Save(value with { State = "COMMITTED" });
    }
    internal async Task Run(CancellationToken ct)
    {
        int transportFailures = 0;
        try {
            while (!ct.IsCancellationRequested) {
                try {
                    var enrolled = identity();
                    if (enrolled is null || enrolled.Role == "RECEIVER") { await Task.Delay(1000, ct); continue; }
                    await api.Authenticate(enrolled, ct);
                    if (current?.View().State != "SIGNING" && await enabling.WaitAsync(0, ct)) {
                        try {
                            if (Session.Enabled) {
                                try { await tokenSession.Check(ct); }
                                catch { Disable(); ErrorCode = "PIN_REQUIRED"; }
                            } else { Disable(); }
                        } finally { enabling.Release(); }
                    }
                    var saved = journal;
                    if (saved is not null) {
                        if (saved.Batch.OfficeId != enrolled.OfficeId || saved.Batch.SignerFingerprint != config.CertificateFingerprint)
                            throw new SigningFailure(SigningError.ApprovalMismatch);
                        var view = current?.View();
                        if (saved.State != "COMMITTED" && view?.State is not ("RECEIVING_PIN" or "SIGNING")) {
                            var recovery = await api.Post("recovery", Lease(saved), ct, true);
                            // Even an exhausted transfer budget may have committed remotely.
                            // Reconcile the original attempt/hash before clearing its journal.
                            if (recovery.TryGetProperty("committed", out var committed) && committed.GetBoolean()
                                && saved.Output is not null && recovery.GetProperty("checksumSha256").GetString() == saved.Output.Sha256) {
                                Save(saved with { State = "COMMITTED" }); current?.MarkCommitted(); ErrorCode = null;
                                nextClaim = DateTimeOffset.UtcNow.AddSeconds(30); continue;
                            }
                            if (recovery.GetProperty("released").GetBoolean()) {
                                await Clear();
                                continue; // Reviewed recovery authorizes a fresh claim; retained files are untouched.
                            }
                        }
                        if (view?.State is "AWAITING_APPROVAL" or "RECEIVING_PIN" or "SIGNING") {
                            await api.Post("renew", Lease(saved), ct, true);
                        } else if (saved.State == "SIGNED" && saved.Output is not null) {
                            // This includes restart recovery and lost HTTP responses.
                            if (saved.RetryAt > DateTimeOffset.UtcNow) { await Task.Delay(1000, ct); continue; }
                            await Upload(saved, ct);
                            ErrorCode = null;
                            current?.MarkCommitted(); nextClaim = DateTimeOffset.UtcNow.AddSeconds(30);
                        } else if (saved.State == "COMMITTED") {
                            if (DateTimeOffset.UtcNow >= nextClaim) { await Clear(); }
                        } else if (view?.State == "EXPIRED" || (current is null && saved.State == "CLAIMED")) {
                            await api.Post("release", Lease(saved), ct, true); await Clear();
                        } else if (saved.State != "WAITING_FOR_OPERATOR" && (view?.State == "FAILED" || current is null)) {
                            string code = FailurePolicy.SigningCode(view?.Error);
                            ErrorCode = code;
                            FailurePolicy.Log(config, code, saved.Batch.Id);
                            await api.Post("fail", new { itemId = saved.ItemId, leaseToken = saved.LeaseToken, errorCode = code }, ct, true);
                            Save(saved with { State = "WAITING_FOR_OPERATOR" });
                        }
                    } else if (Session.Enabled && DateTimeOffset.UtcNow >= nextClaim) {
                        var claimed = await api.Post("claim", new { }, ct, true);
                        if (claimed.ValueKind != JsonValueKind.Null) await Prepare(claimed, enrolled, ct);
                    } else if (!Session.Enabled) ErrorCode ??= "PIN_REQUIRED";
                    transportFailures = 0;
                } catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
                catch (Exception failure) {
                    transportFailures++;
                    ErrorCode = FailurePolicy.TransferCode(failure);
                    if (failure is ApiFailure rejected && rejected.Code is "DEVICE_UNAUTHORIZED" or "DEVICE_FORBIDDEN" or "DEVICE_ROLE_FORBIDDEN") Disable();
                    FailurePolicy.Log(config, ErrorCode, journal?.Batch.Id ?? Guid.NewGuid());
                    var saved = journal;
                    if (saved?.State == "SIGNED") {
                        int failures = saved.TransportFailures + 1;
                        bool stopped = failures >= FailurePolicy.MaximumTransportAttempts || ErrorCode is "VALIDATION_FAILED" or "CERT_REVOKED" or "CHECKSUM_MISMATCH" or "DISK";
                        Save(saved with { TransportFailures = failures, RetryAt = DateTimeOffset.UtcNow + FailurePolicy.Delay(failures), State = stopped ? "WAITING_FOR_OPERATOR" : "SIGNED" });
                        if (stopped) {
                            try { await api.Post("fail", new { itemId = saved.ItemId, leaseToken = saved.LeaseToken, errorCode = ErrorCode == "NETWORK" ? "OUTCOME_UNKNOWN" : ErrorCode }, ct, true); } catch { }
                        }
                    }
                }
                await Task.Delay(FailurePolicy.Delay(transportFailures), ct);
            }
        } finally { Disable(); if (current is not null) await current.DisposeAsync(); }
    }
    private async Task Prepare(JsonElement claimed, Identity enrolled, CancellationToken ct)
    {
        string itemId = claimed.GetProperty("itemId").GetString()!, leaseToken = claimed.GetProperty("leaseToken").GetString()!;
        var lease = new { itemId, leaseToken };
        try {
            var metadata = await api.Post("input", lease, ct, true);
            if (!metadata.GetProperty("transferAvailable").GetBoolean() || metadata.GetProperty("officeId").GetInt32() != enrolled.OfficeId
                || metadata.GetProperty("signerFingerprint").GetString() != config.CertificateFingerprint)
                throw new SigningFailure(SigningError.ApprovalMismatch);
            string documentId = metadata.GetProperty("documentoId").GetString()!;
            string sourceHash = metadata.GetProperty("checksumSha256").GetString()!;
            string file = Path.Combine(config.DataDirectory, Guid.NewGuid().ToString("N") + ".pdf");
            await api.Download(lease, file, metadata.GetProperty("sizeBytes").GetInt64(), sourceHash, ct);
            var batch = new SigningBatch(Guid.NewGuid(), enrolled.OfficeId, metadata.GetProperty("officeName").GetString()!,
                metadata.GetProperty("requester").GetString()!, "Certificado seleccionado en este equipo", config.CertificateFingerprint!,
                Enum.Parse<SigningProfile>(metadata.GetProperty("requestedLevel").GetString()!),
                ImmutableArray.Create(new SigningDocument(documentId, file, sourceHash)));
            Save(new(itemId, leaseToken, batch, "CLAIMED"));
            var enabled = Session;
            if (!enabled.Enabled || enabled.SessionId is null) throw new SigningFailure(SigningError.SessionExpired);
            current = new ControlledSigning(config, batch, config.SigningEngine!, enrolled.Role, setActive, waitForProbeIdle) {
                BeforeSign = async cancellation => {
                    await api.Authenticate(enrolled, cancellation);
                    // Persist uncertainty BEFORE the remote irreversible-work fence.
                    Save(journal! with { State = "SIGNING" });
                    await api.Post("start", new { itemId, leaseToken, remoteSessionId = enabled.SessionId.Value, batchId = batch.Id }, cancellation, true);
                },
                AfterSign = async (results, cancellation) => {
                    if (results.Count != 1) throw new SigningFailure(SigningError.ValidationFailed);
                    var signed = journal! with { State = "SIGNED", Output = results[0] };
                    Save(signed); await Upload(signed, cancellation);
                    nextClaim = DateTimeOffset.UtcNow.AddSeconds(30);
                }
            };
            current.StartRemote(tokenSession, enabled.SessionId.Value);
        } catch (Exception error) {
            ErrorCode = FailurePolicy.TransferCode(error);
            if (journal is null) { try { await api.Post("fail", new { itemId, leaseToken, errorCode = ErrorCode }, ct, true); } catch { } }
            throw;
        }
    }
    private async Task Clear()
    {
        if (current is not null) await current.DisposeAsync();
        current = null; journal = null; ErrorCode = null;
        if (File.Exists(journalPath)) File.Delete(journalPath);
        // Retain source/output files for recovery; no broad directory deletion.
    }
    public async ValueTask DisposeAsync() { Disable(); if (current is not null) await current.DisposeAsync(); tokenSession.Dispose(); }
}
