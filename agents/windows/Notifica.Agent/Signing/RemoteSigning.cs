using System.Collections.Immutable;
using System.Text.Json;

namespace Notifica.Agent.Signing;

internal sealed record RemoteJournal(string ItemId, string LeaseToken, SigningBatch Batch, string State, SignedPdf? Output = null);

// One leased document per local approval for this first transfer integration.
// A durable signed output is retried as the SAME bytes, never signed again.
internal sealed class RemoteSigning : IAsyncDisposable
{
    private readonly Configuration config;
    private readonly DeviceApi api;
    private readonly Func<Identity?> identity;
    private readonly Action<bool> setActive;
    private readonly Func<CancellationToken, Task> waitForProbeIdle;
    private readonly string journalPath;
    private RemoteJournal? journal;
    private volatile ControlledSigning? current;
    private DateTimeOffset nextClaim = DateTimeOffset.MinValue;
    internal ControlledSigning? Current => current;
    internal RemoteSigning(Configuration config, DeviceApi api, Func<Identity?> identity,
        Action<bool> setActive, Func<CancellationToken, Task> waitForProbeIdle)
    {
        this.config = config; this.api = api; this.identity = identity; this.setActive = setActive; this.waitForProbeIdle = waitForProbeIdle;
        LocalSigningFiles.RequireLocalPath(config.DataDirectory);
        journalPath = Path.Combine(config.DataDirectory, "signing-work.json");
        if (File.Exists(journalPath)) {
            using var file = new FileStream(journalPath, FileMode.Open, FileAccess.Read, FileShare.Read);
            if (file.Length > 128 * 1024) throw new SigningFailure(SigningError.InvalidBatch);
            journal = JsonSerializer.Deserialize<RemoteJournal>(file, Configuration.Json) ?? throw new SigningFailure(SigningError.InvalidBatch);
            journal.Batch.Validate();
        }
    }
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
        try {
            while (!ct.IsCancellationRequested) {
                try {
                    var enrolled = identity();
                    if (enrolled is null || enrolled.Role == "RECEIVER") { await Task.Delay(1000, ct); continue; }
                    await api.Authenticate(enrolled, ct);
                    var saved = journal;
                    if (saved is not null) {
                        if (saved.Batch.OfficeId != enrolled.OfficeId || saved.Batch.SignerFingerprint != config.CertificateFingerprint)
                            throw new SigningFailure(SigningError.ApprovalMismatch);
                        var view = current?.View();
                        if (saved.State != "COMMITTED" && view?.State is not ("RECEIVING_PIN" or "SIGNING")) {
                            var recovery = await api.Post("recovery", Lease(saved), ct, true);
                            if (recovery.GetProperty("released").GetBoolean()) {
                                await Clear();
                                continue; // A new claim requires a new local approval; retained files are untouched.
                            }
                        }
                        if (view?.State is "AWAITING_APPROVAL" or "RECEIVING_PIN" or "SIGNING") {
                            await api.Post("renew", Lease(saved), ct, true);
                        } else if (saved.State == "SIGNED" && saved.Output is not null) {
                            // This includes restart recovery and lost HTTP responses.
                            await Upload(saved, ct);
                            current?.MarkCommitted(); nextClaim = DateTimeOffset.UtcNow.AddSeconds(30);
                        } else if (saved.State == "COMMITTED") {
                            if (DateTimeOffset.UtcNow >= nextClaim) { await Clear(); }
                        } else if (view?.State == "EXPIRED" || (current is null && saved.State == "CLAIMED")) {
                            await api.Post("release", Lease(saved), ct, true); await Clear();
                        } else if (saved.State != "WAITING_FOR_OPERATOR" && (view?.State == "FAILED" || current is null)) {
                            string code = view?.Error switch {
                                "PinIncorrect" or "PinLocked" or "PinExpired" => "PIN_INCORRECT",
                                "TokenMissing" or "TokenRemoved" => "TOKEN_MISSING",
                                "InputChanged" => "CHECKSUM_MISMATCH", _ => "OUTCOME_UNKNOWN" };
                            await api.Post("fail", new { itemId = saved.ItemId, leaseToken = saved.LeaseToken, errorCode = code }, ct, true);
                            Save(saved with { State = "WAITING_FOR_OPERATOR" });
                        }
                    } else if (DateTimeOffset.UtcNow >= nextClaim) {
                        var claimed = await api.Post("claim", new { }, ct, true);
                        if (claimed.ValueKind != JsonValueKind.Null) await Prepare(claimed, enrolled, ct);
                    }
                } catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
                catch { /* Bounded retry of transport only; no approval/PIN/token retry. Journal retained. */ }
                await Task.Delay(TimeSpan.FromSeconds(15), ct);
            }
        } finally { if (current is not null) await current.DisposeAsync(); }
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
            current = new ControlledSigning(config, batch, config.SigningEngine!, enrolled.Role, setActive, waitForProbeIdle) {
                BeforeSign = async cancellation => {
                    await api.Authenticate(enrolled, cancellation);
                    // Persist uncertainty BEFORE the remote irreversible-work fence.
                    Save(journal! with { State = "SIGNING" });
                    await api.Post("start", lease, cancellation, true);
                },
                AfterSign = async (results, cancellation) => {
                    if (results.Count != 1) throw new SigningFailure(SigningError.ValidationFailed);
                    var signed = journal! with { State = "SIGNED", Output = results[0] };
                    Save(signed); await Upload(signed, cancellation);
                    nextClaim = DateTimeOffset.UtcNow.AddSeconds(30);
                }
            };
        } catch {
            if (journal is null) { try { await api.Post("release", lease, ct, true); } catch { } }
            throw;
        }
    }
    private async Task Clear()
    {
        if (current is not null) await current.DisposeAsync();
        current = null; journal = null;
        if (File.Exists(journalPath)) File.Delete(journalPath);
        // Retain source/output files for recovery; no broad directory deletion.
    }
    public ValueTask DisposeAsync() => current?.DisposeAsync() ?? ValueTask.CompletedTask;
}
