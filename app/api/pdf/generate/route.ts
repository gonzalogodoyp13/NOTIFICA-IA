import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function POST(req: NextRequest) {
  try {
    const { contenido = "", variables = {} } = await req.json();

    let filled = contenido;
    Object.entries(variables as Record<string, string>).forEach(
      ([key, value]) => {
        const token = `$${key}`;
        filled = filled.replaceAll(token, value ?? "");
      }
    );

    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const { width, height } = page.getSize();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontSize = 12;

    const lines = filled.split("\n");
    let y = height - 50;
    const lineHeight = fontSize + 4;

    for (const line of lines) {
      if (y <= 50) {
        // Nueva página si se termina el espacio disponible
        const newPage = pdf.addPage();
        y = newPage.getSize().height - 50;
      }

      page.drawText(line, {
        x: 50,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
      y -= lineHeight;
    }

    const pdfBytes = await pdf.save();

    return new NextResponse(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=preview.pdf",
      },
    });
  } catch (error) {
    console.error("Error generating preview:", error);
    return NextResponse.json(
      { ok: false, error: "Error generating preview" },
      { status: 500 }
    );
  }
}

