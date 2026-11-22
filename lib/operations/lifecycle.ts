/** Pure evidence rules. These are alerts, never recovery commands. */
export function expiredLease(status: string, lease: Date | null, now = new Date()) {
  return ['RUNNING', 'CANCEL_REQUESTED', 'CLAIMED', 'SIGNING'].includes(status) && (!lease || lease <= now)
}
export function missedRun(enabled: boolean, next: Date | null, graceMinutes: number, now = new Date()) {
  return enabled && !!next && now.getTime() > next.getTime() + Math.max(0, graceMinutes) * 60000
}
export function observationState(status: string, checked: Date | null, ttlSeconds: number, now = new Date()) {
  if (!checked || checked > now || now.getTime() - checked.getTime() > ttlSeconds * 1000) return 'Desconocido · evidencia ausente o vencida'
  return ({ healthy: 'Saludable', degraded: 'Degradado', critical: 'Crítico', running: 'En ejecución', unknown: 'Desconocido' } as Record<string, string>)[status] ?? 'Desconocido'
}
export function elapsed(start: Date | null, end: Date | null, now = new Date()) {
  return start ? `${Math.max(0, Math.floor(((end ?? now).getTime() - start.getTime()) / 60000))} min${end ? '' : ' · abierto'}` : 'Sin registro'
}
export async function deadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('OBSERVATION_TIMEOUT')), ms) })]) }
  finally { if (timer) clearTimeout(timer) }
}
