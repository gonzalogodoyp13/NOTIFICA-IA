import { after, NextRequest, NextResponse } from 'next/server'
import { ipAddress } from '@vercel/functions'
import { z } from 'zod'
import { allowPasswordRecovery, passwordRecoverySender } from '@/lib/auth/passwordRecovery'
import { boundRequestBody, requireSameOrigin, RequestSecurityError } from '@/lib/security/request'
import { withRequestTiming } from '@/lib/api/requestTiming'

export const runtime = 'nodejs'
export const maxDuration = 60
const inputSchema = z.object({ email: z.string().trim().max(254).email().transform(value => value.toLowerCase()) }).strict()
const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(request: NextRequest) {
  return withRequestTiming(request,'auth.password-recovery',async()=>{
  try {
    requireSameOrigin(request)
    await boundRequestBody(request)
    const parsed = inputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Ingresa un correo electrónico válido.' }, { status: 400, headers })
    const send = passwordRecoverySender()
    const allowed = await allowPasswordRecovery(parsed.data.email, ipAddress(request) || 'unknown')
    if (allowed) {
      // Respond before account lookup/delivery to avoid exposing account existence
      // through different response bodies or provider-dependent response times.
      after(async () => {
        try { await send(parsed.data.email) }
        catch { console.error('PASSWORD_RECOVERY_DELIVERY_FAILED') }
      })
    }
    return NextResponse.json({ message: 'Si el correo corresponde a una cuenta activa, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.' }, { status: 202, headers })
  } catch (error) {
    if (error instanceof RequestSecurityError) {
      const message = error.status === 429 ? 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' : 'No se pudo procesar la solicitud.'
      return NextResponse.json({ error: message }, { status: error.status, headers: { ...headers, ...(error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}) } })
    }
    console.error('PASSWORD_RECOVERY_UNAVAILABLE')
    return NextResponse.json({ error: 'No pudimos procesar la solicitud. Intenta nuevamente en unos minutos.' }, { status: 503, headers })
  }
  })
}
