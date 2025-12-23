// API route: /api/procuradores/[id]/toggle-activo
// PATCH: Toggle or set activo (global) for a procurador
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ToggleActivoSchema } from '@/lib/zodSchemas'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json(
        { ok: false, message: 'ID inválido', error: 'ID inválido' },
        { status: 400 }
      )
    }

    // Verify procurador exists and belongs to office
    const procurador = await prisma.procurador.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
      select: {
        activo: true,
      },
    })

    if (!procurador) {
      return NextResponse.json(
        { ok: false, message: 'Procurador no encontrado o no pertenece a tu oficina', error: 'Procurador no encontrado' },
        { status: 404 }
      )
    }

    // Parse body (optional)
    let body: { activo?: boolean } = {}
    try {
      body = await req.json()
    } catch {
      // Body is optional, continue with toggle
    }

    const parsed = ToggleActivoSchema.safeParse(body)

    // Determine new activo value: if body has activo, use it; otherwise toggle
    const nuevoActivo = parsed.success && parsed.data.activo !== undefined
      ? parsed.data.activo
      : !procurador.activo

    // Update
    await prisma.procurador.update({
      where: { id },
      data: { activo: nuevoActivo },
    })

    return NextResponse.json({
      ok: true,
      data: {
        activo: nuevoActivo,
      },
    })
  } catch (error) {
    console.error('Error toggling activo:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al cambiar estado activo'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

