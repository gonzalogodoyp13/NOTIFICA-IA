import { NextRequest, NextResponse } from 'next/server'
import { getAbogadoAccount } from '@/lib/auth/abogadoAccount'
import { ajusteAbogadoSchema } from '@/lib/encargos/ajustes'
import { prisma } from '@/lib/prisma'
import { consumeFixedWindowQuota } from '@/lib/security/rateLimit'
import { boundRequestBody, requireSameOrigin, RequestSecurityError } from '@/lib/security/request'
import { createServerSupabaseClient } from '@/lib/supabaseServer'

function respuesta(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request)
    const account = await getAbogadoAccount()
    if (!account) return respuesta({ error: 'Inicia sesión con una cuenta de abogado activa.' }, 401)
    await boundRequestBody(request, 16 * 1024)
    const parsed = ajusteAbogadoSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return respuesta({ error: 'Revisa los datos antes de continuar.' }, 400)
    if (!await consumeFixedWindowQuota(`abogado:ajustes:${account.authUserId}`, 60, 30)) {
      return respuesta({ error: 'Espera un minuto antes de volver a intentarlo.' }, 429)
    }

    const ajuste = parsed.data
    const cambios = ajuste.accion === 'contacto' ? { datosContacto: ajuste.datos }
      : ajuste.accion === 'boleta' ? { datosBoleta: ajuste.datos }
        : { desactivadoAt: new Date(), motivoBaja: ajuste.motivo || null }
    const resultado = await prisma.abogadoAccount.updateMany({
      where: { authUserId: account.authUserId, desactivadoAt: null }, data: cambios,
    })
    if (!resultado.count) return respuesta({ error: 'Tu cuenta ya está desactivada.' }, 403)

    if (ajuste.accion === 'baja') {
      // La baja se aplica aun si el proveedor tarda en revocar las sesiones.
      try {
        const supabase = await createServerSupabaseClient()
        const { error } = await supabase.auth.signOut({ scope: 'global' })
        if (error) console.error('ABOGADO_DEACTIVATION_SIGN_OUT_FAILED')
      } catch {
        console.error('ABOGADO_DEACTIVATION_SIGN_OUT_FAILED')
      }
    }
    return respuesta({ ok: true })
  } catch (error) {
    if (error instanceof RequestSecurityError) return respuesta({ error: 'No pudimos procesar la solicitud.' }, error.status)
    console.error('ABOGADO_SETTINGS_SAVE_FAILED')
    return respuesta({ error: 'No pudimos guardar el cambio. Intenta nuevamente.' }, 503)
  }
}
