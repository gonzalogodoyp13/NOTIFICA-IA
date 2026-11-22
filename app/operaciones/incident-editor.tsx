'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { incidentStatuses, statusLabels } from '@/lib/operations/policy'
import type { OperationsView } from '@/lib/operations/types'
export default function IncidentEditor({ incident }: { incident: NonNullable<OperationsView['incident']> }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form); setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/operaciones/incidentes/${incident.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: incident.revision, status: data.get('status'), severity: data.get('severity'), assignedToUserId: data.get('assignedToUserId') || null, note: data.get('note'), impact: data.get('impact'), suspectedCause: data.get('suspectedCause'), confirmedCause: data.get('confirmedCause'), nextSteps: data.get('nextSteps') }) })
      if (!response.ok) { setMessage(response.status === 409 ? 'El incidente cambió. Actualiza la página antes de guardar.' : response.status === 403 ? 'Tu sesión no autoriza esta acción. Verifica MFA nuevamente.' : 'No se pudo guardar. Revisa los datos; no incluyas credenciales.'); return }
      setMessage('Cambios guardados con registro de auditoría.'); (form.elements.namedItem('note') as HTMLTextAreaElement).value = ''; router.refresh()
    } catch { setMessage('Sin conexión. No se confirmó el guardado.') } finally { setBusy(false) }
  }
  return <section className="ops-panel"><h2>Seguimiento interno</h2><p className="ops-caption">Documenta evidencia y decisiones. No pegues documentos, contraseñas, tokens ni PINs.</p><form onSubmit={save} className="ops-editor" key={incident.revision}>
    <label>Estado<select aria-label="Estado" name="status" defaultValue={incident.status}>{incidentStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label><label>Severidad<select aria-label="Severidad" name="severity" defaultValue={incident.severity}><option value="warning">Advertencia</option><option value="error">Error</option><option value="critical">Crítica</option></select></label><label>Asignar a propietario (ID)<input name="assignedToUserId" defaultValue={incident.assignedToUserId ?? ''} maxLength={160} placeholder="Sin asignar" /></label>
    {([['impact', 'Impacto documentado'], ['confirmedCause', 'Causa confirmada y evidencia que la sustenta'], ['suspectedCause', 'Posibles causas (sin confirmar)'], ['nextSteps', 'Próximos pasos']] as const).map(([key, label]) => <label key={key}>{label}<textarea name={key} defaultValue={incident[key] ?? ''} maxLength={2000} rows={3} /></label>)}
    <label className="ops-wide">Nota / motivo del cambio (obligatorio)<textarea name="note" required minLength={3} maxLength={2000} rows={3} /></label><div className="ops-wide"><button disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar seguimiento'}</button><p role="status" aria-live="polite">{message}</p></div>
  </form></section>
}
