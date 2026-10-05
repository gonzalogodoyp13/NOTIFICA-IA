using System.Diagnostics;

namespace Notifica.Agent.Signing;

internal sealed record RemoteSessionView(bool Enabled, Guid? SessionId, DateTimeOffset? ExpiresAt, string? Error);
internal interface IRemoteTokenSession : IDisposable
{
    RemoteSessionView View { get; }
    Task Enable(int officeId, PinBuffer pin, CancellationToken ct);
    Task Check(CancellationToken ct);
    Task<IReadOnlyList<SignedPdf>> Sign(SigningBatch batch, Guid sessionId, CancellationToken ct);
    void Disable();
}
internal sealed record RemoteSessionSetup(int OfficeId, string Fingerprint, string Library, DssEngineOptions Engine);
internal sealed record RemoteSessionCommand(string Action, SigningBatch? Batch = null);

internal sealed class RemoteTokenSession(Configuration config) : IRemoteTokenSession
{
    private readonly SemaphoreSlim serial = new(1);
    private Link? link;
    private string? error;
    public RemoteSessionView View {
        get {
            var current = Volatile.Read(ref link);
            return current is not null && current.Alive
                ? new(true, current.Id, current.ExpiresAt, null) : new(false, null, null, error);
        }
    }
    public async Task Enable(int officeId, PinBuffer pin, CancellationToken ct)
    {
        try {
            await serial.WaitAsync(ct);
            try {
                if (View.Enabled) throw new SigningFailure(SigningError.ExistingTokenSession);
                Disable(); error = null;
                var fresh = new Link();
                Interlocked.Exchange(ref link, fresh);
                try {
                    await fresh.Open(new(officeId, config.CertificateFingerprint!, config.Pkcs11Library, config.SigningEngine!), pin, ct);
                } catch (Exception failure) {
                    error = failure is SigningFailure known ? known.Code.ToString() : SigningError.EngineFailure.ToString();
                    Disable(); throw;
                }
            } finally { serial.Release(); }
        } finally { pin.Dispose(); }
    }
    public async Task Check(CancellationToken ct) => _ = await Command(new("check"), ct);
    public async Task<IReadOnlyList<SignedPdf>> Sign(SigningBatch batch, Guid sessionId, CancellationToken ct) =>
        (await Command(new("sign", batch), ct, sessionId)).Documents;
    private async Task<SigningWorkResult> Command(RemoteSessionCommand command, CancellationToken ct, Guid? sessionId = null)
    {
        await serial.WaitAsync(ct);
        try {
            var current = Volatile.Read(ref link);
            if (current is null || !current.Alive || (sessionId is not null && current.Id != sessionId)) throw new SigningFailure(SigningError.SessionExpired);
            return await current.Command(command, ct);
        } catch (Exception failure) {
            error = failure is SigningFailure known ? known.Code.ToString() : SigningError.EngineFailure.ToString();
            Disable(); throw;
        } finally { serial.Release(); }
    }
    public void Disable() => Interlocked.Exchange(ref link, null)?.Dispose();
    public void Dispose() => Disable();

