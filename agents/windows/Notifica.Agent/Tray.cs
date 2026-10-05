using System.Drawing;
using System.Text.Json;

namespace Notifica.Agent;

internal sealed class Tray : ApplicationContext
{
    private readonly NotifyIcon icon = new() { Icon = SystemIcons.Application, Text = "NOTIFICA IA · Agente", Visible = true };
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 3000 };
    private readonly Configuration config;
    private readonly ToolStripMenuItem state = new("Conectando…") { Enabled = false };
    private readonly ToolStripMenuItem health = new("Firma digital") { Enabled = false };
    private bool polling;
    private Form? details;
    private Label detailState = new();
    private Label detailHealth = new();
    internal void ShowStatus()
    {
        if (details is { IsDisposed: false }) { details.Activate(); return; }
        detailState = new Label { Left = 24, Top = 24, Width = 470, Height = 40, Font = new Font("Segoe UI", 13, FontStyle.Bold) };
        detailHealth = new Label { Left = 24, Top = 72, Width = 470, Height = 50 };
        details = new Form { Text = "Estado del agente · NOTIFICA IA", Width = 535, Height = 245, StartPosition = FormStartPosition.CenterScreen,
            FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false };
        var enroll = new Button { Text = "Inscribir equipo…", Left = 24, Top = 135, Width = 185 };
        enroll.Click += (_, _) => Enroll();
        var close = new Button { Text = "Cerrar", Left = 354, Top = 135, Width = 140 };
        close.Click += (_, _) => details.Close();
        details.Controls.AddRange([detailState, detailHealth, enroll, close]);
        details.Show();
        _ = Refresh();
    }
    internal Tray(Configuration config)
    {
        this.config = config;
        var menu = new ContextMenuStrip();
        menu.Items.Add(state); menu.Items.Add(health); menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Ver estado…", null, (_, _) => ShowStatus());
        menu.Items.Add("Inscribir este equipo…", null, (_, _) => Enroll());
        menu.Items.Add("Abrir firmados de la oficina", null, async (_, _) => {
            try {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                var response = await LocalPipe.Request(config, new { action = "status" }, timeout.Token);
                var status = response.GetProperty("status").Deserialize<AgentStatus>(Configuration.Json)!;
                if (status.OfficeFolderPath is null) throw new IOException();
                var start = new System.Diagnostics.ProcessStartInfo("explorer.exe") { UseShellExecute = true };
                start.ArgumentList.Add(status.OfficeFolderPath);
                System.Diagnostics.Process.Start(start);
            } catch { MessageBox.Show("La carpeta aún no está disponible. Revisa la inscripción y la conexión del agente.", "Firmados de la oficina"); }
        });
        if (config.ControlledSigning is not null)
            menu.Items.Add("Revisar lote de prueba…", null, async (_, _) => await ShowSigning());
        if (config.SigningEngine is not null)
            menu.Items.Add("Sesión de firma remota…", null, (_, _) => { using var dialog = new Signing.RemoteSessionDialog(config); dialog.ShowDialog(); });
        menu.Items.Add("Salir de la bandeja", null, (_, _) => ExitThread());
        icon.ContextMenuStrip = menu;
        icon.DoubleClick += (_, _) => ShowStatus();
        timer.Tick += async (_, _) => await Refresh();
        timer.Start();
        _ = Refresh();
    }
    private async Task Refresh()
    {
        if (polling) return;
        polling = true;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(4));
        try
        {
            var response = await LocalPipe.Request(config, new { action = "status" }, timeout.Token);
            var status = response.GetProperty("status").Deserialize<AgentStatus>(Configuration.Json)!;
            state.Text = status.Connectivity switch { "ONLINE" => "Servicio conectado", "WAITING_ENROLLMENT" => "Equipo pendiente de inscripción", _ => "Servidor sin conexión" };
            health.Text = status.Role == "RECEIVER" ? "Equipo receptor" : status.Health switch {
                "TOKEN_READY" => "Token disponible", "CERT_EXPIRING" => "Certificado próximo a vencer", "CERT_EXPIRED" => "Certificado vencido",
                "AGENT_ONLINE_TOKEN_MISSING" => "Token desconectado", "DRIVER_ERROR" => "Revisar controlador o certificado", _ => "Firma no disponible" };
            if (status.MirrorError is not null) health.Text += " · Revisar la carpeta compartida de la oficina";
            if (status.RemoteSession is { } remote) health.Text += remote.Enabled ? " · Firma remota habilitada" : " · Firma remota deshabilitada";
            icon.Text = "NOTIFICA IA · " + (status.Connectivity == "ONLINE" ? "Conectado" : "Sin conexión");
        }
        catch { state.Text = "Servicio de Windows sin conexión"; health.Text = "No se pudo consultar el agente"; icon.Text = "NOTIFICA IA · Servicio sin conexión"; }
        finally { if (!detailState.IsDisposed) detailState.Text = state.Text; if (!detailHealth.IsDisposed) detailHealth.Text = health.Text; polling = false; }
    }
    internal async Task ShowSigning()
    {
        if (config.SigningEngine is not null) { using var remote = new Signing.RemoteSessionDialog(config); remote.ShowDialog(); return; }
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var answer = await LocalPipe.Request(config, new { action = "controlled-batch" }, timeout.Token);
            var batch = answer.GetProperty("batch").Deserialize<Signing.ControlledBatchView>(Configuration.Json)!;
            using var dialog = new Signing.SigningDialog(config, batch);
            dialog.ShowDialog();
        }
        catch { MessageBox.Show("No hay una firma disponible para revisar. Comprueba el estado del servicio local.", "Firma digital", MessageBoxButtons.OK, MessageBoxIcon.Information); }
    }
    internal void QueueSigning()
    {
        // Start after Application.Run has installed the UI message loop and its
        // synchronization context, so the async pipe reply resumes on the STA.
        var launch = new System.Windows.Forms.Timer { Interval = 100 };
        launch.Tick += async (_, _) => { launch.Stop(); launch.Dispose(); await ShowSigning(); };
        launch.Start();
    }
    private void Enroll()
    {
        using var dialog = new Form { Text = "Inscribir equipo · NOTIFICA IA", Width = 470, Height = 335, StartPosition = FormStartPosition.CenterScreen, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false };
        var label = new Label { Text = "Código temporal entregado por el administrador", Left = 20, Top = 18, Width = 410 };
        var code = new TextBox { Left = 20, Top = 45, Width = 410, UseSystemPasswordChar = true, MaxLength = 43 };
        var name = new TextBox { Left = 20, Top = 90, Width = 410, Text = Environment.MachineName, MaxLength = 100 };
        var folderLabel = new Label { Text = "Ubicación de la carpeta compartida (todos los equipos)", Left = 20, Top = 128, Width = 410 };
        var folder = new TextBox { Left = 20, Top = 154, Width = 310, Text = config.ReceiverDirectory ?? "", MaxLength = 220 };
        var browse = new Button { Text = "Elegir…", Left = 340, Top = 152, Width = 90 };
        browse.Click += (_, _) => { using var picker = new FolderBrowserDialog(); if (picker.ShowDialog(dialog) == DialogResult.OK) folder.Text = picker.SelectedPath; };
        var note = new Label { Text = "Últimos 50 días · Los PDF se descargan al abrirlos. El historial completo sigue disponible en Firmados.", Left = 20, Top = 190, Width = 410, Height = 35 };
        var button = new Button { Text = "Autorizar inscripción", Left = 235, Top = 240, Width = 195 };
        button.Click += async (_, _) => {
            button.Enabled = false;
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(25));
            try
            {
                var response = await LocalPipe.Request(config, new { action = "enroll", code = code.Text, name = name.Text.Trim(), receiverDirectory = string.IsNullOrWhiteSpace(folder.Text) ? null : folder.Text.Trim() }, timeout.Token);
                code.Clear();
                if (!response.GetProperty("ok").GetBoolean()) throw new InvalidOperationException();
                dialog.DialogResult = DialogResult.OK;
                dialog.Close();
            }
            catch { code.Clear(); MessageBox.Show(dialog, "No se pudo inscribir el equipo. Revisa el servicio y solicita un código vigente.", "Inscripción", MessageBoxButtons.OK, MessageBoxIcon.Information); }
            finally { button.Enabled = true; }
        };
        dialog.Controls.AddRange([label, code, name, folderLabel, folder, browse, note, button]);
        dialog.ShowDialog();
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { timer.Stop(); timer.Dispose(); details?.Dispose(); icon.Visible = false; icon.Dispose(); }
        base.Dispose(disposing);
    }
}
