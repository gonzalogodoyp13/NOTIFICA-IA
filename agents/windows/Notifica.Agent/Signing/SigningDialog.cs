using System.Drawing;
using System.Security.Cryptography;
using System.Text.Json;

namespace Notifica.Agent.Signing;

// This is deliberately not a TextBox: Windows/WinForms never receive a Text
// property containing the PIN. Only mask characters enter the display tree.
internal sealed class SecurePinEntry : Control
{
    private readonly byte[] bytes = GC.AllocateUninitializedArray<byte>(PinBuffer.MaximumBytes, pinned: true);
    private int length;
    private bool invalidInput;
    internal event Action? Changed;
    internal bool HasValue => length > 0 && !invalidInput;
    internal SecurePinEntry()
    {
        CryptographicOperations.ZeroMemory(bytes);
        SetStyle(ControlStyles.Selectable | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
        TabStop = true;
        ImeMode = ImeMode.Disable;
        AccessibleName = "PIN del token, entrada protegida";
        AccessibleRole = AccessibleRole.Text;
        BackColor = SystemColors.Window;
        Cursor = Cursors.IBeam;
    }
    protected override void OnMouseDown(MouseEventArgs e) { Focus(); base.OnMouseDown(e); }
    protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
    protected override void OnLostFocus(EventArgs e) { base.OnLostFocus(e); Invalidate(); }
    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Delete) { Clear(); e.SuppressKeyPress = true; return; }
        if (e.Control || e.Alt) { e.SuppressKeyPress = true; return; }
        base.OnKeyDown(e);
    }
    protected override void OnKeyPress(KeyPressEventArgs e)
    {
        e.Handled = true;
        if (e.KeyChar == '\b') { if (length > 0) bytes[--length] = 0; }
        else if (e.KeyChar is >= ' ' and <= '~' && length < bytes.Length) bytes[length++] = (byte)e.KeyChar;
        else invalidInput = true;
        Invalidate(); Changed?.Invoke();
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.Clear(BackColor);
        ControlPaint.DrawBorder(e.Graphics, ClientRectangle, Focused ? SystemColors.Highlight : SystemColors.ControlDark, ButtonBorderStyle.Solid);
        TextRenderer.DrawText(e.Graphics, invalidInput ? "Entrada no admitida. Pulsa Supr y vuelve a escribir." : new string('●', length), Font, new Rectangle(7, 5, Width - 14, Height - 10),
            SystemColors.WindowText, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix);
    }
    internal PinBuffer Take()
    {
        try { if (invalidInput) throw new SigningFailure(SigningError.PinFormat); return new PinBuffer(bytes.AsSpan(0, length)); }
        finally { Clear(); }
    }
    internal void Clear() { CryptographicOperations.ZeroMemory(bytes); length = 0; invalidInput = false; Invalidate(); Changed?.Invoke(); }
    protected override void Dispose(bool disposing) { CryptographicOperations.ZeroMemory(bytes); length = 0; base.Dispose(disposing); }
}

