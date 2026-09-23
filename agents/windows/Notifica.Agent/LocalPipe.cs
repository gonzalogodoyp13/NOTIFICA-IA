using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;

namespace Notifica.Agent;

internal static class LocalPipe
{
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe, out uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder path, ref uint size);
    [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] private static extern IntPtr GetCurrentProcess();
    [DllImport("advapi32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetKernelObjectSecurity(IntPtr handle, uint information, byte[]? descriptor, uint length, out uint needed);
    [DllImport("advapi32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetKernelObjectSecurity(IntPtr handle, uint information, byte[] descriptor);
    internal static void AllowServerInspection(Configuration config)
    {
        // The normal tray must verify this process image. Grant only
        // PROCESS_QUERY_LIMITED_INFORMATION on this service process, never
        // memory access, handle duplication, termination or credential access.
        IntPtr process = GetCurrentProcess();
        _ = GetKernelObjectSecurity(process, 4, null, 0, out uint size);
        if (size is 0 or > 65536) throw new IOException("PROCESS_INSPECTION_POLICY_FAILED");
        byte[] binary = new byte[size];
        if (!GetKernelObjectSecurity(process, 4, binary, size, out _)) throw new IOException("PROCESS_INSPECTION_POLICY_FAILED");
        var descriptor = new RawSecurityDescriptor(binary, 0);
        var acl = descriptor.DiscretionaryAcl ?? throw new IOException("PROCESS_INSPECTION_POLICY_FAILED");
        acl.InsertAce(acl.Count, new CommonAce(AceFlags.None, AceQualifier.AccessAllowed, 0x1000,
            new SecurityIdentifier(config.AllowedUserSid), false, null));
        binary = new byte[descriptor.BinaryLength];
        descriptor.GetBinaryForm(binary, 0);
        if (!SetKernelObjectSecurity(process, 4, binary)) throw new IOException("PROCESS_INSPECTION_POLICY_FAILED");
    }
    internal static PipeSecurity Security(Configuration config)
    {
        var acl = new PipeSecurity();
        acl.SetAccessRuleProtection(true, false);
        acl.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User!, PipeAccessRights.FullControl, AccessControlType.Allow));
        acl.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), PipeAccessRights.FullControl, AccessControlType.Allow));
        acl.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(config.AllowedUserSid), PipeAccessRights.ReadWrite, AccessControlType.Allow));
        // Network logons cannot use this local IPC channel.
        acl.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid, null), PipeAccessRights.FullControl, AccessControlType.Deny));
        return acl;
    }
    internal static async Task Serve(Configuration config, AgentWorker worker, CancellationToken ct)
    {
        await using var controlled = config.ControlledSigning is null ? null : new Signing.ControlledSigning(config, active => worker.SigningActive = active, worker.WaitForProbeIdle);
        while (!ct.IsCancellationRequested)
        {
            await using var pipe = NamedPipeServerStreamAcl.Create(config.PipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous | PipeOptions.FirstPipeInstance, 8192, 8192, Security(config));
            await pipe.WaitForConnectionAsync(ct);
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
            deadline.CancelAfter(TimeSpan.FromSeconds(25));
            try
            {
                string input = await ReadLine(pipe, deadline.Token);
                // Windows impersonates the security context of the last message
                // read. Read the bounded frame before querying its client SID.
                bool authorized = false;
                pipe.RunAsClient(() => authorized = WindowsIdentity.GetCurrent().User?.Value == config.AllowedUserSid);
                if (!authorized) continue;
                using var document = JsonDocument.Parse(input);
                string action = document.RootElement.GetProperty("action").GetString() ?? "";
                var signing = controlled ?? worker.Remote?.Current;
                object result;
                if (action == "status" && document.RootElement.EnumerateObject().Count() == 1) result = new { ok = true, status = worker.Status };
                else if (action == "controlled-batch" && signing is not null && document.RootElement.EnumerateObject().Count() == 1)
                    result = new { ok = true, batch = signing.View() };
                else if (action == "approve-controlled-batch" && signing is not null && document.RootElement.EnumerateObject().Count() == 3)
                {
                    signing.Reserve(document.RootElement.GetProperty("approvalId").GetGuid(), document.RootElement.GetProperty("digest").GetString() ?? "");
                    try
                    {
                        await WriteLine(pipe, new { ok = true, readyForPin = true }, deadline.Token);
                        using var pinDeadline = CancellationTokenSource.CreateLinkedTokenSource(deadline.Token);
                        pinDeadline.CancelAfter(TimeSpan.FromSeconds(5));
                        var pin = await Signing.PinTransfer.ReceiveAsync(pipe, pinDeadline.Token);
                        signing.Start(pin);
                        result = new { ok = true };
                    }
                    catch { signing.Abandon(); throw; }
                }
                else if (action == "enroll" && document.RootElement.EnumerateObject().All(p => p.Name is "action" or "code" or "name" or "receiverDirectory"))
                {
                    await worker.Enroll(document.RootElement.GetProperty("code").GetString() ?? "", document.RootElement.GetProperty("name").GetString() ?? "", deadline.Token,
                        document.RootElement.TryGetProperty("receiverDirectory", out var folder) ? folder.GetString() : null);
                    result = new { ok = true };
                }
                else result = new { ok = false, error = "UNSUPPORTED_LOCAL_ACTION" };
                await WriteLine(pipe, result, deadline.Token);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch { try { await WriteLine(pipe, new { ok = false, error = "LOCAL_REQUEST_FAILED" }, deadline.Token); } catch { /* client disconnected */ } }
        }
    }
    internal static async Task<JsonElement> Request(Configuration config, object request, CancellationToken ct)
    {
        await using var pipe = new NamedPipeClientStream(".", config.PipeName, PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification);
        await pipe.ConnectAsync(2000, ct);
        VerifyServer(pipe, config);
        await WriteLine(pipe, request, ct);
        using var result = JsonDocument.Parse(await ReadLine(pipe, ct, 128 * 1024));
        return result.RootElement.Clone();
    }
    internal static async Task Approve(Configuration config, Signing.ControlledBatchView batch, Signing.PinBuffer pin, CancellationToken ct)
    {
        try
        {
            await using var pipe = new NamedPipeClientStream(".", config.PipeName, PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification);
            await pipe.ConnectAsync(2000, ct);
            VerifyServer(pipe, config);
            await WriteLine(pipe, new { action = "approve-controlled-batch", approvalId = batch.ApprovalId, digest = batch.Digest }, ct);
            using var ready = JsonDocument.Parse(await ReadLine(pipe, ct));
            if (!ready.RootElement.GetProperty("ok").GetBoolean() || !ready.RootElement.GetProperty("readyForPin").GetBoolean())
                throw new Signing.SigningFailure(Signing.SigningError.ApprovalMismatch);
            await Signing.PinTransfer.SendAsync(pipe, pin, ct);
            using var accepted = JsonDocument.Parse(await ReadLine(pipe, ct));
            if (!accepted.RootElement.GetProperty("ok").GetBoolean()) throw new Signing.SigningFailure(Signing.SigningError.EngineFailure);
        }
        finally { pin.Dispose(); }
    }
    private static void VerifyServer(NamedPipeClientStream pipe, Configuration config)
    {
        if (!GetNamedPipeServerProcessId(pipe.SafePipeHandle, out uint pid)) throw new IOException("PIPE_SERVER_ID_UNAVAILABLE");
        string expected = Path.GetFullPath(Environment.ProcessPath!);
        IntPtr process = OpenProcess(0x1000, false, pid); // query-only; no cross-account VM_READ
        if (process == IntPtr.Zero) throw new IOException("PIPE_SERVER_QUERY_DENIED");
        try
        {
            var path = new StringBuilder(32768); uint length = 32768;
            if (!QueryFullProcessImageName(process, 0, path, ref length) || !string.Equals(path.ToString(), expected, StringComparison.OrdinalIgnoreCase)) throw new IOException("UNTRUSTED_PIPE_SERVER");
            if (config.MachineKey && ServiceHost.ProcessId() != pid) throw new IOException("UNTRUSTED_PIPE_SERVER");
        }
        finally { _ = CloseHandle(process); }
    }
    private static async Task<string> ReadLine(Stream stream, CancellationToken ct, int maximum = 8192)
    {
        using var buffer = new MemoryStream();
        byte[] one = new byte[1];
        while (buffer.Length < maximum)
        {
            if (await stream.ReadAsync(one, ct) != 1) throw new IOException("PIPE_CLOSED");
            if (one[0] == 10) return Encoding.UTF8.GetString(buffer.ToArray());
            buffer.WriteByte(one[0]);
        }
        throw new IOException("PIPE_REQUEST_TOO_LARGE");
    }
    private static async Task WriteLine(Stream stream, object value, CancellationToken ct)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, Configuration.Json) + "\n");
        await stream.WriteAsync(bytes, ct);
        await stream.FlushAsync(ct);
    }
}
