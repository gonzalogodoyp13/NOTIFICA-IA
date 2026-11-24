import { NextRequest, NextResponse } from 'next/server'
import { getAbogadoAccount } from '@/lib/auth/abogadoAccount'
import { guardarEncargoSchema } from '@/lib/encargos/schema'
import { buscarReceptores, guardarEncargo } from '@/lib/encargos/server'
import { cortesDeApelaciones } from '@/lib/encargos/tribunales'
import { consumeFixedWindowQuota } from '@/lib/security/rateLimit'
import { boundRequestBody, requireSameOrigin, RequestSecurityError } from '@/lib/security/request'

function respuesta(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function GET(request: NextRequest) {
  try {
    if (!await getAbogadoAccount()) return respuesta({ error: 'Inicia sesión como abogado.' }, 401)
    const corte = request.nextUrl.searchParams.get('corte')
    if (!corte || !cortesDeApelaciones.includes(corte)) return respuesta({ error: 'Selecciona una corte válida.' }, 400)
    return respuesta({ receptores: await buscarReceptores(corte) })
  } catch {
    return respuesta({ error: 'No pudimos consultar los receptores. Vuelve a intentarlo.' }, 503)
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request)
    const account = await getAbogadoAccount()
    if (!account) return respuesta({ error: 'Inicia sesión como abogado.' }, 401)
    await boundRequestBody(request, 512 * 1024)
    const parsed = guardarEncargoSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return respuesta({ error: parsed.error.issues[0]?.message || 'Revisa los datos del encargo.' }, 400)
    if (!await consumeFixedWindowQuota(`abogado:encargo:${account.authUserId}`, 60, 30)) {
      return respuesta({ error: 'Espera un minuto antes de volver a guardar.' }, 429)
    }
    const estado = await guardarEncargo(account.authUserId, parsed.data)
    if (estado === 'cuenta-desactivada') return respuesta({ error: 'Tu cuenta ya está desactivada.' }, 403)
    if (estado === 'no-encontrado') return respuesta({ error: 'El encargo no está disponible.' }, 404)
    if (estado === 'ya-enviado') return respuesta({ error: 'El encargo ya fue enviado.' }, 409)
    if (estado === 'receptor-no-disponible') return respuesta({ error: 'Un receptor seleccionado ya no está disponible para esta corte. Revisa la selección.' }, 409)
    return respuesta({ estado, id: parsed.data.id })
  } catch (error) {
    if (error instanceof RequestSecurityError) return respuesta({ error: 'No pudimos procesar la solicitud.' }, error.status)
    console.error('ABOGADO_ENCARGO_SAVE_FAILED')
    return respuesta({ error: 'No pudimos guardar el encargo. Vuelve a intentarlo.' }, 503)
  }
}
