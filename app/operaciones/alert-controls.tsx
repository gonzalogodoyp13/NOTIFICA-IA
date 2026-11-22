'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OperationsView } from '@/lib/operations/types'
export default function AlertControls({ view }: { view: OperationsView }) {
  const router = useRouter(), config = view.configuration!
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  async function submit(data: unknown) {
    setBusy(true); setMessage('Guardando…')
    try { const response = await fetch('/api/operaciones/alertas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); if (!response.ok) { setMessage(response.status === 409 ? 'La información cambió. Actualiza antes de guardar.' : 'No se guardó. Revisa datos, permisos y destinatarios.'); return } setMessage('Cambios guardados.'); router.refresh() }
    catch { setMessage('No se confirmó el guardado. Actualiza antes de repetir.') } finally { setBusy(false) }
  }
  return <>
    <section className="ops-panel"><h2>Política {config.officeId ? `de oficina ${config.officeId}` : 'global'}</h2><p>La política global se usa cuando una oficina no tiene configuración propia. Inicio y fin iguales significan 24 horas en los días seleccionados. Guardar no activa el envío real si está deshabilitado en el servidor.</p>
      <form className="ops-editor" key={`${config.officeId}-${config.revision}`} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void submit({ action: 'policy', officeId: config.officeId, revision: config.revision, settings: { enabled: form.has('enabled'), recipients: form.getAll('recipients'), timezone: form.get('timezone'), weekdays: form.getAll('weekdays').map(Number), start: form.get('start'), end: form.get('end'), digestTime: form.get('digestTime'), persistenceMinutes: Number(form.get('persistenceMinutes')), cooldownMinutes: Number(form.get('cooldownMinutes')), escalationMinutes: Number(form.get('escalationMinutes')) } }) }}>
        <label><span><input type="checkbox" name="enabled" defaultChecked={config.settings.enabled} /> Autorizar comunicaciones a los propietarios seleccionados</span></label>
        <label>Zona horaria IANA<input name="timezone" required defaultValue={config.settings.timezone} maxLength={80} /></label>
        <fieldset className="ops-wide"><legend>Destinatarios autorizados</legend>{config.owners.length ? config.owners.map(owner => <label key={owner.id}><span><input type="checkbox" name="recipients" value={owner.id} defaultChecked={config.settings.recipients.includes(owner.id)} /> {owner.email}</span></label>) : <p>No hay propietarios activos disponibles.</p>}</fieldset>
        <fieldset className="ops-wide"><legend>Días de operación</legend>{['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].map((day, index) => <label key={day}><span><input type="checkbox" name="weekdays" value={index} defaultChecked={config.settings.weekdays.includes(index)} /> {day}</span></label>)}</fieldset>
        <label>Inicio de jornada<input name="start" type="time" required defaultValue={config.settings.start} /></label><label>Fin de jornada<input name="end" type="time" required defaultValue={config.settings.end} /></label>
        <label>Hora del resumen diario<input name="digestTime" type="time" required defaultValue={config.settings.digestTime} /></label>
        <label>Persistencia mínima (minutos)<input name="persistenceMinutes" type="number" min={1} max={1440} required defaultValue={config.settings.persistenceMinutes} /></label>
        <label>Intervalo mínimo entre avisos (minutos)<input name="cooldownMinutes" type="number" min={15} max={1440} required defaultValue={config.settings.cooldownMinutes} /></label>
        <label>Escalar con impacto pendiente tras (minutos)<input name="escalationMinutes" type="number" min={15} max={10080} required defaultValue={config.settings.escalationMinutes} /></label>
        <button disabled={busy}>Guardar política</button>
      </form>
    </section>
    <section className="ops-panel"><h2>Programar mantenimiento</h2><p>Suprime avisos durante la ventana; la evidencia continúa registrándose. Máximo siete días.</p><form className="ops-editor" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void submit({ action: 'maintenance', officeId: config.officeId, startsAt: new Date(`${form.get('startsAt')}Z`).toISOString(), endsAt: new Date(`${form.get('endsAt')}Z`).toISOString(), reason: form.get('reason') }) }}><label>Inicio UTC<input type="datetime-local" name="startsAt" required /></label><label>Fin UTC<input type="datetime-local" name="endsAt" required /></label><label className="ops-wide">Motivo (sin datos sensibles)<input name="reason" minLength={5} maxLength={300} required /></label><button disabled={busy}>Programar ventana</button></form></section>
    {!!view.alertActions?.length && <section className="ops-panel"><h2>Seguimiento de alertas</h2>{view.alertActions.map(alert => <form className="ops-filters" key={alert.key} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void submit({ action: alert.status === 'OPEN' ? 'acknowledge' : 'verify-recovery', id: alert.key, revision: alert.revision, reason: form.get('reason') }) }}><label>Motivo para {alert.key}<input name="reason" required minLength={5} maxLength={300} /></label><button disabled={busy}>{alert.status === 'OPEN' ? 'Reconocer alerta' : 'Confirmar recuperación verificada'}</button></form>)}</section>}
    {!!view.maintenanceActions?.length && <section className="ops-panel"><h2>Finalizar mantenimiento anticipadamente</h2>{view.maintenanceActions.map(window => <form className="ops-filters" key={window.id} onSubmit={event => { event.preventDefault(); void submit({ action: 'cancel-maintenance', id: window.id, reason: new FormData(event.currentTarget).get('reason') }) }}><label>Motivo para {window.id}<input name="reason" required minLength={5} maxLength={300} /></label><button disabled={busy}>Cancelar ventana</button></form>)}</section>}
    <p role="status" aria-live="polite">{message}</p>
  </>
}
