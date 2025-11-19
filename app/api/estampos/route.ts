import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserWithOffice } from "@/lib/auth-server";
import type { NextRequest } from "next/server";
import { EstampoSchema } from "@/lib/zodSchemas";

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getCurrentUserWithOffice();

    if (!user) {
      return NextResponse.json(
        { ok: false, message: "No autorizado", error: "No autorizado" },
        { status: 401 }
      );
    }

    const estampos = await prisma.estampo.findMany({
      where: { officeId: user.officeId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ ok: true, data: estampos });
  } catch (error) {
    console.error("Error fetching estampos:", error);
    const errorMessage = error instanceof Error ? error.message : "Error al obtener los estampos";
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice();

    if (!user) {
      return NextResponse.json(
        { ok: false, message: "No autorizado", error: "No autorizado" },
        { status: 401 }
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

    const estampo = await prisma.estampo.create({
      data: {
        officeId: user.officeId,
        nombre: parsed.data.nombre,
        tipo: parsed.data.tipo,
        contenido: parsed.data.contenido ?? "",
        fileUrl: parsed.data.fileUrl ?? "",
      },
    });

    return NextResponse.json({ ok: true, data: estampo });
  } catch (error) {
    console.error("Error creando estampo:", error);
    const errorMessage = error instanceof Error ? error.message : "Error al crear el estampo";
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    );
  }
}
