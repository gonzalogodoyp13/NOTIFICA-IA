import { withApiUser } from '@/lib/api/server'
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { wrapText } from "@/lib/pdf/textLayout";
import { embedSignatureImages } from "@/lib/pdf/imageUtils";
import { drawRolHeader } from "@/lib/pdf/header";
import { formatCuantiaCLP } from "@/lib/utils/cuantia";
import { loadOfficePdfConfig, loadOfficePdfImages } from "@/lib/pdf/officeConfig";

export async function POST(req: NextRequest) {
  return withApiUser(req, 'pdf.preview', async user => {
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
      cuantia: formatCuantiaCLP(500000),
    };

    let filled = contenido;
    const processedVariables = { ...sample, ...(variables as Record<string, string>) };
    Object.entries(processedVariables).forEach(([key, val]) => {
      if (key === 'cuantia') {
        // Si viene como número, formatear; si ya es string, intentar parsear y formatear
        const numVal = typeof val === 'number' ? val : parseFloat(String(val));
        val = !isNaN(numVal) ? formatCuantiaCLP(numVal) : String(val ?? '');
      }
      filled = filled.replaceAll(`$${key}`, String(val ?? ""));
    });

    const pdf = await PDFDocument.create();
    let page = pdf.addPage();
    const margin = 50;
    const font = await pdf.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const fontSize = 12;
    const lineHeight = fontSize + 4;
    let y = page.getSize().height - margin;
    const [officeImages, officePdfConfig] = await Promise.all([
          loadOfficePdfImages({ officeId: user.officeId, officeCacheRevision: user.officeCacheRevision }),
          loadOfficePdfConfig({ officeId: user.officeId, officeCacheRevision: user.officeCacheRevision, fallbackReceptorNombre: user.officeName }),
        ]);

    // Draw header before content
    const headerData = {
      receptorNombre: officePdfConfig?.receptorNombre ?? user.officeName ?? "Receptor Judicial",
      tribunalNombre: (variables.tribunal as string | undefined) ?? sample.tribunal,
      rolNumero: (variables.rol as string | undefined) ?? sample.rol,
      bancoNombre: "Banco de Chile", // Mock for preview
      ejecutadoNombre: "Ejecutado Ejemplo", // Mock for preview
    };

    y = drawRolHeader(pdf, page, headerData, { font, fontBold }, y, margin);

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

    return new NextResponse(Buffer.from(pdfBytes), {
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

  })
}

