import { z } from 'zod'
import { chileDateString, parseChileReportDate } from '../reports/chileTime'
import { asJsonObject } from '../utils/json'

const identifier = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/)
const checksum = z.string().regex(/^[a-f0-9]{64}$/)
const date = z.string().refine(value => {
  try { parseChileReportDate(value); return true } catch { return false }
}, 'Fecha inválida')
export const CenterFilter = z.object({
  from: date.optional(), to: date.optional(),
  status: z.enum(['ALL', 'ELIGIBLE', 'ACTIVE', 'ATTENTION', 'COMPLETED', 'CANCELLED']).default('ALL'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
}).strict().refine(f => !f.from || !f.to || f.from <= f.to, 'El inicio debe ser anterior al término')
export const CenterSelection = z.object({ versionId: identifier, checksum }).strict()
export const CenterAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('queue'), sources: z.array(CenterSelection).min(1).max(500),
    signerFingerprint: checksum, requestedLevel: z.enum(['PADES_B', 'PADES_LT', 'PADES_LTA']) }).strict(),
  z.object({ action: z.literal('retry'), itemId: identifier, attemptCount: z.number().int().min(0),
    reviewed: z.literal(true) }).strict(),
  z.object({ action: z.literal('cancel'), itemId: identifier, attemptCount: z.number().int().min(0) }).strict(),
])
export type CenterActionInput = z.infer<typeof CenterAction>

/** Calendar dates stay calendar dates. Offset timestamps use the Chilean day.
 * Legacy midnight-UTC date-only values match the application's date input convention. */
export function executionDateKey(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const text = value instanceof Date ? value.toISOString() : value
  if (/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(text)) {
    try { return parseChileReportDate(text.slice(0, 10)).isoDate } catch { return null }
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return null
  try { parseChileReportDate(text.slice(0, 10)) } catch { return null }
  const instant = new Date(text)
  return Number.isNaN(instant.getTime()) ? null : chileDateString(instant)
}
export function signingBusinessDate(notificationMeta: unknown, diligenceMeta: unknown, fallback: Date | null) {
  const n = asJsonObject(notificationMeta), d = asJsonObject(diligenceMeta)
  for (const value of [asJsonObject(n?.ejecucion)?.fecha, n?.fechaEjecucion,
    asJsonObject(d?.ejecucion)?.fecha, d?.fechaEjecucion, fallback]) {
    const key = executionDateKey(value)
    if (key) return key
  }
  return null
}
export const signingMessages: Record<string, string> = {
  NETWORK: 'Sin conexión. El sistema volverá a intentar la transferencia.', STORAGE: 'El archivo no pudo transferirse. Revisa la conexión del equipo.',
  TSA_UNAVAILABLE: 'El servicio de fechado no está disponible.', REVOCATION_UNAVAILABLE: 'No se pudo comprobar la vigencia del certificado.',
  PIN_REQUIRED: 'Desbloquea el token en el equipo firmante.', PIN_INCORRECT: 'Revisa el PIN en el equipo firmante. No se volverá a intentar automáticamente.',
  TOKEN_MISSING: 'Conecta el token al equipo firmante.', DRIVER_MISSING: 'Revisa el controlador del token en el equipo firmante.',
  CERT_EXPIRED: 'El certificado venció. Revisa su renovación.', VALIDATION_FAILED: 'La firma o el documento no superó la validación.',
  CHECKSUM_MISMATCH: 'El archivo no coincide con la versión solicitada.', LEASE_EXPIRED: 'La asignación venció. Revisa el resultado en el equipo firmante.',
  OUTCOME_UNKNOWN: 'El resultado requiere revisión local antes de autorizar otra firma.', UNKNOWN: 'Revisa el equipo firmante y el documento antes de continuar.',
}
export type CenterRow = {
  id: string; documentId: string; name: string; rolId: string; rol: string; businessDate: string | null;
  versionId: string | null; checksum: string | null; status: string; exclusion: string | null;
  itemId: string | null; jobId: string | null; origin: 'MANUAL' | 'AUTOMATIC' | null;
  profile: string | null; requestedBy: string | null; attemptCount: number; maxAttempts: number;
  canRetry: boolean; canCancel: boolean; errorMessage: string | null; diagnosticCode?: string;
  delivery: string; signedAt: string | null; started: boolean;
}
export type CenterDevice = { id: string; name: string; role: string; health: string; certificateSubject: string | null;
  fingerprint: string | null; expiresAt: string | null; lastHeartbeatAt: string | null; revoked: boolean }
export type CenterData = { canManage: boolean; rows: CenterRow[]; total: number; page: number; pageSize: number;
  counts: { eligible: number; active: number; attention: number; completed: number; deliveryPending: number };
  devices: CenterDevice[]; validatorConfigured: boolean; updatedAt: string }