    private sealed class Link : IDisposable
    {
        private readonly Process process = new() { StartInfo = new ProcessStartInfo(Environment.ProcessPath!) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true } };
        private readonly SigningProcessJob job = new();
        private readonly CancellationTokenSource lifetime = new();
        private int closed;
        private int signatures;
        private bool started, ready;
        internal Guid Id { get; } = Guid.NewGuid();
        internal DateTimeOffset ExpiresAt { get; } = DateTimeOffset.UtcNow + OfficeTokenSession.MaximumLifetime;
        internal bool Alive {
            get { try { return closed == 0 && ready && started && !process.HasExited && DateTimeOffset.UtcNow < ExpiresAt; }
                catch (InvalidOperationException) { return false; } }
        }
        internal async Task Open(RemoteSessionSetup setup, PinBuffer pin, CancellationToken ct)
        {
            process.StartInfo.ArgumentList.Add("--remote-token-worker");
            foreach (string name in new[] { "DOTNET_DbgEnableMiniDump", "COMPlus_DbgEnableMiniDump", "DOTNET_DiagnosticPorts", "DOTNET_StartupHook", "DOTNET_STARTUP_HOOKS" }) process.StartInfo.Environment.Remove(name);
            process.StartInfo.Environment["DOTNET_EnableDiagnostics"] = "0";
            started = process.Start();
            if (!started) throw new SigningFailure(SigningError.EngineFailure);
            job.Assign(process);
            _ = Drain(process.StandardError.BaseStream);
            lifetime.CancelAfter(OfficeTokenSession.MaximumLifetime);
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct, lifetime.Token);
            deadline.CancelAfter(TimeSpan.FromSeconds(20));
            await SigningFrames.Write(process.StandardInput.BaseStream, setup, deadline.Token);
            await PinTransfer.SendAsync(process.StandardInput.BaseStream, pin, deadline.Token);
            var result = await SigningFrames.Read<SigningWorkResult>(process.StandardOutput.BaseStream, deadline.Token);
            Validate(result, 0); ready = true;
        }
        internal async Task<SigningWorkResult> Command(RemoteSessionCommand command, CancellationToken ct)
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct, lifetime.Token);
            deadline.CancelAfter(command.Action == "check" ? TimeSpan.FromSeconds(5) : BatchSigningSession.MaximumLifetime);
            await SigningFrames.Write(process.StandardInput.BaseStream, command, deadline.Token);
            var result = await SigningFrames.Read<SigningWorkResult>(process.StandardOutput.BaseStream, deadline.Token);
            Validate(result, command.Action == "sign" ? 1 : 0);
            if (command.Batch is { } batch && (result.Documents[0].DocumentId != batch.Documents[0].Id || result.Documents[0].Profile != batch.Profile || !SigningBatch.IsSha256(result.Documents[0].Sha256)))
                throw new SigningFailure(SigningError.ValidationFailed);
            return result;
        }
        private void Validate(SigningWorkResult value, int expected)
        {
            if (!value.Ok) throw new SigningFailure(Enum.TryParse<SigningError>(value.Error, out var code) && Enum.IsDefined(code) ? code : SigningError.EngineFailure);
            if (value.TokenLoginAttempts != 1 || value.Documents.Count != expected || value.TokenSignatureOperations != signatures + expected)
                throw new SigningFailure(SigningError.ValidationFailed);
            signatures += expected;
        }
        private async Task Drain(Stream stream) {
            try { byte[] bytes = new byte[4096]; while (await stream.ReadAsync(bytes, lifetime.Token) != 0) { } }
            catch (Exception) { /* Fixed diagnostics only; never retain worker stderr. */ }
        }
        public void Dispose()
        {
            if (Interlocked.Exchange(ref closed, 1) != 0) return;
            lifetime.Cancel();
            // Closing the job terminates this session and any owned Java child.
            job.Dispose();
            if (started) { try { if (!process.HasExited) process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { } }
            process.Dispose();
        }
    }
    internal static async Task<int> RunWorker()
    {
        Pkcs11SigningToken? token = null;
        using var lifetime = new CancellationTokenSource(OfficeTokenSession.MaximumLifetime);
        try {
            var input = Console.OpenStandardInput(); var output = Console.OpenStandardOutput();
            var setup = await SigningFrames.Read<RemoteSessionSetup>(input, lifetime.Token);
            setup.Engine.Validate(); LocalSigningFiles.RequireLocalPath(setup.Library);
            using var pin = await PinTransfer.ReceiveAsync(input, lifetime.Token);
            using var session = new OfficeTokenSession(setup.OfficeId, setup.Fingerprint, pin,
                () => token = new Pkcs11SigningToken(setup.Library, setup.Fingerprint));
            await SigningFrames.Write(output, new SigningWorkResult(true, null, [], token!.LoginAttempts, token.SignatureOperations), lifetime.Token);
            while (!lifetime.IsCancellationRequested) {
                var command = await SigningFrames.Read<RemoteSessionCommand>(input, lifetime.Token);
                session.Check();
                IReadOnlyList<SignedPdf> results;
                if (command.Action == "check" && command.Batch is null) results = [];
                else if (command.Action == "sign" && command.Batch is not null)
                    results = await session.Sign(command.Batch, new DssSignerAdapter(setup.Engine), lifetime.Token);
                else throw new SigningFailure(SigningError.InvalidBatch);
                await SigningFrames.Write(output, new SigningWorkResult(true, null, results, token.LoginAttempts, token.SignatureOperations), lifetime.Token);
            }
            return 0;
        } catch (Exception failure) {
            string code = failure is SigningFailure known ? known.Code.ToString()
                : failure is OperationCanceledException ? SigningError.SessionExpired.ToString() : SigningError.EngineFailure.ToString();
            try { await SigningFrames.Write(Console.OpenStandardOutput(), new SigningWorkResult(false, code, [], token?.LoginAttempts ?? 0, token?.SignatureOperations ?? 0), CancellationToken.None); } catch { }
            return 1;
        } finally { token?.Dispose(); }
    }
}
