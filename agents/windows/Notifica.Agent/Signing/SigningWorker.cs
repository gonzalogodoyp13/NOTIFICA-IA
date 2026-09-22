using System.Buffers.Binary;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;

namespace Notifica.Agent.Signing;

internal sealed record SigningWork(SigningBatch Batch, string Library, DssEngineOptions Engine);
internal sealed record SigningWorkResult(bool Ok, string? Error, IReadOnlyList<SignedPdf> Documents,
    int? TokenLoginAttempts = null, int? TokenSignatureOperations = null);

// This protocol contains public metadata only. The following PIN frame is
// binary, bounded and explicitly cleared by PinTransfer.
internal static class SigningFrames
{
    internal static async Task Write<T>(Stream stream, T value, CancellationToken ct)
    {
        byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(value, Configuration.Json);
        if (bytes.Length > 1024 * 1024) throw new SigningFailure(SigningError.InvalidBatch);
        byte[] prefix = new byte[4];
        BinaryPrimitives.WriteInt32BigEndian(prefix, bytes.Length);
        await stream.WriteAsync(prefix, ct);
        await stream.WriteAsync(bytes, ct);
        await stream.FlushAsync(ct);
    }
    internal static async Task<T> Read<T>(Stream stream, CancellationToken ct)
    {
        byte[] prefix = new byte[4];
        await stream.ReadExactlyAsync(prefix, ct);
        int count = BinaryPrimitives.ReadInt32BigEndian(prefix);
        if (count is < 1 or > 1024 * 1024) throw new SigningFailure(SigningError.InvalidBatch);
        byte[] bytes = new byte[count];
        await stream.ReadExactlyAsync(bytes, ct);
        return JsonSerializer.Deserialize<T>(bytes, Configuration.Json) ?? throw new SigningFailure(SigningError.InvalidBatch);
    }
}

internal static class SigningWorker
{
    internal static async Task<int> Run()
    {
        using var deadline = new CancellationTokenSource(BatchSigningSession.MaximumLifetime);
        Pkcs11SigningToken? openedToken = null;
        try
        {
            Stream input = Console.OpenStandardInput();
            var work = await SigningFrames.Read<SigningWork>(input, deadline.Token);
            work.Batch.Validate();
            work.Engine.Validate();
            LocalSigningFiles.RequireLocalPath(work.Library);
            // Reject a changed/missing input before reading the PIN or opening
            // the hardware. The adapter holds and hashes each file again at use.
            foreach (var document in work.Batch.Documents)
            {
                LocalSigningFiles.RequireLocalPath(document.SourcePath);
                await using var source = new FileStream(document.SourcePath, FileMode.Open, FileAccess.Read, FileShare.Read);
                if (source.Length is < 8 or > 32 * 1024 * 1024) throw new SigningFailure(SigningError.InvalidBatch);
                string digest = Convert.ToHexStringLower(await System.Security.Cryptography.SHA256.HashDataAsync(source, deadline.Token));
                if (digest != document.SourceSha256) throw new SigningFailure(SigningError.InputChanged);
            }
            using var pin = await PinTransfer.ReceiveAsync(input, deadline.Token);
            var documents = await new BatchSigningSession().RunAsync(work.Batch, pin,
                () => openedToken = new Pkcs11SigningToken(work.Library, work.Batch.SignerFingerprint),
                new DssSignerAdapter(work.Engine), deadline.Token);
            await SigningFrames.Write(Console.OpenStandardOutput(), new SigningWorkResult(true, null, documents,
                openedToken!.LoginAttempts, openedToken.SignatureOperations), deadline.Token);
            return 0;
        }
        catch (Exception error)
        {
            string code = error is SigningFailure failure ? failure.Code.ToString()
                : error is OperationCanceledException ? SigningError.SessionExpired.ToString() : SigningError.EngineFailure.ToString();
            try { await SigningFrames.Write(Console.OpenStandardOutput(), new SigningWorkResult(false, code, [],
                openedToken?.LoginAttempts ?? 0, openedToken?.SignatureOperations ?? 0), CancellationToken.None); }
            catch { /* The owning parent has disconnected. No raw diagnostics. */ }
            return 1;
        }
    }

