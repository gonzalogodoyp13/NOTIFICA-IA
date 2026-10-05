using System.Text.Json;

namespace Notifica.Agent.Signing;

internal sealed class RemoteSessionDialog : Form
{
    private readonly Configuration config;
    private readonly SecurePinEntry pin = new() { Dock = DockStyle.Fill, Height = 38 };
    private readonly CheckBox consent = new() { Text = "Autorizo las firmas solicitadas desde la cuenta de esta oficina durante esta sesión.", AutoSize = true, MaximumSize = new Size(590, 0) };
    private readonly Button enable = new() { Text = "Habilitar firma remota", AutoSize = true };
    private readonly Button disable = new() { Text = "Cerrar sesión de firma", AutoSize = true };
    private readonly Label status = new() { AutoSize = true, MaximumSize = new Size(590, 0) };
    private readonly Label identity = new() { AutoSize = true, MaximumSize = new Size(590, 0) };
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 3000 };
    private readonly CancellationTokenSource lifetime = new();
    private bool busy, active, loaded, polling;
    internal RemoteSessionDialog(Configuration config)
    {
        this.config = config;
        Text = "Sesión de firma remota · NOTIFICA IA"; Width = 690; Height = 540; MinimumSize = new Size(650, 520);
        StartPosition = FormStartPosition.CenterScreen;
        var layout = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24), FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true };
        layout.Controls.Add(new Label { Text = "Habilitar el token para la cuenta de la oficina", AutoSize = true, Font = new Font("Segoe UI", 14, FontStyle.Bold) });
        layout.Controls.Add(identity);
        layout.Controls.Add(new Label { Text = "Cualquier usuario activo de la oficina podrá solicitar firmas desde otra computadora. No se pedirá aprobación local por documento. La sesión dura hasta 8 horas y se cierra al detener el servicio, por error del token o al pulsar Cerrar sesión. El PIN se usa una vez y no se guarda.", AutoSize = true, MaximumSize = new Size(590, 0), Margin = new Padding(3, 15, 3, 15) });
        layout.Controls.Add(new Label { Text = "PIN local del token (sin pegar)", AutoSize = true });
        pin.Width = 580; pin.Dock = DockStyle.None; layout.Controls.Add(pin);
        layout.Controls.Add(consent);
        var buttons = new FlowLayoutPanel { Width = 590, Height = 48 };
        buttons.Controls.Add(enable); buttons.Controls.Add(disable); layout.Controls.Add(buttons); layout.Controls.Add(status);
        Controls.Add(layout);
        enable.Click += async (_, _) => await Change(true); disable.Click += async (_, _) => await Change(false);
        consent.CheckedChanged += (_, _) => UpdateButtons(); pin.Changed += UpdateButtons;
        timer.Tick += async (_, _) => await RefreshState();
        Shown += async (_, _) => { timer.Start(); await RefreshState(); };
        FormClosing += (_, e) => { if (busy) e.Cancel = true; };
        UpdateButtons();
    }
    private void UpdateButtons()
    {
        enable.Enabled = loaded && !busy && !active && consent.Checked && pin.HasValue;
        disable.Enabled = loaded && !busy && active;
        pin.Enabled = loaded && !busy && !active; consent.Enabled = loaded && !busy && !active;
    }
    private async Task RefreshState()
    {
        if (busy || polling) return;
        polling = true;
        try {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token); deadline.CancelAfter(TimeSpan.FromSeconds(5));
            var response = await LocalPipe.Request(config, new { action = "remote-session" }, deadline.Token);
            var view = response.GetProperty("session").Deserialize<RemoteSessionView>(Configuration.Json)!;
            loaded = response.GetProperty("officeId").ValueKind == JsonValueKind.Number;
            identity.Text = "Oficina: " + response.GetProperty("officeId") + "\nCertificado SHA-256: " + response.GetProperty("fingerprint").GetString();
            active = view.Enabled;
            status.Text = active ? "Firma remota habilitada hasta " + view.ExpiresAt?.ToLocalTime().ToString("g")
                : view.Error switch {
                    "PinIncorrect" => "PIN incorrecto. No se reintentó. Comprueba el PIN con el titular antes de habilitar otra vez.",
                    "PinLocked" => "PIN bloqueado. Sigue el procedimiento de desbloqueo del proveedor.",
                    "PinExpired" => "PIN vencido. Actualízalo mediante el procedimiento del proveedor.",
                    _ => "Firma remota deshabilitada. Habilita el token localmente para procesar solicitudes web."
                };
        } catch { loaded = false; status.Text = "No se pudo consultar la sesión. Revisa el servicio y la inscripción del equipo."; }
        finally { polling = false; if (!IsDisposed) UpdateButtons(); }
    }
    private async Task Change(bool turnOn)
    {
        if (busy) return;
        busy = true; UpdateButtons();
        try {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token); deadline.CancelAfter(TimeSpan.FromSeconds(55));
            if (turnOn) { using var value = pin.Take(); await LocalPipe.EnableRemote(config, value, deadline.Token); }
            else { var answer = await LocalPipe.Request(config, new { action = "disable-remote-session" }, deadline.Token); if (!answer.GetProperty("ok").GetBoolean()) throw new IOException(); }
            consent.Checked = false;
            busy = false; await RefreshState();
        } catch { status.Text = "No se pudo cambiar la sesión. No repitas un PIN por aproximación; revisa token, certificado e inscripción."; }
        finally { pin.Clear(); busy = false; if (!IsDisposed) UpdateButtons(); }
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing && !IsDisposed) { timer.Stop(); timer.Dispose(); lifetime.Cancel(); lifetime.Dispose(); pin.Clear(); }
        base.Dispose(disposing);
    }
}
