export const recoveryActions = ['diagnostics','reconcile','signing.retry','signing.cancel','report.retry','report.cancel','device.revoke'] as const
export type RecoveryAction = typeof recoveryActions[number]
export type RecoveryTarget = 'device' | 'signing' | 'report' | 'receipt' | 'email'
export function recentMfa(claims: Record<string, unknown>, now = Date.now()) {
  return claims.aal === 'aal2' && Array.isArray(claims.amr) && claims.amr.some((a: unknown) => {
    if (!a || typeof a !== 'object') return false
    const { method, timestamp } = a as {method?:unknown;timestamp?:unknown}
    return ['totp','mfa/totp'].includes(String(method)) && typeof timestamp === 'number' && timestamp * 1000 <= now && now - timestamp * 1000 <= 600000
  })
}
export const recoveryLabels: Record<RecoveryAction,string> = { diagnostics:'Capturar próximo heartbeat', reconcile:'Conciliar evidencia (solo lectura)', 'signing.retry':'Reencolar firma', 'signing.cancel':'Cancelar firma en cola', 'report.retry':'Reintentar generación', 'report.cancel':'Cancelar reporte en cola', 'device.revoke':'Revocar equipo' }
// TokenRemoved, DriverFailure and agent upgrade rejection can happen after signing.
// Only explicit pre-signing authentication/driver-absence failures are eligible.
export const safeSigningRetryCodes = ['PIN_REQUIRED','PIN_INCORRECT','PIN_EXPIRED','DRIVER_MISSING']
export function recoveryDecision(action: RecoveryAction, s: { kind: RecoveryTarget; status: string; attempts?:number; maxAttempts?:number; code?:string|null; signature?:boolean; artifact?:boolean; ready?:boolean; reportExists?:boolean; unsafePayload?:boolean; child?:boolean; revoked?:boolean }) {
  if (action === 'reconcile') return { eligible:true, impact:'Consultar evidencia conservada. No declara resuelto el incidente ni autoriza reintentos inciertos.' }
  if (action === 'diagnostics') return { eligible:s.kind === 'device' && !s.revoked, impact:'Esperar la próxima observación autenticada del agente; no ejecuta comandos, sondeos físicos ni firmas.' }
  if (action === 'device.revoke') return { eligible:s.kind === 'device' && !s.revoked, impact:'Interrumpir acceso del equipo y eliminar sus sesiones. No cancela trabajos ni elimina firmas existentes. Una firma local ya iniciada puede terminar: concilia resultados pendientes antes de reintentar.' }
  if (action === 'signing.retry') return { eligible:s.kind === 'signing' && ['FAILED','WAITING_FOR_OPERATOR'].includes(s.status) && (s.attempts ?? 0)<(s.maxAttempts ?? 0) && safeSigningRetryCodes.includes(s.code ?? '') && !s.signature && !s.artifact && !!s.ready, impact:'Reencolar el elemento: el agente podrá producir una firma real. Requiere ausencia de resultados pendientes y equipo listo.' }
  if (action === 'signing.cancel') return { eligible:s.kind === 'signing' && s.status === 'QUEUED' && s.attempts === 0 && !s.signature && !s.artifact, impact:'Cancelar únicamente trabajo nunca iniciado; no elimina documentos ni firmas.' }
  if (action === 'report.cancel') return { eligible:s.kind === 'report' && s.status === 'QUEUED' && s.attempts === 0, impact:'Cancelar el trabajo antes de su primer claim; una carrera con el worker rechazará la acción.' }
  return { eligible:s.kind === 'report' && s.status === 'FAILED' && !s.unsafePayload && !s.reportExists && !s.child, impact:'Encolar generación sin force ni entrega automática; el scheduler existente deberá procesarla.' }
}
