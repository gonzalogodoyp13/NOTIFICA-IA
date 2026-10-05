using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace Notifica.Agent.Signing;

// Runs only in the bounded signing child, never in the heartbeat probe. Windows
// PKCS#11 CK_ULONG is 32 bits, including the x64 SafeNet implementation.
internal sealed class Pkcs11SigningToken : ISigningToken
{
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct Attribute { internal uint Type; internal IntPtr Value; internal uint Length; }
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct Mechanism { internal uint Type; internal IntPtr Parameter; internal uint Length; }
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct SessionInfo { internal uint Slot; internal uint State; internal uint Flags; internal uint Error; }
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint Initialize(IntPtr args);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint GetSlots(byte present, [Out] uint[]? slots, ref uint count);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint OpenSession(uint slot, uint flags, IntPtr application, IntPtr notify, out uint session);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint SessionCall(uint session);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint GetSessionInfo(uint session, out SessionInfo info);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint Login(uint session, uint userType, IntPtr pin, uint length);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint FindInit(uint session, [In] Attribute[] attributes, uint count);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint FindObjects(uint session, [Out] uint[] handles, uint maximum, out uint count);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint GetAttribute(uint session, uint handle, ref Attribute attribute, uint count);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint SignInit(uint session, ref Mechanism mechanism, uint key);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint Sign(uint session, [In] byte[] data, uint dataLength, [Out] byte[] signature, ref uint signatureLength);
    private IntPtr library;
    private uint session;
    private uint key;
    private bool initialized, opened, authenticated, loginAttempted, disposed;
    internal int LoginAttempts { get; private set; }
    internal int SignatureOperations { get; private set; }
    private byte[] certificate = [];
    private byte[] keyId = [];
    private readonly List<byte[]> chain = [];
    public byte[] Certificate => certificate.ToArray();
    public IReadOnlyList<byte[]> CertificateChain => chain.Select(c => c.ToArray()).ToArray();
    private T Function<T>(string name) where T : Delegate => Marshal.GetDelegateForFunctionPointer<T>(NativeLibrary.GetExport(library, name));

    internal Pkcs11SigningToken(string libraryPath, string fingerprint)
    {
        if (!Path.IsPathFullyQualified(libraryPath) || !SigningBatch.IsSha256(fingerprint))
            throw new SigningFailure(SigningError.InvalidBatch);
        try
        {
            library = NativeLibrary.Load(libraryPath, typeof(Pkcs11SigningToken).Assembly,
                DllImportSearchPath.UseDllDirectoryForDependencies | DllImportSearchPath.System32);
            // Never share an already-initialized in-process provider/login.
            Check(Function<Initialize>("C_Initialize")(IntPtr.Zero));
            initialized = true;
            uint count = 0;
            var getSlots = Function<GetSlots>("C_GetSlotList");
            Check(getSlots(1, null, ref count));
            if (count == 0) throw new SigningFailure(SigningError.TokenMissing);
            if (count > 64) throw new SigningFailure(SigningError.DriverFailure);
            uint[] slots = new uint[count];
            Check(getSlots(1, slots, ref count));
            var candidates = new List<(uint Slot, byte[] Id, byte[] Certificate)>();
            foreach (uint slot in slots.Take(checked((int)count)))
            {
                Check(Function<OpenSession>("C_OpenSession")(slot, 4, IntPtr.Zero, IntPtr.Zero, out uint candidateSession));
                try
                {
                    foreach (uint handle in Find(candidateSession, 1, null)) // CKO_CERTIFICATE only
                    {
                        byte[] der = Read(candidateSession, handle, 0x11); // Public certificate CKA_VALUE
                        if (Convert.ToHexStringLower(SHA256.HashData(der)) != fingerprint) continue;
                        using var cert = X509CertificateLoader.LoadCertificate(der);
                        var description = TokenProbe.Describe(cert);
                        if (description is null || description.NotBefore > DateTimeOffset.UtcNow || description.ExpiresAt <= DateTimeOffset.UtcNow)
                            throw new SigningFailure(SigningError.CertificateInvalid);
                        using var rsa = cert.GetRSAPublicKey();
                        if (rsa is null || rsa.KeySize < 2048) throw new SigningFailure(SigningError.UnsupportedKey);
                        candidates.Add((slot, Read(candidateSession, handle, 0x102), der)); // CKA_ID, not the key
                    }
                }
                finally { _ = Function<SessionCall>("C_CloseSession")(candidateSession); }
            }
            if (candidates.Count == 0) throw new SigningFailure(SigningError.CertificateMissing);
            if (candidates.Count != 1) throw new SigningFailure(SigningError.CertificateAmbiguous);
            var selected = candidates[0];
            certificate = selected.Certificate;
            keyId = selected.Id;
            if (keyId.Length == 0) throw new SigningFailure(SigningError.CertificateInvalid);
            Check(Function<OpenSession>("C_OpenSession")(selected.Slot, 4, IntPtr.Zero, IntPtr.Zero, out session));
            opened = true;
            foreach (uint handle in Find(session, 1, null)) chain.Add(Read(session, handle, 0x11));
            Check(Function<GetSessionInfo>("C_GetSessionInfo")(session, out var initial));
            if (initial.State != 0) throw new SigningFailure(SigningError.ExistingTokenSession);
        }
        catch (SigningFailure) { Dispose(); throw; }
        catch { Dispose(); throw new SigningFailure(SigningError.DriverFailure); }
    }

