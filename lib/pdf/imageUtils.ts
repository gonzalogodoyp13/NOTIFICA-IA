import type { PDFDocument, PDFPage } from "pdf-lib";

type OfficeImages = {
  firma?: Uint8Array;
  sello?: Uint8Array;
};

const SUPPORTED_KEYS = ["$firma", "$sello"] as const;

type SupportedKey = (typeof SUPPORTED_KEYS)[number];

export async function embedSignatureImages(
  pdf: PDFDocument,
  page: PDFPage,
  text: string,
  yPosition: number,
  officeImages: OfficeImages
): Promise<string> {
  let adjustedText = text;
  let xOffset = 0;

  for (const key of SUPPORTED_KEYS) {
    if (!adjustedText.includes(key)) {
      continue;
    }

    const imageKey = key.slice(1) as keyof OfficeImages;
    const imageBytes = officeImages[imageKey];

    if (!imageBytes) {
      adjustedText = adjustedText.replaceAll(key, "");
      continue;
    }

    const image = await pdf.embedPng(imageBytes);
    const dims = image.scale(0.35);

    page.drawImage(image, {
      x: 80 + xOffset,
      y: yPosition - dims.height,
      width: dims.width,
      height: dims.height,
    });

    adjustedText = adjustedText.replaceAll(key, "");
    xOffset += dims.width + 10;
  }

  return adjustedText.trimEnd();
}

