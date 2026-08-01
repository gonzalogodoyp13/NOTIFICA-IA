import { createHash } from 'crypto'

import type { ReciboGenerateInput } from '@/lib/validations/rol-workspace'

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)])
    )
  }
  return value
}

function sha256(value: unknown) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
}

export function receiptRequestHash(input: ReciboGenerateInput) {
  return sha256(input)
}

export function receiptGenerationFingerprint(input: Pick<
  ReciboGenerateInput,
  'notificacionId' | 'bancoId' | 'ejecucion' | 'estampoTipo' | 'monto' | 'medio' | 'referencia' | 'otros'
>) {
  return sha256({
    notificacionId: input.notificacionId,
    bancoId: input.bancoId,
    ejecucion: { fecha: input.ejecucion.fecha, hora: input.ejecucion.hora ?? '' },
    estampoTipo: input.estampoTipo,
    monto: input.monto,
    medio: input.medio.trim(),
    referencia: input.referencia?.trim() || null,
    otros: input.otros ?? 0,
    receiptTemplateVersion: 1,
  })
}

export function buildExecutionMetadata(input: ReciboGenerateInput) {
  const hora = input.ejecucion.hora ?? ''
  return {
    ejecucion: { fecha: input.ejecucion.fecha, hora },
    fechaEjecucion: new Date(`${input.ejecucion.fecha}T12:00:00.000Z`).toISOString(),
    horaEjecucion: hora,
    estampoTipo: input.estampoTipo,
    estampoId: input.estampoTipo.kind === 'CUSTOM' ? input.estampoTipo.estampoId : null,
    monto: input.monto,
  }
}

export function isValidIdempotencyKey(value: string | null | undefined) {
  return !!value && /^[A-Za-z0-9._:-]{8,128}$/.test(value)
}
