using System.Drawing;

namespace Notifica.Agent;

// Public status only. PIN entry and signing consent stay in the existing dialogs.
internal sealed class DashboardForm : Form
{
    private readonly Label connection = TextLabel("Consultando el servicio…", 12, true);
    private readonly Label token = TextLabel("Consultando el token…");
    private readonly Label session = TextLabel("Consultando la sesión…");
    private readonly Label guidance = TextLabel("Espera un momento mientras consultamos el estado del equipo.");
    private readonly Label contact = TextLabel("Actualización automática cada 3 segundos", 9);
    private readonly Button folder;
    private readonly Button? signing;
    private readonly Button enroll;
    private readonly Button refresh;
    private bool refreshing;

    internal DashboardForm(Configuration config, Action enrollAction, Func<Task> folderAction,
        Func<Task> signingAction, Func<Task> refreshAction, Action exitAction)
    {
        Text = "NOTIFICA IA · Firma digital";
        Icon = Brand.Icon;
        Font = new Font("Segoe UI", 10);
        ForeColor = Brand.Ink;
        BackColor = Color.FromArgb(244, 246, 249);
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(660, 680);
        MinimumSize = new Size(620, 620);
        StartPosition = FormStartPosition.CenterScreen;

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3 };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 88));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        var header = new TableLayoutPanel { Dock = DockStyle.Fill, BackColor = Brand.Navy,
            Padding = new Padding(24, 10, 24, 10), ColumnCount = 2, Margin = Padding.Empty };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 66));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        var logo = new PictureBox { Image = Brand.CreateLogo(), Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.CenterImage, Margin = Padding.Empty, AccessibleName = "Logo N de NOTIFICA" };
        logo.Disposed += (_, _) => logo.Image?.Dispose();
        header.Controls.Add(logo, 0, 0);
        var title = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2 };
        var name = TextLabel("NOTIFICA IA", 17, true); name.ForeColor = Color.White;
        var subtitle = TextLabel("Firma digital · v" + typeof(Program).Assembly.GetName().Version!.ToString(3), 10);
        subtitle.ForeColor = Color.FromArgb(195, 209, 224);
        title.Controls.Add(name); title.Controls.Add(subtitle); header.Controls.Add(title, 1, 0);
        root.Controls.Add(header, 0, 0);

        var scroll = new Panel { Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(24, 18, 24, 12), Margin = Padding.Empty };
        var body = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 1 };
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        body.Controls.Add(TextLabel("ESTADO DE ESTE EQUIPO", 9, true));
        var status = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 1,
            BackColor = Color.White, Padding = new Padding(12), Margin = new Padding(0, 8, 0, 12) };
        status.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (var label in new[] { connection, token, session, guidance, contact }) status.Controls.Add(label);
        guidance.Margin = new Padding(0, 10, 0, 6); contact.ForeColor = Brand.Muted;
        body.Controls.Add(status);
        body.Controls.Add(TextLabel("¿QUÉ NECESITAS HACER?", 9, true));
        var actions = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 1, Margin = new Padding(0, 8, 0, 0) };
        actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        if (config.SigningEngine is not null || config.ControlledSigning is not null)
        {
            signing = ActionButton(config.SigningEngine is not null ? "Sesión de firma remota…" : "Revisar lote de prueba…",
                async () => { await signingAction(); await refreshAction(); }, true);
            signing.Name = "SigningAction";
            actions.Controls.Add(signing);
        }
        folder = ActionButton("Abrir firmados de la oficina", folderAction);
        folder.Name = "FolderAction"; actions.Controls.Add(folder);
        enroll = ActionButton("Inscribir este equipo…", async () => { enrollAction(); await refreshAction(); });
        enroll.Name = "EnrollAction"; actions.Controls.Add(enroll);
        body.Controls.Add(actions);
        scroll.Controls.Add(body); root.Controls.Add(scroll, 0, 1);

        var footer = new TableLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, ColumnCount = 1, Padding = new Padding(24, 10, 24, 18), Margin = Padding.Empty };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        footer.Controls.Add(TextLabel(config.SigningEngine is not null
            ? "Cerrar esta ventana o salir de la bandeja no detiene la firma remota.\nPara detenerla, entra en Sesión de firma remota y cierra la sesión."
            : "El agente sigue funcionando al cerrar esta ventana.\nHaz doble clic en la N de la bandeja para volver a abrirla.", 9));
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, Margin = new Padding(0, 10, 0, 0) };
        refresh = SmallButton("Actualizar estado", async () => {
            if (refreshing) return;
            refreshing = true; refresh!.Enabled = false;
            try { await refreshAction(); } finally { refreshing = false; if (!IsDisposed) refresh.Enabled = true; }
        });
        buttons.Controls.Add(refresh);
        buttons.Controls.Add(SmallButton("Ocultar ventana", () => { Close(); return Task.CompletedTask; }));
        buttons.Controls.Add(SmallButton("Salir de la bandeja", () => { exitAction(); return Task.CompletedTask; }));
        footer.Controls.Add(buttons); root.Controls.Add(footer, 0, 2);
        Controls.Add(root);
        UpdateStatus(null, initial: true);
    }

    internal void UpdateStatus(AgentStatus? value, bool initial = false)
    {
        if (IsDisposed) return;
        folder.Enabled = value?.OfficeFolderPath is not null;
        enroll.Enabled = value is { DeviceId: null };
        if (signing is not null) signing.Enabled = value is { DeviceId: not null, Role: not "RECEIVER" };
        if (value is null)
        {
            connection.Text = initial ? "Consultando el servicio…" : "Servicio de Windows sin conexión";
            connection.ForeColor = Brand.Muted;
            token.Text = "Token: sin información"; session.Text = "Firma remota: sin información";
            guidance.Text = initial ? "Espera un momento mientras consultamos el estado del equipo." : "No se pudo consultar el agente. Si el problema continúa, contacta al administrador para revisar el servicio de NOTIFICA.";
            contact.Text = "Actualización automática cada 3 segundos";
            return;
        }
        connection.Text = ConnectionText(value);
        connection.ForeColor = value.Connectivity == "ONLINE" ? Color.FromArgb(24, 112, 77) : Color.FromArgb(145, 85, 12);
        token.Text = HealthText(value);
        session.Text = value.RemoteSession is { Enabled: true } remote
            ? "Firma remota: habilitada" + (remote.ExpiresAt is { } expires ? " hasta " + expires.ToLocalTime().ToString("g") : "")
            : value.Role == "RECEIVER" ? "Este equipo recibe documentos; no necesita token ni PIN."
            : value.RemoteSession is not null ? "Firma remota: deshabilitada" : "Firma remota: no configurada";
        guidance.Text = value.Connectivity == "WAITING_ENROLLMENT" ? "Para comenzar, inscribe este equipo con el código de tu administrador."
            : value.MirrorError is not null ? "La carpeta de la oficina necesita atención. Revisa la conexión y el espacio disponible con el administrador."
            : value.Connectivity != "ONLINE" ? "Revisa la conexión a Internet. El agente volverá a conectarse automáticamente."
            : value.Health == "AGENT_ONLINE_TOKEN_MISSING" && value.Role != "RECEIVER" ? "Conecta el token USB para poder habilitar la firma."
            : value.Health == "CERT_EXPIRED" && value.Role != "RECEIVER" ? "Solicita la renovación del certificado antes de volver a firmar."
            : value.Health == "DRIVER_ERROR" && value.Role != "RECEIVER" ? "Pide al administrador que revise el controlador y el certificado del token."
            : value.RemoteSession is { Enabled: false } ? "Abre Sesión de firma remota para habilitar el token con tu PIN."
            : "La carpeta de la oficina muestra los últimos 50 días. Consulta el historial completo en Firmados de la web.";
        contact.Text = "Último contacto con el servidor: " + (value.LastSuccessfulContactAt?.ToLocalTime().ToString("g") ?? "todavía no registrado");
    }

    internal static string ConnectionText(AgentStatus value) => value.Connectivity switch {
        "ONLINE" => "Servicio conectado", "WAITING_ENROLLMENT" => "Equipo pendiente de inscripción", _ => "Servidor sin conexión" };
    internal static string HealthText(AgentStatus value) => value.Role == "RECEIVER" ? "Equipo receptor" : value.Health switch {
        "TOKEN_READY" => "Token disponible", "CERT_EXPIRING" => "Certificado próximo a vencer", "CERT_EXPIRED" => "Certificado vencido",
        "AGENT_ONLINE_TOKEN_MISSING" => "Token desconectado", "DRIVER_ERROR" => "Revisar controlador o certificado", _ => "Firma no disponible" };
    private static Label TextLabel(string text, float size = 10, bool bold = false) => new() {
        Text = text, AutoSize = true, Dock = DockStyle.Fill, Margin = new Padding(0, 2, 0, 2),
        Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular), ForeColor = Brand.Ink };
    private static Button ActionButton(string text, Func<Task> action, bool primary = false)
    {
        var button = new Button { Text = text, AccessibleName = text, Dock = DockStyle.Top, Height = 42,
            Margin = new Padding(0, 0, 0, 8), TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(12, 0, 0, 0),
            FlatStyle = FlatStyle.Flat, BackColor = primary ? Brand.Navy : Color.White, ForeColor = primary ? Color.White : Brand.Ink };
        button.FlatAppearance.BorderColor = Color.FromArgb(206, 214, 224);
        button.EnabledChanged += (_, _) => {
            button.BackColor = button.Enabled && primary ? Brand.Navy : Color.White;
            button.ForeColor = button.Enabled && primary ? Color.White : Brand.Ink;
        };
        bool busy = false;
        button.Click += async (_, _) => { if (busy) return; busy = true; try { await action(); } finally { busy = false; } };
        return button;
    }
    private static Button SmallButton(string text, Func<Task> action)
    {
        var button = ActionButton(text, action); button.Dock = DockStyle.None; button.AutoSize = true;
        button.Height = 36; button.Margin = new Padding(0, 0, 10, 0); button.TextAlign = ContentAlignment.MiddleCenter;
        button.Padding = new Padding(8, 0, 8, 0); return button;
    }
}
