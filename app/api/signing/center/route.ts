import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiUser } from '@/lib/api/server'
import { createSigningCenter } from '@/lib/signing/center'
import { SigningError } from '@/lib/signing/core'
import { readDeviceBytes } from '@/lib/signing/deviceHttp'

export const dynamic = 'force-dynamic'
const service = createSigningCenter()
const messages: Record<string, string> = {
  FORBIDDEN: 'Solo un administrador de la oficina puede realizar esta acción.',
  NOT_FOUND: 'No se encontró la solicitud en tu oficina.',
  SOURCE_CHANGED: 'Cambió la selección o alguna versión ya no es elegible. Actualiza el listado.',
  USE_EXISTING_JOB: 'Algún documento ya tiene una solicitud. Revisa su estado en el listado.',
  SIGNER_UNAVAILABLE: 'Selecciona un certificado vigente de un equipo firmante de tu oficina.',
  ATTEMPTS_EXHAUSTED: 'Se alcanzó el límite de intentos. Revisa el documento y el equipo firmante.',
  SIGNING_ALREADY_STARTED: 'La firma ya comenzó o cambió la asignación. No se puede cancelar.',
  RECOVERY_REVIEW_REQUIRED: 'Revisa el último intento antes de autorizar una nueva firma.',
  INVALID_TRANSITION: 'El estado cambió. Actualiza el listado antes de continuar.',
}
function reply(data: unknown, status = 200) {
  return NextResponse.json(status < 400 ? { ok: true, data } : { ok: false, error: { message: data } },
    { status, headers: { 'Cache-Control': 'private, no-store' } })
}
function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return reply('Revisa las fechas y los datos de la solicitud.', 400)
  if (error instanceof SigningError) return reply(messages[error.code] ?? 'La solicitud no se puede procesar en su estado actual.', error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 409)
  return reply('No se pudo actualizar el centro de firmado. Intenta nuevamente.', 503)
}
export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.signing.center', async user => {
    try { return reply(await service.list({ officeId: user.officeId, userId: user.id }, Object.fromEntries(req.nextUrl.searchParams))) }
    catch (error) { return failure(error) }
  })
}
export async function POST(req: NextRequest) {
  return withApiUser(req, 'post.signing.center', async user => {
    // NextURL canonicalizes loopback hosts to localhost. Compare the browser's
    // actual Host (never X-Forwarded-Host) so 127.0.0.1 remains the same origin.
    const expected = new URL(req.url)
    expected.host = req.headers.get('host') ?? expected.host
    if (req.headers.get('origin') !== expected.origin) return reply('La solicitud debe provenir de esta aplicación.', 403)
    if (req.headers.get('content-type')?.split(';')[0] !== 'application/json') return reply('Formato de solicitud inválido.', 415)
    try {
      const raw = JSON.parse((await readDeviceBytes(req, 128 * 1024)).toString('utf8'))
      return reply(await service.mutate({ officeId: user.officeId, userId: user.id }, raw))
    } catch (error) { return failure(error) }
  })
}
