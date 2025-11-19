import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserWithOffice } from "@/lib/auth-server";
import type { NextRequest } from "next/server";
import { EstampoSchema } from "@/lib/zodSchemas";

export const dynamic = 'force-dynamic'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice();

    if (!user) {
      return NextResponse.json(
        { ok: false, message: "No autorizado", error: "No autorizado" },
        { status: 401 }
      );
    }

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

    const estampo = await prisma.estampo.update({
      where: { id },
      data: {
        nombre: parsed.data.nombre,
        tipo: parsed.data.tipo,
        contenido: parsed.data.contenido ?? "",
        fileUrl: parsed.data.fileUrl ?? "",
      },
    });

    return NextResponse.json({ ok: true, data: estampo });
  } catch (error) {
    console.error("Error actualizando estampo:", error);
    const errorMessage = error instanceof Error ? error.message : "Error al actualizar el estampo";
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice();

    if (!user) {
      return NextResponse.json(
        { ok: false, message: "No autorizado", error: "No autorizado" },
        { status: 401 }
      );
    }

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

    await prisma.estampo.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true, message: "Estampo eliminado correctamente" });
  } catch (error) {
    console.error("Error eliminando estampo:", error);
    const errorMessage = error instanceof Error ? error.message : "Error al eliminar el estampo";
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    );
  }
}