    internal static async Task<SigningWorkResult> Execute(SigningWork work, PinBuffer pin, CancellationToken ct)
    {
        using var ownedPin = pin;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(BatchSigningSession.MaximumLifetime);
        using var process = new Process { StartInfo = new ProcessStartInfo(Environment.ProcessPath!) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
            RedirectStandardOutput = true, RedirectStandardError = true } };
        process.StartInfo.ArgumentList.Add("--signing-worker");
        // Do not permit runtime diagnostics to write a PIN-bearing process dump.
        foreach (string variable in new[] { "DOTNET_DbgEnableMiniDump", "COMPlus_DbgEnableMiniDump",
            "DOTNET_DiagnosticPorts", "DOTNET_StartupHook", "DOTNET_STARTUP_HOOKS" }) process.StartInfo.Environment.Remove(variable);
        process.StartInfo.Environment["DOTNET_EnableDiagnostics"] = "0";
        using var job = new SigningProcessJob();
        bool started = false;
        Task? stderr = null;
        try
        {
            started = process.Start();
            if (!started) throw new SigningFailure(SigningError.EngineFailure);
            // The worker cannot receive a PIN until it is inside the kill-on-close
            // job. A parent crash also terminates its native session and Java child.
            job.Assign(process);
            stderr = Drain(process.StandardError.BaseStream, deadline.Token);
            await SigningFrames.Write(process.StandardInput.BaseStream, work, deadline.Token);
            await PinTransfer.SendAsync(process.StandardInput.BaseStream, pin, deadline.Token);
            process.StandardInput.Close();
            var result = await SigningFrames.Read<SigningWorkResult>(process.StandardOutput.BaseStream, deadline.Token);
            await process.WaitForExitAsync(deadline.Token);
            await stderr;
            if (result.Ok && (process.ExitCode != 0 || result.TokenLoginAttempts != 1
                || result.TokenSignatureOperations != work.Batch.Documents.Length || result.Documents.Count != work.Batch.Documents.Length
                || result.Documents.Where((d, i) => d.DocumentId != work.Batch.Documents[i].Id
                    || d.Profile != work.Batch.Profile || !SigningBatch.IsSha256(d.Sha256)).Any()))
                throw new SigningFailure(SigningError.ValidationFailed);
            if (!result.Ok && (!Enum.TryParse<SigningError>(result.Error, out var error) || !Enum.IsDefined(error)))
                throw new SigningFailure(SigningError.EngineFailure);
            return result;
        }
        finally
        {
            pin.Dispose();
            if (started && !process.HasExited) { process.Kill(entireProcessTree: true); await process.WaitForExitAsync(CancellationToken.None); }
            if (stderr is not null) { try { await stderr; } catch (OperationCanceledException) { } }
        }
    }
    private static async Task Drain(Stream stream, CancellationToken ct)
    {
        byte[] bytes = new byte[4096];
        while (await stream.ReadAsync(bytes, ct) != 0) { }
    }
    // A deterministic, hardware-free target for the kill-on-close acceptance
    // test. It never reads stdin or opens a token and has its own fallback exit.
    internal static int WaitSelfTest()
    {
        Console.WriteLine("WAITING_FOR_JOB_CLOSE"); Console.Out.Flush();
        Thread.Sleep(TimeSpan.FromSeconds(30));
        return 0;
    }
}

internal sealed class SigningProcessJob : IDisposable
{
    [StructLayout(LayoutKind.Sequential)] private struct BasicLimits
    {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] private struct IoCounters
    { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
    [StructLayout(LayoutKind.Sequential)] private struct ExtendedLimits
    {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateJobObject(IntPtr attributes, string? name);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetInformationJobObject(SafeFileHandle job, int information, ref ExtendedLimits limits, uint length);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AssignProcessToJobObject(SafeFileHandle job, IntPtr process);
    private readonly SafeFileHandle handle;
    internal SigningProcessJob()
    {
        handle = CreateJobObject(IntPtr.Zero, null);
        var limits = new ExtendedLimits { Basic = new BasicLimits { LimitFlags = 0x2000 } }; // KILL_ON_JOB_CLOSE
        if (handle.IsInvalid || !SetInformationJobObject(handle, 9, ref limits, (uint)Marshal.SizeOf<ExtendedLimits>()))
        { handle.Dispose(); throw new SigningFailure(SigningError.EngineFailure); }
    }
    internal void Assign(Process process)
    {
        if (!AssignProcessToJobObject(handle, process.Handle)) throw new SigningFailure(SigningError.EngineFailure);
    }
    public void Dispose() => handle.Dispose();
}
