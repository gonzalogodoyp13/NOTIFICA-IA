import 'server-only'

import { prisma } from '@/lib/prisma'

export const PDF_ASSET_DEFINITIONS = {
  firma: { bucketField: 'pdfFirmaStorageBucket', keyField: 'pdfFirmaStorageKey' },
  sello: { bucketField: 'pdfSelloStorageBucket', keyField: 'pdfSelloStorageKey' },
  reciboStamp: { bucketField: 'pdfReciboStampStorageBucket', keyField: 'pdfReciboStampStorageKey' },
} as const

export type PdfAssetKind = keyof typeof PDF_ASSET_DEFINITIONS

export async function loadPdfSettingsRepresentation(officeId: number) {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: {
      pdfReceptorNombre: true,
      pdfReceptorDireccionLinea: true,
      pdfReceptorTelefono: true,
      pdfFirmaStorageKey: true,
      pdfSelloStorageKey: true,
      pdfReciboStampStorageKey: true,
      cacheRevision: true,
    },
  })
  if (!office) return null
  return {
    config: {
      receptorNombre: office.pdfReceptorNombre,
      receptorDireccionLinea: office.pdfReceptorDireccionLinea,
      receptorTelefono: office.pdfReceptorTelefono,
    },
    assets: {
      firma: { configured: !!office.pdfFirmaStorageKey, previewUrl: '/api/ajustes/pdf/assets/firma' },
      sello: { configured: !!office.pdfSelloStorageKey, previewUrl: '/api/ajustes/pdf/assets/sello' },
      reciboStamp: { configured: !!office.pdfReciboStampStorageKey, previewUrl: '/api/ajustes/pdf/assets/reciboStamp' },
    },
    cacheRevision: office.cacheRevision,
  }
}
