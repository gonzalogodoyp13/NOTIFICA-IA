using System.Drawing;
using System.Text.Json;

namespace Notifica.Agent;

internal sealed class Tray : ApplicationContext
{
    private readonly NotifyIcon icon = new() { Icon = Brand.Icon, Text = "NOTIFICA IA · Agente", Visible = true };
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 3000 };
    private readonly Configuration config;
    private readonly ToolStripMenuItem state = new("Conectando…") { Enabled = false };
    private readonly ToolStripMenuItem health = new("Firma digital") { Enabled = false };
    private bool polling;
    private DashboardForm? details;
    private AgentStatus? lastStatus;
    private readonly CancellationTokenSource lifetime = new();
    internal void ShowStatus()
    {
        if (details is { IsDisposed: false }) { details.WindowState = FormWindowState.Normal; details.Activate(); return; }
        details = new DashboardForm(config, Enroll, OpenOfficeFolder, ShowSigning, Refresh, ExitThread);
        if (lastStatus is not null) details.UpdateStatus(lastStatus);
        details.Show();
        _ = Refresh();
    }
    internal Tray(Configuration config)
    {
        this.config = config;
        var menu = new ContextMenuStrip();
        menu.Items.Add(state); menu.Items.Add(health); menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Abrir NOTIFICA…", null, (_, _) => ShowStatus());
        menu.Items.Add("Inscribir este equipo…", null, (_, _) => Enroll());
        menu.Items.Add("Abrir firmados de la oficina", null, async (_, _) => await OpenOfficeFolder());
        if (config.ControlledSigning is not null)
            menu.Items.Add("Revisar lote de prueba…", null, async (_, _) => await ShowSigning());
        if (config.SigningEngine is not null)
            menu.Items.Add("Sesión de firma remota…", null, async (_, _) => await ShowSigning());
        menu.Items.Add("Salir de la bandeja", null, (_, _) => ExitThread());
        icon.ContextMenuStrip = menu;
        icon.DoubleClick += (_, _) => ShowStatus();
        timer.Tick += async (_, _) => await Refresh();
        timer.Start();
        // First poll runs on the message loop; ShowStatus also refreshes immediately.
    }
    private async Task Refresh()
    {
        if (polling) return;
        polling = true;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        timeout.CancelAfter(TimeSpan.FromSeconds(4));
        try
        {
            var response = await LocalPipe.Request(config, new { action = "status" }, timeout.Token);
            var status = response.GetProperty("status").Deserialize<AgentStatus>(Configuration.Json)!;
            if (lifetime.IsCancellationRequested) return;
            lastStatus = status;
            state.Text = DashboardForm.ConnectionText(status);
            health.Text = DashboardForm.HealthText(status);
            if (status.MirrorError is not null) health.Text += " · Revisar la carpeta compartida de la oficina";
            if (status.RemoteSession is { } remote) health.Text += remote.Enabled ? " · Firma remota habilitada" : " · Firma remota deshabilitada";
            icon.Text = "NOTIFICA IA · " + (status.Connectivity == "ONLINE" ? "Conectado" : "Sin conexión");
        }
        catch { if (!lifetime.IsCancellationRequested) { lastStatus = null; state.Text = "Servicio de Windows sin conexión"; health.Text = "No se pudo consultar el agente"; icon.Text = "NOTIFICA IA · Servicio sin conexión"; } }
        finally { if (!lifetime.IsCancellationRequested) details?.UpdateStatus(lastStatus); polling = false; }
    }
    private async Task OpenOfficeFolder()
    {
        try {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var response = await LocalPipe.Request(config, new { action = "status" }, timeout.Token);
            var status = response.GetProperty("status").Deserialize<AgentStatus>(Configuration.Json)!;
            if (status.OfficeFolderPath is null) throw new IOException();
            var start = new System.Diagnostics.ProcessStartInfo("explorer.exe") { UseShellExecute = true };
            start.ArgumentList.Add(status.OfficeFolderPath);
            System.Diagnostics.Process.Start(start);
        } catch { MessageBox.Show(details, "La carpeta aún no está disponible. Revisa la inscripción y la conexión del agente.", "Firmados de la oficina"); }
    }
    internal async Task ShowSigning()
    {
        if (config.SigningEngine is not null) { using var remote = new Signing.RemoteSessionDialog(config); remote.ShowDialog(details); await Refresh(); return; }
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var answer = await LocalPipe.Request(config, new { action = "controlled-batch" }, timeout.Token);
            var batch = answer.GetProperty("batch").Deserialize<Signing.ControlledBatchView>(Configuration.Json)!;
            using var dialog = new Signing.SigningDialog(config, batch);
            dialog.ShowDialog(details);
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
        using var dialog = new Form { Text = "Inscribir equipo · NOTIFICA IA", Icon = Brand.Icon, Width = 470, Height = 335, StartPosition = FormStartPosition.CenterScreen, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false };
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
        dialog.ShowDialog(details);
        _ = Refresh();
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { lifetime.Cancel(); timer.Stop(); timer.Dispose(); details?.Dispose(); icon.Visible = false; icon.ContextMenuStrip?.Dispose(); icon.Dispose(); }
        base.Dispose(disposing);
    }
}
