using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Notifica.Agent;

// This key is the device HTTPS identity, independent of the E-Cert USB key.
// Windows CNG protects its persistent private material; export is prohibited.
internal sealed class DeviceKey : IDisposable
{
    private readonly CngKey key;
    private readonly RSACng rsa;
    [DllImport("ncrypt.dll", CharSet = CharSet.Unicode)]
    private static extern int NCryptSetProperty(SafeNCryptKeyHandle key, string property, byte[] data, int size, int flags);
    internal DeviceKey(Configuration config) : this(config, false) { }
    private DeviceKey(Configuration config, bool provisioning)
    {
        var provider = CngProvider.MicrosoftSoftwareKeyStorageProvider;
        var options = config.MachineKey ? CngKeyOpenOptions.MachineKey : CngKeyOpenOptions.None;
        if (CngKey.Exists(config.KeyName, provider, options)) key = CngKey.Open(config.KeyName, provider, options);
        else
        {
            if (config.MachineKey && !provisioning) throw new CryptographicException("DEVICE_KEY_NOT_PROVISIONED");
            var parameters = new CngKeyCreationParameters
            {
                Provider = provider, ExportPolicy = CngExportPolicies.None, KeyUsage = CngKeyUsages.Signing,
                KeyCreationOptions = config.MachineKey ? CngKeyCreationOptions.MachineKey : CngKeyCreationOptions.None
            };
            parameters.Parameters.Add(new CngProperty("Length", BitConverter.GetBytes(3072), CngPropertyOptions.None));
            key = CngKey.Create(CngAlgorithm.Rsa, config.KeyName, parameters);
        }
        rsa = new RSACng(key);
        if (rsa.KeySize != 3072 || key.ExportPolicy != CngExportPolicies.None) throw new CryptographicException("INVALID_DEVICE_KEY_POLICY");
        // Prove private-key access before reporting a usable device identity.
        // This is the software HTTPS key, never the USB signing key.
        byte[] challenge = RandomNumberGenerator.GetBytes(32);
        byte[] proof = rsa.SignData(challenge, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        if (!rsa.VerifyData(challenge, proof, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)) throw new CryptographicException("DEVICE_KEY_PROOF_FAILED");
    }
    internal static void ProvisionService(Configuration config)
    {
        if (!config.MachineKey || !new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator))
            throw new InvalidOperationException("ADMINISTRATOR_PROVISIONING_REQUIRED");
        if (CngKey.Exists(config.KeyName, CngProvider.MicrosoftSoftwareKeyStorageProvider, CngKeyOpenOptions.MachineKey))
            throw new InvalidOperationException("DEVICE_KEY_ALREADY_EXISTS");
        var serviceSid = (SecurityIdentifier)new NTAccount("NT SERVICE", ServiceHost.Name).Translate(typeof(SecurityIdentifier));
        using var device = new DeviceKey(config, true);
        try
        {
            // Provision locally with administrative rights, then allow only the
            // virtual service to use it. The interactive tray gets no key access.
            var descriptor = new RawSecurityDescriptor($"D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GR;;;{serviceSid.Value})");
            byte[] binary = new byte[descriptor.BinaryLength];
            descriptor.GetBinaryForm(binary, 0);
            using var handle = device.key.Handle;
            int error = NCryptSetProperty(handle, "Security Descr", binary, binary.Length, 4); // DACL_SECURITY_INFORMATION
            if (error != 0) throw new CryptographicException(error);
        }
        catch { device.key.Delete(); throw; }
    }
    internal string PublicKey => Convert.ToBase64String(rsa.ExportSubjectPublicKeyInfo());
    internal string Sign(string message) => Convert.ToBase64String(rsa.SignData(Encoding.UTF8.GetBytes(message), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
    internal static string Hash(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
    internal string EnrollmentProof(string code, string name) => Sign($"NOTIFICA-DEVICE-ENROLL-V1\n{Hash(code)}\n{Convert.ToHexStringLower(SHA256.HashData(Convert.FromBase64String(PublicKey)))}\n{name}");
    internal string SessionProof(string id, string challenge, string nonce) => Sign($"NOTIFICA-DEVICE-SESSION-V1\n{id}\n{challenge}\n{nonce}");
    internal void DeleteTestKey() => key.Delete();
    public void Dispose() { rsa.Dispose(); key.Dispose(); }
}
