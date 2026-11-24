namespace Notifica.Agent;

internal sealed class DesktopUpdateForm : Form
{
    private readonly Label message = new() { AutoSize = true, MaximumSize = new Size(510, 0), Margin = new Padding(0, 12, 0, 18) };
    private readonly Button action = new() { Text = "Actualizar", AutoSize = true, Height = 40 };
    private bool busy;
    internal DesktopUpdateForm(DesktopRelease? release = null, bool installer = false)
    {
        Text = "Actualización de NOTIFICA IA"; Icon = Brand.Icon; Width = 580; Height = 310;
        StartPosition = FormStartPosition.CenterScreen; FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false;
        var layout = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24), FlowDirection = FlowDirection.TopDown, WrapContents = false };
        layout.Controls.Add(new Label { Text = installer ? "Actualizando NOTIFICA IA" : "Actualización requerida para continuar", AutoSize = true, Font = new Font("Segoe UI", 14, FontStyle.Bold) });
        message.Text = installer ? "Preparando la actualización…" : $"La versión {release!.Version} está disponible. Actualiza para iniciar nuevas firmas. Tus documentos e inscripción se conservarán. Windows puede pedir permiso de administrador. Al terminar deberás habilitar la sesión de firma nuevamente.";
        layout.Controls.Add(message); layout.Controls.Add(action); Controls.Add(layout);
        FormClosing += (_, e) => { if (busy) e.Cancel = true; };
        if (installer) {
            action.Enabled = false;
            Shown += async (_, _) => {
                busy = true;
                try { await DesktopUpdate.Install(text => message.Text = text); }
                catch (Exception error) {
                    message.Text = error.Message == "REVIEW_ACTIVE_WORK"
                        ? "Hay una firma pendiente. Espera a que termine o resuelve el intento en NOTIFICA y vuelve a pulsar Actualizar. No se borró el trabajo."
                        : "No se pudo completar la actualización. Conserva la versión instalada y vuelve a intentarlo. Si persiste, contacta al administrador para revisar o recuperar la actualización.";
                }
                finally { busy = false; action.Text = "Cerrar"; action.Enabled = true; }
            };
            action.Click += (_, _) => Close();
        } else action.Click += (_, _) => {
            try { DesktopUpdate.Launch(); DialogResult = DialogResult.OK; Close(); }
            catch { message.Text = "No se inició la actualización. Acepta el permiso de Windows para continuar. Si este equipo todavía no tiene una instalación administrada, contacta al administrador."; }
        };
    }
}