internal sealed class SigningDialog : Form
{
    private readonly Configuration config;
    private ControlledBatchView view;
    private readonly SecurePinEntry pin = new() { Dock = DockStyle.Fill, Height = 38 };
    private readonly CheckBox consent = new() { Text = "Autorizo la firma de este lote con mi certificado", AutoSize = true };
    private readonly Button approve = new() { Text = "Autorizar y firmar", AutoSize = true };
    private readonly Label status = new() { AutoSize = true, MaximumSize = new Size(650, 0) };
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 1000 };
    private readonly CancellationTokenSource closed = new();
    private bool pending;
    private bool polling;
    private int submissionVersion;
    private bool resourcesDisposed;
    private long approvalDeadline;
    internal SigningDialog(Configuration config, ControlledBatchView view)
    {
        this.config = config; this.view = view;
        approvalDeadline = Environment.TickCount64 + Math.Clamp(view.RemainingApprovalMilliseconds, 0, 300_000);
        Text = "Autorizar lote de prueba · NOTIFICA IA";
        Width = 740; Height = 640; MinimumSize = new Size(680, 560);
        StartPosition = FormStartPosition.CenterScreen;
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24), ColumnCount = 1, RowCount = 8 };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        for (int i = 3; i < 8; i++) layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.Controls.Add(new Label { Text = "LOTE CONTROLADO DE PRUEBA", AutoSize = true, Font = new Font("Segoe UI", 12, FontStyle.Bold) }, 0, 0);
        layout.Controls.Add(new Label { AutoSize = true, MaximumSize = new Size(650, 0), Padding = new Padding(0, 12, 0, 12),
            Text = $"Solicitante: {view.Batch.Requester}\nOficina: {view.Batch.OfficeName} (ID {view.Batch.OfficeId})\nFirmante: {view.Batch.SignerName}\nCertificado SHA-256: {view.Batch.SignerFingerprint}\nPerfil: {view.Batch.Profile} · Documentos: {view.Batch.Documents.Length}" }, 0, 1);
        var documents = new ListBox { Dock = DockStyle.Fill, HorizontalScrollbar = true, IntegralHeight = false };
        foreach (var document in view.Batch.Documents) documents.Items.Add(document.Id + " · " + Path.GetFileName(document.SourcePath));
        layout.Controls.Add(documents, 0, 2);
        layout.Controls.Add(new Label { AutoSize = true, Padding = new Padding(0, 12, 0, 4),
            Text = "PIN local del token (caracteres ASCII, sin pegar). Una sesión, máximo 5 minutos." }, 0, 3);
        layout.Controls.Add(pin, 0, 4);
        layout.Controls.Add(consent, 0, 5);
        layout.Controls.Add(approve, 0, 6);
        layout.Controls.Add(status, 0, 7);
        Controls.Add(layout);
        consent.CheckedChanged += (_, _) => UpdateState(); pin.Changed += UpdateState;
        approve.Click += async (_, _) => await Submit();
        timer.Tick += async (_, _) => await Poll();
        timer.Start(); UpdateState();
    }
    private void UpdateState()
    {
        bool awaiting = view.State == "AWAITING_APPROVAL" && Environment.TickCount64 < approvalDeadline;
        approve.Enabled = !pending && awaiting && consent.Checked && pin.HasValue;
        pin.Enabled = !pending && awaiting; consent.Enabled = !pending && awaiting;
        status.Text = view.State switch {
            "AWAITING_APPROVAL" => awaiting ? "Revisa los identificadores antes de autorizar. El PIN se borra al enviarse." : "La autorización ha vencido. Cierra esta ventana.",
            "EXPIRED" => "La autorización ha vencido. Cierra esta ventana.",
            "RECEIVING_PIN" => "Recibiendo autorización local…",
            "SIGNING" => "Firmando y validando los documentos…",
            "COMPLETED" => $"Firma y validación completas: {view.Results.Count} documentos.\nCarpeta: {config.ControlledSigning!.Engine.OutputDirectory}",
            _ => $"El lote se detuvo: {SafeError(view.Error)}. No se repetirá el PIN automáticamente."
        };
    }
    private static string SafeError(string? value) => Enum.TryParse<SigningError>(value, out var error) && Enum.IsDefined(error) ? error.ToString() : "EngineFailure";
    private async Task Submit()
    {
        UpdateState();
        if (!approve.Enabled) return;
        pending = true; submissionVersion++; UpdateState();
        try
        {
            using var buffer = pin.Take();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(closed.Token);
            timeout.CancelAfter(TimeSpan.FromSeconds(15));
            await LocalPipe.Approve(config, view, buffer, timeout.Token);
            view = view with { State = "SIGNING" };
        }
        catch { view = view with { State = "FAILED", Error = SigningError.ApprovalMismatch.ToString() }; }
        finally { pin.Clear(); pending = false; if (!IsDisposed) UpdateState(); }
    }
    private async Task Poll()
    {
        if (pending || polling || IsDisposed) return;
        // Reading public status must not disable the input or steal its focus.
        // Only submission owns the pending state that locks the controls.
        polling = true;
        int observedVersion = submissionVersion;
        try
        {
            if (Environment.TickCount64 >= approvalDeadline) pin.Clear();
            UpdateState();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(closed.Token);
            timeout.CancelAfter(TimeSpan.FromSeconds(4));
            long requestStarted = Environment.TickCount64;
            var answer = await LocalPipe.Request(config, new { action = "controlled-batch" }, timeout.Token);
            if (IsDisposed || observedVersion != submissionVersion) return;
            var current = answer.GetProperty("batch").Deserialize<ControlledBatchView>(Configuration.Json)!;
            if (current.ApprovalId != view.ApprovalId || current.Digest != view.Digest) throw new SigningFailure(SigningError.ApprovalMismatch);
            view = current;
            // Polling or reopening a dialog must not grant a fresh approval lifetime.
            approvalDeadline = Math.Min(approvalDeadline,
                requestStarted + Math.Clamp(current.RemainingApprovalMilliseconds, 0, 300_000));
            if (current.State != "AWAITING_APPROVAL" || Environment.TickCount64 >= approvalDeadline) pin.Clear();
        }
        catch
        {
            if (!IsDisposed && observedVersion == submissionVersion)
            { view = view with { State = "FAILED", Error = SigningError.EngineFailure.ToString() }; pin.Clear(); }
        }
        finally { polling = false; if (!IsDisposed) UpdateState(); }
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing && !resourcesDisposed)
        {
            resourcesDisposed = true;
            timer.Stop(); timer.Dispose(); closed.Cancel(); pin.Clear(); closed.Dispose();
        }
        base.Dispose(disposing);
    }
}
