using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace Notifica.Agent;

// Windows PKCS#11 uses 32-bit CK_ULONG even in x64; SafeNet structs are packed.
// No C_Login, private-key attribute read, C_Sign, PIN or token reset API exists here.
internal sealed class TokenProbe
{
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct Attribute { public uint Type; public IntPtr Value; public uint Length; }
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint Init(IntPtr reserved);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint Slots(byte present, [Out] uint[]? slots, ref uint count);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint Open(uint slot, uint flags, IntPtr app, IntPtr notify, out uint session);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint Close(uint session);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint FindInit(uint session, ref Attribute attribute, uint count);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint Find(uint session, [Out] uint[] objects, uint maximum, out uint count);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate uint Get(uint session, uint handle, ref Attribute attribute, uint count);
    private static T Export<T>(IntPtr library, string name) where T : Delegate => Marshal.GetDelegateForFunctionPointer<T>(NativeLibrary.GetExport(library, name));
    private static void Check(uint result) { if (result != 0) throw new InvalidOperationException("DRIVER_ERROR"); }

    internal TokenHealth Read(Configuration config)
    {
        if (!File.Exists(config.Pkcs11Library)) return new("DRIVER_MISSING", null);
        IntPtr library = IntPtr.Zero;
        bool initialized = false;
        try
        {
            // Absolute path only, with restricted DLL search. Installer grants
            // ordinary users no write access to this configuration/library path.
            library = NativeLibrary.Load(config.Pkcs11Library, typeof(TokenProbe).Assembly,
                DllImportSearchPath.UseDllDirectoryForDependencies | DllImportSearchPath.System32);
            var initialize = Export<Init>(library, "C_Initialize");
            var result = initialize(IntPtr.Zero);
            if (result != 0 && result != 0x191) Check(result);
            initialized = result == 0;
            var slotsFn = Export<Slots>(library, "C_GetSlotList");
            uint count = 0;
            Check(slotsFn(1, null, ref count));
            if (count == 0) return new("MISSING", null);
            if (count > 64) return new("DRIVER_ERROR", null);
            var slots = new uint[count];
            Check(slotsFn(1, slots, ref count));
            var certificates = new List<PublicCertificate>();
            foreach (uint slot in slots.Take((int)count))
            {
                Check(Export<Open>(library, "C_OpenSession")(slot, 4, IntPtr.Zero, IntPtr.Zero, out uint session));
                try
                {
                    IntPtr certClass = Marshal.AllocHGlobal(4);
                    try
                    {
                        Marshal.WriteInt32(certClass, 1); // CKO_CERTIFICATE
                        var attribute = new Attribute { Type = 0, Value = certClass, Length = 4 };
                        Check(Export<FindInit>(library, "C_FindObjectsInit")(session, ref attribute, 1));
                    }
                    finally { Marshal.FreeHGlobal(certClass); }
                    try
                    {
                        for (int batch = 0; batch < 32; batch++)
                        {
                            var objects = new uint[16];
                            Check(Export<Find>(library, "C_FindObjects")(session, objects, 16, out uint found));
                            if (found == 0) break;
                            foreach (uint obj in objects.Take((int)found))
                            {
                                byte[]? der = ReadAttribute(library, session, obj, 0x11); // CKA_VALUE, public certificate
                                if (der is null) continue;
                                using var cert = X509CertificateLoader.LoadCertificate(der);
                                var description = Describe(cert);
                                if (description is not null) certificates.Add(description);
                            }
                        }
                    }
                    finally { Check(Export<Close>(library, "C_FindObjectsFinal")(session)); }
                }
                finally { Check(Export<Close>(library, "C_CloseSession")(session)); }
            }
            return Select(certificates, config.CertificateFingerprint);
        }
        catch { return new("DRIVER_ERROR", null); }
        finally
        {
            if (library != IntPtr.Zero)
            {
                if (initialized) _ = Export<Init>(library, "C_Finalize")(IntPtr.Zero);
                NativeLibrary.Free(library);
            }
        }
    }
    private static byte[]? ReadAttribute(IntPtr library, uint session, uint obj, uint type)
    {
        var get = Export<Get>(library, "C_GetAttributeValue");
        var attribute = new Attribute { Type = type };
        if (get(session, obj, ref attribute, 1) != 0 || attribute.Length == 0 || attribute.Length > 64 * 1024) return null;
        int length = checked((int)attribute.Length);
        attribute.Value = Marshal.AllocHGlobal(length);
        try
        {
            Check(get(session, obj, ref attribute, 1));
            if (attribute.Length > length) return null;
            byte[] bytes = new byte[attribute.Length];
            Marshal.Copy(attribute.Value, bytes, 0, bytes.Length);
            return bytes;
        }
        finally { Marshal.FreeHGlobal(attribute.Value); }
    }
    internal static PublicCertificate? Describe(X509Certificate2 cert)
    {
        if (cert.Extensions.OfType<X509BasicConstraintsExtension>().Any(e => e.CertificateAuthority)) return null;
        var usage = cert.Extensions.OfType<X509KeyUsageExtension>().FirstOrDefault();
        if (usage is null || !usage.KeyUsages.HasFlag(X509KeyUsageFlags.DigitalSignature)) return null;
        using var rsa = cert.GetRSAPublicKey();
        using var ec = cert.GetECDsaPublicKey();
        if (rsa is null && ec is null) return null;
        return new(cert.GetCertHashString(HashAlgorithmName.SHA256).ToLowerInvariant(), cert.Subject, cert.Issuer,
            new DateTimeOffset(cert.NotBefore.ToUniversalTime()), new DateTimeOffset(cert.NotAfter.ToUniversalTime()), true);
    }
    internal static TokenHealth Select(IEnumerable<PublicCertificate> certificates, string? fingerprint)
    {
        var candidates = certificates.Where(c => fingerprint is null || c.Fingerprint == fingerprint).DistinctBy(c => c.Fingerprint).ToArray();
        return candidates.Length == 0 ? new("CERT_MISSING", null) : candidates.Length > 1 ? new("CERT_AMBIGUOUS", null) : new("READY", candidates[0]);
    }
    internal static string Health(TokenHealth report, DateTimeOffset now)
    {
        if (report.Token == "MISSING" || report.Token == "NOT_APPLICABLE") return "AGENT_ONLINE_TOKEN_MISSING";
        if (report.Token != "READY" || report.Certificate is null || report.Certificate.NotBefore > now) return "DRIVER_ERROR";
        return report.Certificate.ExpiresAt <= now ? "CERT_EXPIRED" : report.Certificate.ExpiresAt - now < TimeSpan.FromDays(30) ? "CERT_EXPIRING" : "TOKEN_READY";
    }
}
