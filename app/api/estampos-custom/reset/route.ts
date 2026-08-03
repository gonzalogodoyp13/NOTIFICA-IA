import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { recordSettingsEvent } from '@/lib/audit/businessEvents'
import { bumpOfficeCacheRevision } from '@/lib/cache/officeCacheRevision'
import { invalidateOfficeCaches } from '@/lib/cache/officeCache'

export const dynamic = 'force-dynamic'

// Schema for POST /api/estampos-custom/reset
const ResetCustomSchema = z.object({
  baseId: z.number().int().positive(),
  // NOTE: officeId is NEVER accepted from client - always from session
})

export async function POST(req: NextRequest) {
  return withApiUser(req, 'post.estampos-custom.reset', async user => {
  try {

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
    const cacheRevision = await prisma.$transaction(async tx => {
      await tx.estampoCustom.update({ where: { id: estampoCustom.id }, data: { isActive: false } })
      await recordSettingsEvent(tx, user, { resource: 'EstampoCustom', action: 'reset', recordId: estampoCustom.id, changedFields: ['isActive'] })
      return bumpOfficeCacheRevision(tx, user.officeId)
    })
    invalidateOfficeCaches(user.officeId)

    return NextResponse.json({
      ok: true,
      cacheRevision,
      message: 'Versión personalizada restablecida a versión oficial',
    })
  } catch (error) {
    console.error('Error en POST /api/estampos-custom/reset:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al restablecer el estampo' },
      { status: 500 }
    )
  }

  })
}

