using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Net.Security;

namespace Notifica.Agent;

internal static class SelfTest
{
    // Test-only loopback host, with explicit local trust root, hostname checks
    // and normal X509 chain validation. Installed service never uses this path.
    internal static async Task<int> Integration(Configuration config, string configPath)
    {
        if (!new Uri(config.ServerUrl).IsLoopback || config.MachineKey) throw new InvalidOperationException("TEST_LOOPBACK_REQUIRED");
        using var anchor = X509CertificateLoader.LoadCertificateFromFile(Path.Combine(config.DataDirectory, "test-root.cer"));
        using var handler = new HttpClientHandler();
        handler.ServerCertificateCustomValidationCallback = (_, cert, _, errors) =>
        {
            if (cert is null || (errors & (SslPolicyErrors.RemoteCertificateNameMismatch | SslPolicyErrors.RemoteCertificateNotAvailable)) != 0) return false;
            using var chain = new X509Chain();
            chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
            chain.ChainPolicy.CustomTrustStore.Add(anchor);
            chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck; // synthetic test CA has no revocation service
            return chain.Build(cert);
        };
        using var cancellation = new CancellationTokenSource(TimeSpan.FromMinutes(5));
        using var worker = new AgentWorker(config, configPath, handler);
        Task run = worker.Run(cancellation.Token), pipe = LocalPipe.Serve(config, worker, cancellation.Token);
        try { await Task.WhenAny(run, pipe); }
        finally { cancellation.Cancel(); try { await Task.WhenAll(run, pipe); } catch (OperationCanceledException) { } }
        return 0;
    }
    private static void Require(bool condition, string name) { if (!condition) throw new InvalidOperationException(name); }
    internal static async Task<int> Run()
    {
        string directory = Path.Combine(Path.GetTempPath(), "NotificaAgentTest-" + Guid.NewGuid());
        var config = new Configuration("https://localhost/", directory, WindowsIdentity.GetCurrent().User!.Value,
            Guid.NewGuid().ToString(), Path.Combine(directory, "missing.dll"), null, false);
        config.Validate();
        try
        {
            string publicKey;
            using (var key = new DeviceKey(config))
            {
                publicKey = key.PublicKey;
                using var verifier = RSA.Create();
                verifier.ImportSubjectPublicKeyInfo(Convert.FromBase64String(publicKey), out _);
                string message = "NOTIFICA-DEVICE-SESSION-V1\ndevice\nchallenge\nnonce";
                Require(verifier.VerifyData(Encoding.UTF8.GetBytes(message), Convert.FromBase64String(key.SessionProof("device", "challenge", "nonce")), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1), "CNG_PROOF");
                // Exporting the persistent private device key must fail.
                using var native = CngKey.Open(config.KeyName);
                bool denied = false;
                try { native.Export(CngKeyBlobFormat.Pkcs8PrivateBlob); } catch (CryptographicException) { denied = true; }
                Require(denied, "PRIVATE_EXPORT_DENIED");
            }
            using (var recovered = new DeviceKey(config)) Require(publicKey == recovered.PublicKey, "KEY_RESTART_PERSISTENCE");
            Require(new TokenProbe().Read(config).Token == "DRIVER_MISSING", "MISSING_DRIVER");
            using var signingKey = RSA.Create(2048);
            var request = new CertificateRequest("CN=Synthetic Agent Test", signingKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, true));
            using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-10), DateTimeOffset.UtcNow.AddDays(-1));
            var description = TokenProbe.Describe(certificate)!;
            Require(TokenProbe.Health(new("READY", description), DateTimeOffset.UtcNow) == "CERT_EXPIRED", "EXPIRED_CERTIFICATE");
            Require(TokenProbe.Health(new("READY", description with { ExpiresAt = DateTimeOffset.UtcNow.AddDays(10) }), DateTimeOffset.UtcNow) == "CERT_EXPIRING", "EXPIRING_CERTIFICATE");
            Require(TokenProbe.Health(new("MISSING", null), DateTimeOffset.UtcNow) == "AGENT_ONLINE_TOKEN_MISSING", "TOKEN_REMOVAL");
            Require(TokenProbe.Select([description, description with { Fingerprint = new string('b', 64) }], null).Token == "CERT_AMBIGUOUS", "AMBIGUOUS_CERTIFICATE");
            Require(TokenProbe.Select([description], description.Fingerprint).Token == "READY", "FINGERPRINT_SELECTION");
            var acl = LocalPipe.Security(config).GetSecurityDescriptorSddlForm(System.Security.AccessControl.AccessControlSections.Access);
            Require(acl.Contains("D:P", StringComparison.Ordinal) && !acl.Contains(";;;WD)", StringComparison.Ordinal), "RESTRICTED_PIPE_DACL");
            // Real local IPC with status and hostile unsupported request. No network.
            Directory.CreateDirectory(directory);
            using var worker = new AgentWorker(config, Path.Combine(directory, "config.json"));
            using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            Task server = LocalPipe.Serve(config, worker, cancellation.Token);
            var state = await LocalPipe.Request(config, new { action = "status" }, cancellation.Token);
            Require(state.GetProperty("status").GetProperty("connectivity").GetString() == "WAITING_ENROLLMENT", "PIPE_STATUS");
            var deniedRequest = await LocalPipe.Request(config, new { action = "sign", pin = "synthetic-never-used" }, cancellation.Token);
            Require(!deniedRequest.GetProperty("ok").GetBoolean(), "NO_PIN_OR_SIGNING_IPC");
            cancellation.Cancel();
            try { await server; } catch (OperationCanceledException) { }
            Console.WriteLine(JsonSerializer.Serialize(new { passed = 12, cngExportDenied = true, restartKeyPreserved = true, pipeVerified = true, tokenLoginAttempts = 0 }));
            return 0;
        }
        finally
        {
            if (CngKey.Exists(config.KeyName)) { using var key = CngKey.Open(config.KeyName); key.Delete(); }
            // Exact fresh test directory, never a configured production directory.
            if (Directory.Exists(directory)) Directory.Delete(directory, true);
        }
    }
}
