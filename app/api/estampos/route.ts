import { withApiUser } from '@/lib/api/server'
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";
import { EstampoSchema } from "@/lib/zodSchemas";
import { recordSettingsEvent } from '@/lib/audit/businessEvents'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.estampos', async user => {
  try {

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

  })
}

export async function POST(req: NextRequest) {
  return withApiUser(req, 'post.estampos', async user => {
  try {

    const body = await req.json();
    const parsed = EstampoSchema.safeParse(body);

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      );
    }

    const estampo = await prisma.$transaction(async tx => {
      const created = await tx.estampo.create({ data: {
        officeId: user.officeId,
        nombre: parsed.data.nombre,
        tipo: parsed.data.tipo,
        contenido: parsed.data.contenido ?? "",
        fileUrl: parsed.data.fileUrl ?? "",
      } })
      await recordSettingsEvent(tx, user, { resource: 'Estampo', action: 'created', recordId: created.id })
      return created
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

  })
}
