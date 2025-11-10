import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserWithOffice } from "@/lib/auth-server";
import type { NextRequest } from "next/server";

export async function GET() {
  try {
    const user = await getCurrentUserWithOffice();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const estampos = await prisma.estampo.findMany({
      where: { officeId: user.officeId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ok: true, estampos });
  } catch (error) {
    console.error("Error fetching estampos:", error);
    return NextResponse.json(
      { ok: false, error: "Error fetching estampos" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await req.json();

    if (!body?.nombre || !body?.tipo) {
      return NextResponse.json(
        { ok: false, error: "Nombre y tipo son requeridos" },
        { status: 400 }
      );
    }

    const nuevo = await prisma.estampo.create({
      data: {
        officeId: user.officeId,
        nombre: body.nombre,
        tipo: body.tipo,
        contenido: body.contenido ?? "",
        fileUrl: body.fileUrl ?? "",
      },
    });

    return NextResponse.json({ ok: true, estampo: nuevo });
  } catch (error) {
    console.error("Error creando estampo:", error);
    return NextResponse.json(
      { ok: false, error: "Error creando estampo" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { id, nombre, tipo, contenido, fileUrl } = body || {};

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID es requerido" },
        { status: 400 }
      );
    }

    const estampo = await prisma.estampo.findFirst({
      where: { id, officeId: user.officeId },
    });

    if (!estampo) {
      return NextResponse.json(
        { ok: false, error: "Estampo no encontrado" },
        { status: 404 }
      );
    }

    const updated = await prisma.estampo.update({
      where: { id },
      data: {
        nombre: nombre ?? estampo.nombre,
        tipo: tipo ?? estampo.tipo,
        contenido: contenido ?? estampo.contenido ?? "",
        fileUrl: fileUrl ?? estampo.fileUrl ?? "",
      },
    });

    return NextResponse.json({ ok: true, estampo: updated });
  } catch (error) {
    console.error("Error actualizando estampo:", error);
    return NextResponse.json(
      { ok: false, error: "Error actualizando estampo" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID es requerido" },
        { status: 400 }
      );
    }

    const estampo = await prisma.estampo.findFirst({
      where: { id, officeId: user.officeId },
    });

    if (!estampo) {
      return NextResponse.json(
        { ok: false, error: "Estampo no encontrado" },
        { status: 404 }
      );
    }

    await prisma.estampo.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error eliminando estampo:", error);
    return NextResponse.json(
      { ok: false, error: "Error eliminando estampo" },
      { status: 500 }
    );
  }
}

