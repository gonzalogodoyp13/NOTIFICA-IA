using System.Text.Json;

namespace Notifica.Agent.Signing;

// Phase 6 controlled inputs only. This mode cannot enroll a production device,
// claim jobs, or promote signed documents into the application's version store.
internal sealed record ControlledSigningOptions(string ManifestPath, int OfficeId, string Role, DssEngineOptions Engine)
{
    internal void Validate(Configuration config)
    {
        if (config.MachineKey || !new Uri(config.ServerUrl).IsLoopback || OfficeId < 1
            || Role is not ("SIGNER" or "SIGNER_RECEIVER" or "RECEIVER") || config.CertificateFingerprint is null)
            throw new SigningFailure(SigningError.InvalidBatch);
        LocalSigningFiles.RequireLocalPath(ManifestPath);
        Engine.Validate();
    }
}

internal sealed record ControlledBatchView(SigningBatch Batch, Guid ApprovalId, string Digest,
    string State, string? Error, IReadOnlyList<SignedPdf> Results, int? TokenLoginAttempts = null, int? TokenSignatureOperations = null,
    int RemainingApprovalMilliseconds = 0);

internal sealed class ControlledSigning : IAsyncDisposable
{
    private readonly Configuration config;
    private readonly SigningBatch batch;
    private readonly BatchApproval approval;
    private readonly CancellationTokenSource lifetime = new();
    private readonly object gate = new();
    private string state = "AWAITING_APPROVAL";
    private string? error;
    private IReadOnlyList<SignedPdf> results = [];
    private int? loginAttempts, signatureOperations;
    private Task? running;
    private readonly Action<bool> setActive;
    private readonly Func<CancellationToken, Task> waitForProbeIdle;
    internal ControlledSigning(Configuration config, Action<bool> setActive, Func<CancellationToken, Task> waitForProbeIdle,
        TimeProvider? clock = null)
    {
        this.config = config;
        this.setActive = setActive;
        this.waitForProbeIdle = waitForProbeIdle;
        var options = config.ControlledSigning ?? throw new SigningFailure(SigningError.InvalidBatch);
        options.Validate(config);
        // Freeze metadata once. Approval and worker use the same immutable batch.
        using var file = new FileStream(options.ManifestPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (file.Length is < 1 or > 128 * 1024) throw new SigningFailure(SigningError.InvalidBatch);
        batch = JsonSerializer.Deserialize<SigningBatch>(file, Configuration.Json) ?? throw new SigningFailure(SigningError.InvalidBatch);
        batch.Validate();
        if (batch.OfficeId != options.OfficeId || batch.SignerFingerprint != config.CertificateFingerprint)
            throw new SigningFailure(SigningError.ApprovalMismatch);
        approval = new BatchApproval(batch, clock);
    }
    internal ControlledBatchView View()
    {
        lock (gate)
        {
            ExpireApproval();
            return new(batch, approval.ApprovalId, batch.Digest(), state, error, results, loginAttempts, signatureOperations,
                state == "AWAITING_APPROVAL" ? (int)approval.RemainingLifetime.TotalMilliseconds : 0);
        }
    }
    private void ExpireApproval()
    {
        if (state == "AWAITING_APPROVAL" && approval.RemainingLifetime == TimeSpan.Zero)
        { state = "EXPIRED"; error = SigningError.ApprovalExpired.ToString(); }
    }
    internal void Reserve(Guid id, string digest)
    {
        lock (gate)
        {
            ExpireApproval();
            if (state == "EXPIRED") throw new SigningFailure(SigningError.ApprovalExpired);
            if (state != "AWAITING_APPROVAL") throw new SigningFailure(SigningError.ApprovalConsumed);
            approval.Consume(batch, id, digest, config.ControlledSigning!.Role);
            state = "RECEIVING_PIN";
        }
    }
    internal void Abandon()
    {
        lock (gate)
            if (state == "RECEIVING_PIN") { state = "FAILED"; error = SigningError.Cancelled.ToString(); }
    }
    internal void Start(PinBuffer pin)
    {
        lock (gate)
        {
            if (state != "RECEIVING_PIN") { pin.Dispose(); throw new SigningFailure(SigningError.ApprovalConsumed); }
            state = "SIGNING";
            setActive(true);
            // Task ownership remains with this coordinator, including on service
            // shutdown. The IPC connection can close without abandoning a worker.
            running = Task.Run(async () => {
                try
                {
                    await waitForProbeIdle(lifetime.Token);
                    var answer = await SigningWorker.Execute(new(batch, config.Pkcs11Library, config.ControlledSigning!.Engine), pin, lifetime.Token);
                    lock (gate) { results = answer.Documents; error = answer.Error; loginAttempts = answer.TokenLoginAttempts;
                        signatureOperations = answer.TokenSignatureOperations; state = answer.Ok ? "COMPLETED" : "FAILED"; }
                }
                catch (Exception failure)
                {
                    lock (gate)
                    {
                        error = failure is SigningFailure known ? known.Code.ToString()
                            : failure is OperationCanceledException ? SigningError.SessionExpired.ToString() : SigningError.EngineFailure.ToString();
                        state = "FAILED";
                    }
                }
                finally { pin.Dispose(); setActive(false); }
            });
        }
    }
    public async ValueTask DisposeAsync()
    {
        lifetime.Cancel();
        if (running is not null) await running;
        lifetime.Dispose();
    }
}
