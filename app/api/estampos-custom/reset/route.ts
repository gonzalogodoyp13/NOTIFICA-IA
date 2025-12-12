import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Schema for POST /api/estampos-custom/reset
const ResetCustomSchema = z.object({
  baseId: z.number().int().positive(),
  // NOTE: officeId is NEVER accepted from client - always from session
})

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = ResetCustomSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Datos inválidos', details: parsed.error.format() },
        { status: 400 }
      )
    }

    const { baseId } = parsed.data

    // Find EstampoCustom by baseId and officeId
    // Security: Always use officeId from session
    const estampoCustom = await prisma.estampoCustom.findFirst({
      where: {
        baseId,
        officeId: user.officeId,
      },
    })

    if (!estampoCustom) {
      return NextResponse.json(
        { ok: false, error: 'No existe una versión personalizada para este estampo' },
        { status: 404 }
      )
    }

    // Delete custom (soft delete by setting isActive: false)
    await prisma.estampoCustom.update({
      where: {
        id: estampoCustom.id,
      },
      data: {
        isActive: false,
      },
    })

    return NextResponse.json({
      ok: true,
      message: 'Versión personalizada restablecida a versión oficial',
    })
  } catch (error) {
    console.error('Error en POST /api/estampos-custom/reset:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al restablecer el estampo' },
      { status: 500 }
    )
  }
}

