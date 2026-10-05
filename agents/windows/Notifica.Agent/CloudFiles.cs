using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Notifica.Agent;

// x64 ABI from Microsoft's cfapi.h. No shell extensions, network drives or
// storage credentials: Explorer opens ordinary NTFS Cloud Files placeholders.
internal sealed class CloudFiles : IDisposable
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Registration {
        internal uint Size;
        [MarshalAs(UnmanagedType.LPWStr)] internal string Name;
        [MarshalAs(UnmanagedType.LPWStr)] internal string Version;
        internal IntPtr Identity; internal uint IdentityLength;
        internal IntPtr FileIdentity; internal uint FileIdentityLength;
        internal Guid Provider;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Policies {
        internal uint Size; internal ushort Hydration, HydrationModifier, Population, PopulationModifier;
        internal uint InSync, HardLink, Management;
    }
    [StructLayout(LayoutKind.Sequential)]
    internal struct CallbackInfo {
        internal uint Size; internal long Connection;
        internal IntPtr Context, VolumeGuid, VolumeDos; internal uint Serial;
        internal long RootId; internal IntPtr RootIdentity; internal uint RootIdentityLength;
        internal long FileId, FileSize; internal IntPtr Identity; internal uint IdentityLength;
        internal IntPtr Path; internal long Transfer; internal byte Priority;
        internal IntPtr Correlation, Process; internal long Request;
    }
    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate void Callback(in CallbackInfo info, IntPtr parameters);
    [StructLayout(LayoutKind.Sequential)]
    private struct CallbackRegistration { internal uint Type; internal IntPtr Function; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Metadata { internal long Created, Accessed, Written, Changed; internal uint Attributes; internal long Size; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Placeholder {
        [MarshalAs(UnmanagedType.LPWStr)] internal string Name;
        internal Metadata Metadata; internal IntPtr Identity; internal uint IdentityLength, Flags;
        internal int Result; internal long Usn;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Operation {
        internal uint Size, Type; internal long Connection, Transfer;
        internal IntPtr Correlation, Status; internal long Request;
    }
    [StructLayout(LayoutKind.Explicit, Size = 40)]
    private struct Transfer {
        [FieldOffset(0)] internal uint Size;
        [FieldOffset(8)] internal uint Flags;
        [FieldOffset(12)] internal int Status;
        [FieldOffset(16)] internal IntPtr Buffer;
        [FieldOffset(24)] internal long Offset;
        [FieldOffset(32)] internal long Length;
    }
    [DllImport("cldapi.dll", CharSet = CharSet.Unicode)] private static extern int CfRegisterSyncRoot(string path, in Registration registration, in Policies policies, uint flags);
    [DllImport("cldapi.dll", CharSet = CharSet.Unicode)] private static extern int CfConnectSyncRoot(string path, [In] CallbackRegistration[] callbacks, IntPtr context, uint flags, out long connection);
    [DllImport("cldapi.dll")] private static extern int CfDisconnectSyncRoot(long connection);
    [DllImport("cldapi.dll", CharSet = CharSet.Unicode)] internal static extern int CfUnregisterSyncRoot(string path);
    [DllImport("cldapi.dll", CharSet = CharSet.Unicode)] private static extern int CfCreatePlaceholders(string path, [In, Out] Placeholder[] files, uint count, uint flags, out uint processed);
    [DllImport("cldapi.dll")] private static extern int CfExecute(in Operation operation, ref Transfer parameters);
    [DllImport("cldapi.dll")] private static extern int CfGetPlaceholderInfo(SafeFileHandle file, uint infoClass, IntPtr info, uint size, out uint returned);
    [DllImport("cldapi.dll")] private static extern uint CfGetPlaceholderStateFromAttributeTag(uint attributes, uint tag);
    [StructLayout(LayoutKind.Sequential)] private struct AttributeTag { internal uint Attributes, Tag; }
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle file, int infoClass, out AttributeTag info, uint size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);

    private readonly Callback fetch, delete, rename;
    private readonly Func<string, CancellationToken, Task<byte[]>> download;
    private readonly CancellationTokenSource lifetime = new();
    private long connection;
    internal CloudFiles(string folder, string rootIdentity, Func<string, CancellationToken, Task<byte[]>> download)
    {
        this.download = download;
        AssertAbi();
        fetch = Fetch; delete = DenyDelete; rename = DenyRename;
        IntPtr identity = Marshal.StringToCoTaskMemUTF8(rootIdentity);
        try {
            var registration = new Registration { Size = (uint)Marshal.SizeOf<Registration>(), Name = "NOTIFICA · Firmados de la oficina",
                Version = typeof(CloudFiles).Assembly.GetName().Version!.ToString(3), Identity = identity,
                IdentityLength = (uint)Encoding.UTF8.GetByteCount(rootIdentity), Provider = new Guid("e49e87ae-848d-4613-802f-4dc383f36fa9") };
            var policies = new Policies { Size = (uint)Marshal.SizeOf<Policies>(), Hydration = 2, HydrationModifier = 4, Population = 3 };
            Marshal.ThrowExceptionForHR(CfRegisterSyncRoot(folder, registration, policies, 1 | 2 | 4));
            CallbackRegistration[] callbacks = [new() { Type = 0, Function = Marshal.GetFunctionPointerForDelegate(fetch) },
                new() { Type = 9, Function = Marshal.GetFunctionPointerForDelegate(delete) },
                new() { Type = 11, Function = Marshal.GetFunctionPointerForDelegate(rename) }, new() { Type = uint.MaxValue }];
            Marshal.ThrowExceptionForHR(CfConnectSyncRoot(folder, callbacks, IntPtr.Zero, 8, out connection));
        } finally { Marshal.FreeCoTaskMem(identity); }
    }
    internal static void AssertAbi()
    {
        if (IntPtr.Size != 8 || Marshal.SizeOf<Registration>() != 72 || Marshal.SizeOf<Policies>() != 24 ||
            Marshal.SizeOf<CallbackInfo>() != 152 || Marshal.SizeOf<Metadata>() != 48 || Marshal.SizeOf<Placeholder>() != 88 ||
            Marshal.SizeOf<Operation>() != 48 || Marshal.SizeOf<Transfer>() != 40) throw new InvalidOperationException("CLOUD_FILES_ABI");
    }
    internal static void RequireRoot(string path)
    {
        Signing.LocalSigningFiles.RequireLocalPath(Path.GetDirectoryName(path)!);
        if (!Directory.Exists(path) || !File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint)) return;
        using var handle = CreateFile(path, 0, 7, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
        if (handle.IsInvalid || !GetFileInformationByHandleEx(handle, 9, out var tag, 8) ||
            (CfGetPlaceholderStateFromAttributeTag(tag.Attributes, tag.Tag) & 2) == 0) throw new IOException("UNSAFE_FOLDER_ROOT");
    }
    internal void Create(string folder, OfficeFile file)
    {
        IntPtr identity = Marshal.StringToCoTaskMemUTF8(file.SignatureId);
        try {
            long time = file.SignedAt.UtcDateTime.ToFileTimeUtc();
            Placeholder[] rows = [new() { Name = file.FileName, Identity = identity, IdentityLength = (uint)Encoding.UTF8.GetByteCount(file.SignatureId), Flags = 2,
                Metadata = new() { Created = time, Accessed = time, Written = time, Changed = time, Attributes = 1, Size = file.SizeBytes } }];
            Marshal.ThrowExceptionForHR(CfCreatePlaceholders(folder, rows, 1, 1, out uint processed));
            Marshal.ThrowExceptionForHR(rows[0].Result);
            if (processed != 1) throw new IOException("PLACEHOLDER_NOT_CREATED");
        } finally { Marshal.FreeCoTaskMem(identity); }
    }
    // Read identity without opening file data or hydrating. Never remove a user
    // file merely because it has the same name as a catalog entry.
    internal static bool Owns(string path, string signatureId)
    {
        using var handle = CreateFile(path, 0, 7, IntPtr.Zero, 3, 0x00200000, IntPtr.Zero); // OPEN_REPARSE_POINT
        if (handle.IsInvalid) return false;
        IntPtr buffer = Marshal.AllocHGlobal(8192);
        try {
            if (CfGetPlaceholderInfo(handle, 0, buffer, 8192, out uint returned) < 0 || returned < 28) return false;
            // pin(4), inSync(4), fileId(8), rootFileId(8), identityLength(4), identity[]
            int length = Marshal.ReadInt32(buffer, 24);
            return length > 0 && length <= 80 && returned >= 28 + length && Marshal.PtrToStringUTF8(buffer + 28, length) == signatureId;
        } finally { Marshal.FreeHGlobal(buffer); }
    }
    private static Operation Op(in CallbackInfo info, uint type) => new() { Size = (uint)Marshal.SizeOf<Operation>(), Type = type,
        Connection = info.Connection, Transfer = info.Transfer, Request = info.Request };
    private void Fetch(in CallbackInfo info, IntPtr parameters)
    {
        var operation = Op(info, 0);
        var transfer = new Transfer { Size = 40, Offset = Marshal.ReadInt64(parameters, 16), Length = Marshal.ReadInt64(parameters, 24) };
        try {
            if (info.IdentityLength is 0 or > 80) throw new IOException("INVALID_PLACEHOLDER");
            string id = Marshal.PtrToStringUTF8(info.Identity, (int)info.IdentityLength)!;
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            deadline.CancelAfter(TimeSpan.FromSeconds(50));
            byte[] bytes = download(id, deadline.Token).GetAwaiter().GetResult();
            if (bytes.LongLength != info.FileSize) throw new IOException("CHECKSUM_MISMATCH");
            var pinned = GCHandle.Alloc(bytes, GCHandleType.Pinned);
            try {
                // FULL hydration supplies the complete, hash-verified object. EOF is
                // the only allowed non-4KiB-aligned end of a transfer.
                transfer.Buffer = pinned.AddrOfPinnedObject(); transfer.Offset = 0; transfer.Length = bytes.LongLength;
                Marshal.ThrowExceptionForHR(CfExecute(operation, ref transfer));
            } finally { pinned.Free(); }
        } catch {
            transfer.Status = unchecked((int)0xC0000001); transfer.Buffer = IntPtr.Zero;
            _ = CfExecute(operation, ref transfer);
        }
    }
    private static void Deny(in CallbackInfo info, uint type)
    {
        var operation = Op(info, type);
        var parameters = new Transfer { Size = 16, Status = unchecked((int)0xC0000022) };
        _ = CfExecute(operation, ref parameters);
    }
    private void DenyDelete(in CallbackInfo info, IntPtr _) => Deny(info, 6);
    private void DenyRename(in CallbackInfo info, IntPtr _) => Deny(info, 7);
    public void Dispose()
    {
        lifetime.Cancel();
        if (connection != 0) { _ = CfDisconnectSyncRoot(connection); connection = 0; }
        GC.KeepAlive(fetch); GC.KeepAlive(delete); GC.KeepAlive(rename);
        lifetime.Dispose();
    }
}
