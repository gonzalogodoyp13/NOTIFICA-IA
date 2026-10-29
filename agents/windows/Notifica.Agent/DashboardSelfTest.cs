using System.Drawing;
using System.Text.Json;

namespace Notifica.Agent;

internal static class DashboardSelfTest
{
    internal static int Run(bool preview, string? output = null)
    {
        ApplicationConfiguration.Initialize();
        // This fixture cannot reach the installed service, network or token.
        var config = new Configuration("https://test.invalid/", @"C:\Unused", "S-1-5-18", Guid.NewGuid().ToString(),
            @"C:\Unused\token.dll", null, false, SigningEngine: new Signing.DssEngineOptions("", "", "", "", []));
        int folders = 0, sessions = 0, enrollments = 0, refreshes = 0, exits = 0;
        var online = new AgentStatus("ONLINE", "TOKEN_READY", null, "test-device", "SIGNER", DateTimeOffset.Now, null,
            RemoteSession: new Signing.RemoteSessionView(false, null, null, null), OfficeFolderPath: @"C:\NotificaFirmados\Oficina-1");
        using var form = new DashboardForm(config, () => enrollments++, () => { folders++; return Task.CompletedTask; },
            () => { sessions++; return Task.CompletedTask; }, () => { refreshes++; return Task.CompletedTask; }, () => exits++);
        if (preview) { form.Text += " · Vista de prueba (sin conexión real)"; form.UpdateStatus(online); Application.Run(form); return 0; }
        var checks = new List<string>();
        void Snapshot(string name)
        {
            if (output is null) return;
            Directory.CreateDirectory(output);
            form.PerformLayout();
            using var rendered = new Bitmap(form.Width, form.Height);
            form.DrawToBitmap(rendered, new Rectangle(Point.Empty, form.Size));
            rendered.Save(Path.Combine(output, name + ".png"));
        }
        Exception? failure = null;
        form.Shown += (_, _) => {
            try {
                Button Find(string name) => Descendants(form).OfType<Button>().Single(b => b.Name == name);
                void Require(bool ok, string name) { if (!ok) throw new InvalidOperationException(name); checks.Add(name); }
                form.UpdateStatus(null);
                Snapshot("disconnected");
                Require(!Find("FolderAction").Enabled && !Find("SigningAction").Enabled && !Find("EnrollAction").Enabled, "unavailable service disables dependent actions");
                form.UpdateStatus(online with { Connectivity = "WAITING_ENROLLMENT", DeviceId = null, OfficeFolderPath = null });
                Require(Find("EnrollAction").Enabled && !Find("SigningAction").Enabled, "enrollment available before identity exists");
                Find("EnrollAction").PerformClick();
                Require(enrollments == 1, "enrollment button invokes enrollment flow");
                form.UpdateStatus(online);
                Snapshot("signer");
                Require(!Find("EnrollAction").Enabled && Find("FolderAction").Enabled && Find("SigningAction").Enabled, "enrolled signer has folder and session actions");
                Find("FolderAction").PerformClick(); Find("SigningAction").PerformClick();
                Require(folders == 1 && sessions == 1, "folder and signing buttons invoke their existing flows");
                form.UpdateStatus(online with { Role = "RECEIVER", RemoteSession = null });
                Snapshot("receiver");
                Require(!Find("SigningAction").Enabled, "receiver cannot enter signing flow");
                form.UpdateStatus(online with { Health = "CERT_EXPIRED", MirrorError = "DISK" });
                Require(Descendants(form).OfType<Label>().Any(l => l.Text == "Certificado vencido") &&
                    Descendants(form).OfType<Label>().Any(l => l.Text.Contains("necesita atención")), "certificate and office folder errors are visible");
                form.UpdateStatus(online with { RemoteSession = new Signing.RemoteSessionView(true, Guid.NewGuid(), DateTimeOffset.Now.AddHours(1), null) });
                Require(Descendants(form).OfType<Label>().Any(l => l.Text.StartsWith("Firma remota: habilitada hasta")), "enabled session displays local expiration");
                var refresh = Descendants(form).OfType<Button>().Single(b => b.Text == "Actualizar estado");
                int before = refreshes; refresh.PerformClick();
                Require(refreshes == before + 1 && refresh.Enabled, "manual refresh completes and remains usable");
                using var receiver = new DashboardForm(config with { SigningEngine = null }, () => {}, () => Task.CompletedTask,
                    () => Task.CompletedTask, () => Task.CompletedTask, () => {});
                Require(!Descendants(receiver).Any(c => c.Name == "SigningAction"), "receiver configuration omits irrelevant signing action");
                using var bitmap = Brand.Icon.ToBitmap();
                Require(bitmap.GetPixel(9, 16).R > 220 && bitmap.GetPixel(0, 0).R < 50, "embedded N icon renders white on navy");
                form.ClientSize = new Size(620, 620); form.PerformLayout();
                Snapshot("minimum-size");
                foreach (var button in Descendants(form).OfType<Button>().Where(b => b.Visible)) {
                    var bounds = form.RectangleToClient(button.RectangleToScreen(button.ClientRectangle));
                    Require(bounds.Left >= 0 && bounds.Right <= form.ClientSize.Width, "button fits minimum width: " + button.Text);
                }
                Descendants(form).OfType<Button>().Single(b => b.Text == "Ocultar ventana").PerformClick();
                Require(!form.Visible && exits == 0, "hiding window does not exit tray or stop signing");
            } catch (Exception error) { failure = error; }
            finally { form.Close(); }
        };
        Application.Run(form);
        Console.WriteLine(JsonSerializer.Serialize(new { passed = checks.Count, checks, error = failure?.Message, realTokenLoginAttempts = 0 }, Configuration.Json));
        return failure is null ? 0 : 1;
    }
    private static IEnumerable<Control> Descendants(Control root)
    {
        foreach (Control child in root.Controls) { yield return child; foreach (var nested in Descendants(child)) yield return nested; }
    }
}
