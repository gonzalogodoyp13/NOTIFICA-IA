import type { PDFFont } from "pdf-lib";

export function wrapText(
  text: string,
  maxWidth: number,
  font: PDFFont,
  fontSize: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      lines.push("__BLANK__");
      continue;
    }

    const words = paragraph.split(" ");
    let line = "";

    for (const word of words) {
      const testLine = line + word + " ";
      const width = font.widthOfTextAtSize(testLine, fontSize);

      if (width > maxWidth && line !== "") {
        lines.push(line.trim());
        line = word + " ";
      } else {
        line = testLine;
      }
    }

    if (line.trim().length > 0) {
      lines.push(line.trim());
    }
  }

  return lines.length > 0 ? lines : [""];
}

