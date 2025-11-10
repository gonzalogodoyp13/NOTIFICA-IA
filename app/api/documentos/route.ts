// API route: /api/documentos
// GET/POST/PUT/DELETE: CRUD operations for Documento (ROL Phase 4)
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { zDocumento, zDocumentoUpdate } from '@/lib/validations/documento'
import { logAudit } from '@/lib/audit'
import { ZodError } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const searchParams = req.nextUrl.searchParams
    const rolId = searchParams.get('rolId')

    if (!rolId) {
      return NextResponse.json(
        { ok: false, error: 'rolId es requerido' },
        { status: 400 }
      )
    }

    const officeIdStr = String(user.officeId)

    // Verify rol belongs to user's office
    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: rolId,
        officeId: officeIdStr,
      },
    })

    if (!rol) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Fetch documentos for this rol
    const documentos = await prisma.documento.findMany({
      where: {
        rolId,
      },
      include: {
        estampo: true,
        diligencia: {
          select: {
            id: true,
            tipo: {
              select: {
                nombre: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ ok: true, data: documentos })
  } catch (error) {
    console.error('Error fetching documentos:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener los documentos' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const parsed = zDocumento.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
        { status: 400 }
      )
    }

    const officeIdStr = String(user.officeId)

    // Verify rol belongs to user's office
    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: parsed.data.rolId,
        officeId: officeIdStr,
      },
    })

    if (!rol) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Verify diligencia belongs to the same rol if provided
    if (parsed.data.diligenciaId) {
      const diligencia = await prisma.diligencia.findFirst({
        where: {
          id: parsed.data.diligenciaId,
          rolId: parsed.data.rolId,
        },
      })

      if (!diligencia) {
        return NextResponse.json(
          { ok: false, error: 'Diligencia no encontrada o no pertenece a este rol' },
          { status: 404 }
        )
      }
    }

    // Verify estampo exists if provided
    if (parsed.data.estampoId) {
      const estampo = await prisma.estampo.findFirst({
        where: {
          id: parsed.data.estampoId,
        },
      })

      if (!estampo) {
        return NextResponse.json(
          { ok: false, error: 'Estampo no encontrado' },
          { status: 404 }
        )
      }
    }

    // Create Documento
    const documento = await prisma.documento.create({
      data: {
        rolId: parsed.data.rolId,
        diligenciaId: parsed.data.diligenciaId || null,
        estampoId: parsed.data.estampoId || null,
        nombre: parsed.data.nombre,
        tipo: parsed.data.tipo,
        pdfId: parsed.data.pdfId || null,
        version: parsed.data.version,
      },
      include: {
        estampo: true,
        diligencia: {
          select: {
            id: true,
            tipo: {
              select: {
                nombre: true,
              },
            },
          },
        },
      },
    })

    // TODO: Phase 5 - If tipo === "Recibo", auto-create Recibo
    // if (parsed.data.tipo === "Recibo") {
    //   // Auto-create Recibo record
    // }

    await logAudit({
      userEmail: user.email,
      userId: user.id,
      officeId: officeIdStr,
      tabla: 'Documento',
      accion: 'Creó nuevo Documento',
      diff: { id: documento.id, nombre: documento.nombre, tipo: documento.tipo },
    })

    return NextResponse.json({ ok: true, data: documento })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: error.errors },
        { status: 400 }
      )
    }
    console.error('Error creating documento:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al crear el documento' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'id es requerido' },
        { status: 400 }
      )
    }

    const parsed = zDocumentoUpdate.safeParse(updateData)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
        { status: 400 }
      )
    }

    const officeIdStr = String(user.officeId)

    // Verify documento exists and belongs to user's office (via rol)
    const documento = await prisma.documento.findFirst({
      where: {
        id,
        rol: {
          officeId: officeIdStr,
        },
      },
    })

    if (!documento) {
      return NextResponse.json(
        { ok: false, error: 'Documento no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Update documento
    const updated = await prisma.documento.update({
      where: { id },
      data: parsed.data,
      include: {
        estampo: true,
        diligencia: {
          select: {
            id: true,
            tipo: {
              select: {
                nombre: true,
              },
            },
          },
        },
      },
    })

    await logAudit({
      userEmail: user.email,
      userId: user.id,
      officeId: officeIdStr,
      tabla: 'Documento',
      accion: 'Actualizó Documento',
      diff: { id, cambios: parsed.data },
    })

    return NextResponse.json({ ok: true, data: updated })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: error.errors },
        { status: 400 }
      )
    }
    console.error('Error updating documento:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al actualizar el documento' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const searchParams = req.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'id es requerido' },
        { status: 400 }
      )
    }

    const officeIdStr = String(user.officeId)

    // Verify documento exists and belongs to user's office (via rol)
    const documento = await prisma.documento.findFirst({
      where: {
        id,
        rol: {
          officeId: officeIdStr,
        },
      },
    })

    if (!documento) {
      return NextResponse.json(
        { ok: false, error: 'Documento no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    await prisma.documento.delete({
      where: { id },
    })

    await logAudit({
      userEmail: user.email,
      userId: user.id,
      officeId: officeIdStr,
      tabla: 'Documento',
      accion: 'Eliminó Documento',
      diff: { id },
    })

    return NextResponse.json({ ok: true, message: 'Documento eliminado correctamente' })
  } catch (error) {
    console.error('Error deleting documento:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al eliminar el documento' },
      { status: 500 }
    )
  }
}

