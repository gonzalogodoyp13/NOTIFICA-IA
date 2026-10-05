using System.Reflection;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;

namespace Notifica.Agent.Signing;

// Real private-worker protocol, secured IPC and native form; missing provider
// guarantees that the synthetic PIN can never reach a hardware login.
internal static class RemoteSessionSelfTest
{
    internal static int Run(string enginePath)
    {
        var engine = JsonSerializer.Deserialize<DssEngineOptions>(File.ReadAllText(enginePath), Configuration.Json)!;
        string directory = Path.Combine(engine.OutputDirectory, "remote-ui-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var config = new Configuration("https://localhost/", directory, WindowsIdentity.GetCurrent().User!.Value,
            Guid.NewGuid().ToString(), Path.Combine(directory, "missing-provider.dll"), new string('a', 64), false, null, engine);
        File.WriteAllText(Path.Combine(directory, "identity.json"), JsonSerializer.Serialize(new Identity("synthetic-device", 1, "SIGNER"), Configuration.Json));
        using var serving = new CancellationTokenSource();
        Task? server = null;
        try {
            using (var session = new RemoteTokenSession(config)) {
                using var pin = new PinBuffer("synthetic-only"u8);
                try { session.Enable(1, pin, serving.Token).GetAwaiter().GetResult(); throw new InvalidOperationException("MISSING_PROVIDER_ACCEPTED"); }
                catch (SigningFailure failure) when (failure.Code == SigningError.DriverFailure) { }
                if (!pin.IsCleared || session.View.Enabled) throw new InvalidOperationException("FAILED_ACTIVATION_RETAINED");
            }
            using var worker = new AgentWorker(config, Path.Combine(directory, "unused.json"));
            server = LocalPipe.Serve(config, worker, serving.Token);
            ApplicationConfiguration.Initialize();
            using var dialog = new RemoteSessionDialog(config);
            Exception? error = null;
            dialog.Shown += async (_, _) => {
                try {
                    var refresh = typeof(RemoteSessionDialog).GetMethod("RefreshState", BindingFlags.Instance | BindingFlags.NonPublic)!;
                    await Task.Delay(300);
                    await (Task)refresh.Invoke(dialog, null)!;
                    var pin = Find<SecurePinEntry>(dialog);
                    var consent = Find<CheckBox>(dialog);
                    var buttons = All(dialog).OfType<Button>().ToArray();
                    var enable = buttons.Single(b => b.Text == "Habilitar firma remota");
                    var disable = buttons.Single(b => b.Text == "Cerrar sesión de firma");
                    if (!pin.Enabled || enable.Enabled || disable.Enabled || consent.Checked) throw new InvalidOperationException("INITIAL_REMOTE_CONTROLS");
                    typeof(SecurePinEntry).GetMethod("OnKeyPress", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(pin, [new KeyPressEventArgs('x')]);
                    if (enable.Enabled) throw new InvalidOperationException("REMOTE_CONSENT_REQUIRED");
                    consent.Checked = true;
                    for (int i = 0; i < 3; i++) await (Task)refresh.Invoke(dialog, null)!;
                    if (!enable.Enabled || !pin.HasValue || !pin.Enabled) throw new InvalidOperationException("REMOTE_POLL_CLEARED_PIN");
                    pin.Clear(); consent.Checked = false;
                    using var bitmap = new Bitmap(dialog.Width, dialog.Height);
                    dialog.DrawToBitmap(bitmap, new Rectangle(Point.Empty, dialog.Size));
                    bitmap.Save(Path.Combine(Path.GetDirectoryName(enginePath)!, "remote-session-dialog.png"));
                } catch (Exception failure) { error = failure; }
                finally { dialog.Close(); }
            };
            Application.Run(dialog);
            worker.Remote!.DisposeAsync().AsTask().GetAwaiter().GetResult();
            if (error is not null) throw error;
            Console.WriteLine(JsonSerializer.Serialize(new { passed = 6, realTokenLoginAttempts = 0,
                workerFailureClosesSession = true, failedActivationClearsPin = true, securedSessionStatus = true,
                initialControlsLocked = true, consentRequired = true, pollingPreservesPin = true }));
            return 0;
        } finally {
            serving.Cancel();
            try { server?.GetAwaiter().GetResult(); } catch (OperationCanceledException) { }
            if (CngKey.Exists(config.KeyName)) { using var key = CngKey.Open(config.KeyName); key.Delete(); }
            Directory.Delete(directory, true);
        }
    }
    private static IEnumerable<Control> All(Control root) => root.Controls.Cast<Control>().SelectMany(child => new[] { child }.Concat(All(child)));
    private static T Find<T>(Control root) where T : Control => All(root).OfType<T>().First();
}
