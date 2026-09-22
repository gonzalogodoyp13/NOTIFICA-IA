using System.Text.Json;

namespace Notifica.Agent;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            Signing.ProcessPrivacy.Apply();
            if (args.Contains("--self-test")) return SelfTest.Run().GetAwaiter().GetResult();
            if (args.Contains("--signing-self-test")) return Signing.SigningSelfTest.Run().GetAwaiter().GetResult();
            if (args.Contains("--signing-worker")) return Signing.SigningWorker.Run().GetAwaiter().GetResult();
            if (args.Contains("--signing-worker-wait-test")) return Signing.SigningWorker.WaitSelfTest();
            int dialogTest = Array.IndexOf(args, "--signing-dialog-self-test");
            if (dialogTest >= 0 && dialogTest + 1 < args.Length) return Signing.SigningDialogSelfTest.Run(args[dialogTest + 1]);
            int dssTest = Array.IndexOf(args, "--dss-self-test");
            if (dssTest >= 0 && dssTest + 1 < args.Length) return Signing.DssSelfTest.Run(args[dssTest + 1]).GetAwaiter().GetResult();
            int controlledTest = Array.IndexOf(args, "--controlled-self-test");
            if (controlledTest >= 0 && controlledTest + 1 < args.Length) return Signing.ControlledSigningSelfTest.Run(args[controlledTest + 1]).GetAwaiter().GetResult();
            int configIndex = Array.IndexOf(args, "--config");
            string configPath = configIndex >= 0 && configIndex + 1 < args.Length ? Path.GetFullPath(args[configIndex + 1])
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "NotificaIA", "Agent", "config.json");
            var config = Configuration.Load(configPath);
            if (args.Contains("--signing-preflight"))
            {
                using var token = new Signing.Pkcs11SigningToken(config.Pkcs11Library,
                    config.CertificateFingerprint ?? throw new Signing.SigningFailure(Signing.SigningError.CertificateMissing));
                Console.WriteLine(JsonSerializer.Serialize(new { ready = true, fingerprint = Convert.ToHexStringLower(
                    System.Security.Cryptography.SHA256.HashData(token.Certificate)), loginAttempts = 0 }, Configuration.Json));
                return 0;
            }
            if (args.Contains("--initialize-service-key")) { DeviceKey.ProvisionService(config); return 0; }
            if (args.Contains("--integration-test")) return SelfTest.Integration(config, configPath).GetAwaiter().GetResult();
            if (args.Contains("--probe")) { Console.WriteLine(JsonSerializer.Serialize(new TokenProbe().Read(config), Configuration.Json)); return 0; }
            if (args.Contains("--status"))
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                int outputIndex = Array.IndexOf(args, "--status-output");
                string? outputPath = outputIndex < 0 ? null : outputIndex + 1 < args.Length ? Path.GetFullPath(args[outputIndex + 1])
                    : throw new InvalidOperationException("STATUS_OUTPUT_REQUIRED");
                using var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
                string userSid = identity.User!.Value;
                bool isAdministrator = new System.Security.Principal.WindowsPrincipal(identity).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
                try
                {
                    var response = LocalPipe.Request(config, new { action = "status" }, timeout.Token).GetAwaiter().GetResult();
                    if (outputPath is not null) File.WriteAllText(outputPath, JsonSerializer.Serialize(new { response,
                        clientUserSid = userSid, clientIsAdministrator = isAdministrator }, Configuration.Json));
                    Console.WriteLine(response);
                }
                catch (Exception error)
                {
                    string code = error is UnauthorizedAccessException ? "LOCAL_ACCESS_DENIED"
                        : error is TimeoutException ? "PIPE_TIMEOUT"
                        : error.Message is "PIPE_SERVER_ID_UNAVAILABLE" or "PIPE_SERVER_QUERY_DENIED" or "UNTRUSTED_PIPE_SERVER" ? error.Message : "STATUS_QUERY_FAILED";
                    if (outputPath is not null) File.WriteAllText(outputPath, JsonSerializer.Serialize(new { errorCode = code,
                        hresult = error.HResult, clientUserSid = userSid, clientIsAdministrator = isAdministrator }, Configuration.Json));
                    throw;
                }
                return 0;
            }
            if (args.Contains("--service"))
            {
                ServiceHost.Run(ct => {
                    LocalPipe.AllowServerInspection(config);
                    return Run(config, configPath, ct);
                }, error => {
                    // Local, bounded operational diagnostics: never exception
                    // messages, request bodies, credentials or token PINs.
                    var failure = new { code = error is System.Security.Cryptography.CryptographicException ? "DEVICE_IDENTITY_UNAVAILABLE"
                        : error is UnauthorizedAccessException ? "LOCAL_PERMISSION_ERROR" : "SERVICE_START_FAILED",
                        hresult = error.HResult, at = DateTimeOffset.UtcNow };
                    File.WriteAllText(Path.Combine(config.DataDirectory, "service-error.json"), JsonSerializer.Serialize(failure, Configuration.Json));
                });
                return 0;
            }
            if (args.Contains("--console"))
            {
                using var cancellation = new CancellationTokenSource();
                Console.CancelKeyPress += (_, e) => { e.Cancel = true; cancellation.Cancel(); };
                Run(config, configPath, cancellation.Token).GetAwaiter().GetResult();
                return 0;
            }
            ApplicationConfiguration.Initialize();
            using var tray = new Tray(config);
            if (args.Contains("--show-status")) tray.ShowStatus();
            if (args.Contains("--show-signing")) tray.QueueSigning();
            Application.Run(tray);
            return 0;
        }
        catch (OperationCanceledException) { return 0; }
        catch { Console.Error.WriteLine("AGENT_START_FAILED"); return 1; }
    }
    private static async Task Run(Configuration config, string path, CancellationToken ct)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct);
        using var worker = new AgentWorker(config, path);
        Task connectivity = worker.Run(linked.Token), pipe = LocalPipe.Serve(config, worker, linked.Token);
        await Task.WhenAny(connectivity, pipe);
        linked.Cancel();
        try { await Task.WhenAll(connectivity, pipe); }
        catch (OperationCanceledException) when (linked.IsCancellationRequested) { }
    }
}
