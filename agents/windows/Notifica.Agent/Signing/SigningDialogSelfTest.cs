using System.Reflection;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;

namespace Notifica.Agent.Signing;

// A real WinForms message loop and secured pipe, with a deliberately missing
// provider. The single synthetic character can never reach a hardware login.
internal static class SigningDialogSelfTest
{
    internal static int Run(string enginePath)
    {
        var engine = JsonSerializer.Deserialize<DssEngineOptions>(File.ReadAllText(enginePath), Configuration.Json)!;
        string directory = Path.Combine(engine.OutputDirectory, "dialog-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var batch = new SigningBatch(Guid.NewGuid(), 1, "UI regression only", "Synthetic input test", "Synthetic signer",
            new string('a', 64), SigningProfile.PADES_B,
            [new("NO-HARDWARE-LOGIN", Path.Combine(directory, "unused.pdf"), new string('b', 64))]);
        string manifest = Path.Combine(directory, "batch.json");
        File.WriteAllText(manifest, JsonSerializer.Serialize(batch, Configuration.Json));
        var config = new Configuration("https://localhost/", directory, WindowsIdentity.GetCurrent().User!.Value,
            Guid.NewGuid().ToString(), Path.Combine(directory, "deliberately-missing-provider.dll"), batch.SignerFingerprint,
            false, new(manifest, 1, "SIGNER", engine));
        using var serving = new CancellationTokenSource();
        Task? server = null;
        try
        {
            using var worker = new AgentWorker(config, Path.Combine(directory, "unused-config.json"));
            server = LocalPipe.Serve(config, worker, serving.Token);
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            var response = LocalPipe.Request(config, new { action = "controlled-batch" }, timeout.Token).GetAwaiter().GetResult();
            var view = response.GetProperty("batch").Deserialize<ControlledBatchView>(Configuration.Json)!;
            ApplicationConfiguration.Initialize();
            using var dialog = new SigningDialog(config, view);
            int disabledTransitions = 0, lostFocus = 0, polls = 0;
            Exception? failure = null;
            dialog.Shown += async (_, _) =>
            {
                try
                {
                    // Shown fires before the initial activation/focus messages
                    // have been dispatched. Test after that normal UI turn.
                    await Task.Delay(150, timeout.Token);
                    // Test runners start with a hidden startup window. Explicitly
                    // show this synthetic form after that first show is consumed.
                    dialog.Hide(); dialog.Show();
                    var pin = Find<SecurePinEntry>(dialog);
                    var consent = Find<CheckBox>(dialog);
                    var approve = Find<Button>(dialog);
                    dialog.Activate();
                    if (!pin.Focus())
                    {
                        Console.Error.WriteLine(JsonSerializer.Serialize(new { test = "focus-setup", view.State,
                            view.RemainingApprovalMilliseconds, pin.Enabled, pin.Visible, pin.CanFocus, pin.Width, pin.Height,
                            dialogVisible = dialog.Visible }, Configuration.Json));
                        throw new InvalidOperationException("PIN_FOCUS_FAILED");
                    }
                    pin.EnabledChanged += (_, _) => { if (!pin.Enabled) disabledTransitions++; };
                    pin.LostFocus += (_, _) => lostFocus++;
                    typeof(SecurePinEntry).GetMethod("OnKeyPress", BindingFlags.Instance | BindingFlags.NonPublic)!
                        .Invoke(pin, [new KeyPressEventArgs('x')]);
                    var poll = typeof(SigningDialog).GetMethod("Poll", BindingFlags.Instance | BindingFlags.NonPublic)!;
                    for (int i = 0; i < 4; i++)
                    {
                        await (Task)poll.Invoke(dialog, null)!;
                        polls++;
                        await Task.Delay(300, timeout.Token);
                        if (!pin.Enabled || !pin.Focused || !pin.HasValue)
                            throw new InvalidOperationException("POLL_INTERRUPTED_TYPING");
                    }
                    if (disabledTransitions != 0 || lostFocus != 0) throw new InvalidOperationException("PIN_FOCUS_FLICKER");
                    if (consent.Checked || approve.Enabled) throw new InvalidOperationException("APPROVAL_WITHOUT_CONSENT");
                    pin.Clear();
                    if (pin.HasValue) throw new InvalidOperationException("SYNTHETIC_INPUT_NOT_CLEARED");
                }
                catch (Exception error) { failure = error; }
                finally { dialog.Close(); }
            };
            Application.Run(dialog);
            if (failure is not null)
            {
                string[] knownErrors = ["PIN_FOCUS_FAILED", "POLL_INTERRUPTED_TYPING", "PIN_FOCUS_FLICKER",
                    "APPROVAL_WITHOUT_CONSENT", "SYNTHETIC_INPUT_NOT_CLEARED"];
                Console.WriteLine(JsonSerializer.Serialize(new { passed = 0, publicStatusPolls = polls, disabledTransitions,
                    lostFocus, error = knownErrors.Contains(failure.Message) ? failure.Message : failure.GetType().Name }, Configuration.Json));
                return 1;
            }
            Console.WriteLine(JsonSerializer.Serialize(new { passed = 3, publicStatusPolls = polls, disabledTransitions,
                lostFocus, realTokenLoginAttempts = 0, checks = new[] {
                    "PIN stays enabled and focused across real secured-pipe polls",
                    "Synthetic input survives polling and clears explicitly",
                    "Typing alone cannot authorize the batch" } }, Configuration.Json));
            return 0;
        }
        finally
        {
            serving.Cancel();
            if (server is not null)
            {
                try { server.GetAwaiter().GetResult(); }
                catch (OperationCanceledException) { }
                catch (Exception error) { Console.Error.WriteLine("TEST_SERVER_" + error.GetType().Name); throw; }
            }
            if (CngKey.Exists(config.KeyName)) { using var key = CngKey.Open(config.KeyName); key.Delete(); }
        }
    }
    private static T Find<T>(Control root) where T : Control => Descendants(root).OfType<T>().Single();
    private static IEnumerable<Control> Descendants(Control root)
    {
        foreach (Control child in root.Controls)
        {
            yield return child;
            foreach (var descendant in Descendants(child)) yield return descendant;
        }
    }
}
