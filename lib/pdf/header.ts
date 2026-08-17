import type { PDFDocument, PDFPage, PDFFont } from "pdf-lib";
import { rgb } from "pdf-lib";

export type HeaderData = {
  receptorNombre: string | null;
  tribunalNombre: string | null;
  rolNumero: string;
  bancoNombre: string | null;
  ejecutadoNombre: string | null;
};

export type HeaderFonts = {
  font: PDFFont;
  fontBold: PDFFont;
};

/**
 * Draws the ROL header on the first page of a PDF
 * @param pdf - PDFDocument instance
 * @param page - PDFPage instance (first page)
 * @param headerData - Object containing header information
 * @param fonts - Object containing regular and bold fonts
 * @param startY - Starting Y position (default: 780)
 * @param margin - Left margin (default: 50)
 * @returns New Y position after the header (to continue drawing content)
 */
export function drawRolHeader(
  pdf: PDFDocument,
  page: PDFPage,
  headerData: HeaderData,
  fonts: HeaderFonts,
  startY: number = 780,
  margin: number = 50
): number {
  const { receptorNombre, tribunalNombre, rolNumero, bancoNombre, ejecutadoNombre } = headerData;
  const { font, fontBold } = fonts;

  let y = startY;
  const pageWidth = page.getSize().width;
  const headerMargin = margin;
  const receptorFontSize = 14;
  const infoFontSize = 12;
  const lineSpacing = 16;
  const lineBeforeSeparator = 24;
  const lineAfterSeparator = 16;
  const blankLineAfter = 32;

  // Draw receptor name (bold, centered)
  if (receptorNombre) {
    const receptorText = receptorNombre;
    const receptorWidth = fontBold.widthOfTextAtSize(receptorText, receptorFontSize);
    const receptorX = (pageWidth - receptorWidth) / 2; // Centered

    page.drawText(receptorText, {
      x: receptorX,
      y,
      size: receptorFontSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
  }

  y -= lineBeforeSeparator;

  // Draw horizontal line
  const lineY = y;
  const lineXStart = headerMargin;
  const lineXEnd = pageWidth - headerMargin;
  page.drawLine({
    start: { x: lineXStart, y: lineY },
    end: { x: lineXEnd, y: lineY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  y -= lineAfterSeparator + lineSpacing;

  const colonX = headerMargin + 78;
  const valueX = colonX + 14;
  const drawInfoRow = (label: string, value: string) => {
    page.drawText(label, {
      x: headerMargin,
      y,
      size: infoFontSize,
      font,
      color: rgb(0, 0, 0),
    });
    page.drawText(":", {
      x: colonX,
      y,
      size: infoFontSize,
      font,
      color: rgb(0, 0, 0),
    });
    page.drawText(value, {
      x: valueX,
      y,
      size: infoFontSize,
      font,
      color: rgb(0, 0, 0),
    });
  };

  drawInfoRow("Tribunal", tribunalNombre || "N/A");
  y -= lineSpacing;
  drawInfoRow("N° ROL", rolNumero);
  y -= lineSpacing;

  let caratuladoText = "";
  if (bancoNombre && ejecutadoNombre) {
    caratuladoText += `${bancoNombre} / ${ejecutadoNombre}`;
  } else if (bancoNombre) {
    caratuladoText += bancoNombre;
  } else if (ejecutadoNombre) {
    caratuladoText += ejecutadoNombre;
  } else {
    caratuladoText += "N/A";
  }

  drawInfoRow("Caratulado", caratuladoText);

  y -= blankLineAfter;

  // Return the new Y position for content to continue
  return y;
}

