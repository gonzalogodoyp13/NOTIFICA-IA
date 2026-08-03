import { withApiUser } from '@/lib/api/server'
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";
import { EstampoSchema } from "@/lib/zodSchemas";
import { recordSettingsEvent } from '@/lib/audit/businessEvents'
import { bumpOfficeCacheRevision } from '@/lib/cache/officeCacheRevision'
import { invalidateOfficeCaches } from '@/lib/cache/officeCache'

export const dynamic = 'force-dynamic'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withApiUser(req, 'put.estampos.id', async user => {
  try {

    const id = params.id;

    if (!id) {
      return NextResponse.json(
        { ok: false, message: "ID inválido", error: "ID inválido" },
        { status: 400 }
      );
    }

    // Verify estampo exists and belongs to user's office
    const existingEstampo = await prisma.estampo.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    });

    if (!existingEstampo) {
      return NextResponse.json(
        { ok: false, message: "Estampo no encontrado o no pertenece a tu oficina", error: "Estampo no encontrado o no pertenece a tu oficina" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = EstampoSchema.safeParse(body);

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      );
    }

    const { estampo, cacheRevision } = await prisma.$transaction(async tx => {
      const updated = await tx.estampo.update({ where: { id }, data: {
        nombre: parsed.data.nombre,
        tipo: parsed.data.tipo,
        contenido: parsed.data.contenido ?? "",
        fileUrl: parsed.data.fileUrl ?? "",
      } })
      await recordSettingsEvent(tx, user, { resource: 'Estampo', action: 'updated', recordId: id, changedFields: Object.keys(parsed.data) })
      const cacheRevision = await bumpOfficeCacheRevision(tx, user.officeId)
      return { estampo: updated, cacheRevision }
    });
    invalidateOfficeCaches(user.officeId)

    return NextResponse.json({ ok: true, data: estampo, cacheRevision });
  } catch (error) {
    console.error("Error actualizando estampo:", error);
    const errorMessage = error instanceof Error ? error.message : "Error al actualizar el estampo";
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    );
  }

  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withApiUser(req, 'delete.estampos.id', async user => {
  try {

    const id = params.id;

    if (!id) {
      return NextResponse.json(
        { ok: false, message: "ID inválido", error: "ID inválido" },
        { status: 400 }
      );
    }

    // Verify estampo exists and belongs to user's office
    const existingEstampo = await prisma.estampo.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    });

    if (!existingEstampo) {
      return NextResponse.json(
        { ok: false, message: "Estampo no encontrado o no pertenece a tu oficina", error: "Estampo no encontrado o no pertenece a tu oficina" },
        { status: 404 }
      );
    }

    const cacheRevision = await prisma.$transaction(async tx => {
      await tx.estampo.delete({ where: { id } })
      await recordSettingsEvent(tx, user, { resource: 'Estampo', action: 'deleted', recordId: id })
      return bumpOfficeCacheRevision(tx, user.officeId)
    });
    invalidateOfficeCaches(user.officeId)

    return NextResponse.json({ ok: true, message: "Estampo eliminado correctamente", cacheRevision });
  } catch (error) {
    console.error("Error eliminando estampo:", error);
    const errorMessage = error instanceof Error ? error.message : "Error al eliminar el estampo";
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    );
  }

  })
}