    internal void CheckAuthenticated()
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (!authenticated) throw new SigningFailure(SigningError.SessionExpired);
        Check(Function<GetSessionInfo>("C_GetSessionInfo")(session, out var info));
        if (info.State != 1) throw new SigningFailure(SigningError.SessionExpired);
        using var cert = X509CertificateLoader.LoadCertificate(certificate);
        if (cert.NotBefore.ToUniversalTime() > DateTime.UtcNow || cert.NotAfter.ToUniversalTime() <= DateTime.UtcNow)
            throw new SigningFailure(SigningError.CertificateInvalid);
    }
    public void Authenticate(PinBuffer pin)
    {
        try
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            if (loginAttempted) throw new SigningFailure(SigningError.LoginAlreadyAttempted);
            loginAttempted = true;
            Check(Function<GetSessionInfo>("C_GetSessionInfo")(session, out var initial));
            if (initial.State != 0) throw new SigningFailure(SigningError.ExistingTokenSession);
            // Exactly one C_Login. In particular, CKR_PIN_INCORRECT never retries.
            try
            {
                Check(pin.UseNative((pointer, length) => { LoginAttempts++; return Function<Login>("C_Login")(session, 1, pointer, length); }));
            }
            finally { pin.Dispose(); }
            authenticated = true;
            uint[] keys = Find(session, 3, keyId); // CKO_PRIVATE_KEY matched by public certificate ID
            if (keys.Length != 1) throw new SigningFailure(SigningError.PrivateKeyPolicy);
            key = keys[0];
            if (!Flag(0x108) || !Flag(0x103) || Flag(0x162) || !Flag(0x164) || Flag(0x202))
                throw new SigningFailure(SigningError.PrivateKeyPolicy);
        }
        catch { Dispose(); throw; }
        finally { pin.Dispose(); }
    }

    public byte[] SignSha256(ReadOnlySpan<byte> data)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (!authenticated || data.Length is < 1 or > 1024 * 1024) throw new SigningFailure(SigningError.InvalidBatch);
        Check(Function<GetSessionInfo>("C_GetSessionInfo")(session, out var state));
        if (state.State != 1) throw new SigningFailure(SigningError.TokenRemoved);
        using var cert = X509CertificateLoader.LoadCertificate(certificate);
        if (cert.NotAfter.ToUniversalTime() <= DateTime.UtcNow) throw new SigningFailure(SigningError.CertificateInvalid);
        using var rsa = cert.GetRSAPublicKey()!;
        byte[] signature = new byte[rsa.KeySize / 8];
        uint length = checked((uint)signature.Length);
        var mechanism = new Mechanism { Type = 0x40 }; // CKM_SHA256_RSA_PKCS
        Check(Function<SignInit>("C_SignInit")(session, ref mechanism, key));
        // A fixed modulus-sized buffer avoids a second C_Sign call or retry.
        byte[] message = data.ToArray();
        SignatureOperations++;
        Check(Function<Sign>("C_Sign")(session, message, checked((uint)message.Length), signature, ref length));
        if (length != signature.Length || !rsa.VerifyData(message, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1))
            throw new SigningFailure(SigningError.SignatureInvalid);
        return signature;
    }

    private bool Flag(uint type)
    {
        byte[] value = Read(session, key, type);
        if (value.Length != 1 || value[0] > 1) throw new SigningFailure(SigningError.PrivateKeyPolicy);
        return value[0] == 1;
    }
    private uint[] Find(uint currentSession, uint objectClass, byte[]? id)
    {
        IntPtr classBuffer = Marshal.AllocHGlobal(4);
        IntPtr idBuffer = IntPtr.Zero;
        try
        {
            Marshal.WriteInt32(classBuffer, checked((int)objectClass));
            var template = new List<Attribute> { new() { Type = 0, Value = classBuffer, Length = 4 } };
            if (id is not null)
            {
                idBuffer = Marshal.AllocHGlobal(id.Length);
                Marshal.Copy(id, 0, idBuffer, id.Length);
                template.Add(new() { Type = 0x102, Value = idBuffer, Length = checked((uint)id.Length) });
            }
            Check(Function<FindInit>("C_FindObjectsInit")(currentSession, template.ToArray(), checked((uint)template.Count)));
            try
            {
                var found = new List<uint>();
                for (int page = 0; page < 32; page++)
                {
                    uint[] objects = new uint[16];
                    Check(Function<FindObjects>("C_FindObjects")(currentSession, objects, 16, out uint count));
                    if (count > 16) throw new SigningFailure(SigningError.DriverFailure);
                    if (count == 0) return found.ToArray();
                    found.AddRange(objects.Take(checked((int)count)));
                }
                throw new SigningFailure(SigningError.DriverFailure);
            }
            finally { _ = Function<SessionCall>("C_FindObjectsFinal")(currentSession); }
        }
        finally { Marshal.FreeHGlobal(classBuffer); if (idBuffer != IntPtr.Zero) Marshal.FreeHGlobal(idBuffer); }
    }
    private byte[] Read(uint currentSession, uint handle, uint type)
    {
        var attribute = new Attribute { Type = type };
        var get = Function<GetAttribute>("C_GetAttributeValue");
        Check(get(currentSession, handle, ref attribute, 1));
        if (attribute.Length is 0 or > 65536) throw new SigningFailure(SigningError.DriverFailure);
        int maximum = checked((int)attribute.Length);
        attribute.Value = Marshal.AllocHGlobal(maximum);
        try
        {
            Check(get(currentSession, handle, ref attribute, 1));
            if (attribute.Length > maximum) throw new SigningFailure(SigningError.DriverFailure);
            byte[] bytes = new byte[attribute.Length];
            Marshal.Copy(attribute.Value, bytes, 0, bytes.Length);
            return bytes;
        }
        finally { Marshal.FreeHGlobal(attribute.Value); }
    }
    internal static void Check(uint result)
    {
        if (result == 0) return;
        throw new SigningFailure(result switch {
            0xa0 => SigningError.PinIncorrect, 0xa4 => SigningError.PinLocked, 0xa3 => SigningError.PinExpired,
            0xa1 or 0xa2 => SigningError.PinFormat, 0x30 or 0x32 or 0xb0 or 0xb3 => SigningError.TokenRemoved,
            0xe0 => SigningError.TokenMissing, 0x100 => SigningError.ExistingTokenSession,
            _ => SigningError.DriverFailure
        });
    }
    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        if (library == IntPtr.Zero) return;
        try { if (authenticated) _ = Function<SessionCall>("C_Logout")(session); }
        finally
        {
            try { if (opened) _ = Function<SessionCall>("C_CloseSession")(session); }
            finally
            {
                try { if (initialized) _ = Function<Initialize>("C_Finalize")(IntPtr.Zero); }
                finally { NativeLibrary.Free(library); library = IntPtr.Zero; }
            }
        }
    }
}
