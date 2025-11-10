import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { wrapText } from "@/lib/pdf/textLayout";
import { embedSignatureImages } from "@/lib/pdf/imageUtils";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { contenido = "", variables = {} } = await req.json();

    const sample = {
      nombre_ejecutado: "Juan Pérez",
      direccion_ejecutado: "Av. Providencia 1100",
      solo_comuna_ejecutado: "Santiago",
      fecha_palabras_diligencia: "10 de noviembre de 2025",
      hora_diligencia: "10:30",
      rol: "C-1234-2025",
      tribunal: "Juzgado Civil de Santiago",
      cuantia: "500.000",
    };

    let filled = contenido;
    Object.entries({ ...sample, ...(variables as Record<string, string>) }).forEach(
      ([key, val]) => {
        filled = filled.replaceAll(`$${key}`, String(val ?? ""));
      }
    );

    const firmaPath = path.resolve("./public/mock-firma.png");
    const selloPath = path.resolve("./public/mock-sello.png");
    const officeImages: { firma?: Uint8Array; sello?: Uint8Array } = {};

    if (fs.existsSync(firmaPath)) {
      officeImages.firma = await fs.promises.readFile(firmaPath);
    }

    if (fs.existsSync(selloPath)) {
      officeImages.sello = await fs.promises.readFile(selloPath);
    }

    const pdf = await PDFDocument.create();
    let page = pdf.addPage();
    const margin = 50;
    const font = await pdf.embedFont(StandardFonts.TimesRoman);
    const fontSize = 12;
    const lineHeight = fontSize + 4;
    let y = page.getSize().height - margin;

    const lines = wrapText(
      filled,
      page.getSize().width - margin * 2,
      font,
      fontSize
    );

    for (const line of lines) {
      if (y <= margin + 50) {
        page = pdf.addPage();
        y = page.getSize().height - margin;
      }

      if (line === "__BLANK__") {
        y -= fontSize * 1.5;
        continue;
      }

      const adjustedText = await embedSignatureImages(
        pdf,
        page,
        line,
        y,
        officeImages
      );

      if (adjustedText.trim()) {
        page.drawText(adjustedText, {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      }

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
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { ok: false, error: "Error generating PDF" },
      { status: 500 }
    );
  }
}

