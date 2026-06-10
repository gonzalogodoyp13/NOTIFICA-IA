import 'server-only'

import fs from 'fs'
import path from 'path'

import { prisma } from '@/lib/prisma'
import { createServerSupabaseStorageClient } from '@/lib/supabaseServer'

export const PDF_ASSETS_BUCKET = 'pdf-assets'

export type OfficePdfConfig = {
  receptorNombre: string
  receptorDireccionLinea: string
  receptorTelefono: string | null
  firmaStorageBucket: string | null
  firmaStorageKey: string | null
  selloStorageBucket: string | null
  selloStorageKey: string | null
  reciboStampStorageBucket: string | null
  reciboStampStorageKey: string | null
}

export type OfficePdfImages = {
  firma?: Uint8Array
  sello?: Uint8Array
}

const DEFAULT_RECEPTOR_NOMBRE = 'Receptor Judicial'
const DEFAULT_RECEPTOR_DIRECCION_LINEA = ''

async function readPublicPng(relativePath: string) {
  const filePath = path.resolve(relativePath)

  try {
    if (fs.existsSync(filePath)) {
      return await fs.promises.readFile(filePath)
    }
  } catch (error) {
    console.warn(`Error loading fallback PDF asset ${relativePath}:`, error)
  }

  return undefined
}

async function readStoragePng(storageBucket: string | null, storageKey: string | null) {
  if (!storageKey) {
    return undefined
  }

  const supabase = createServerSupabaseStorageClient()
  const { data, error } = await supabase.storage
    .from(storageBucket || PDF_ASSETS_BUCKET)
    .download(storageKey)

  if (error || !data) {
    console.warn(`Error loading configured PDF asset ${storageKey}:`, error)
    return undefined
  }

  return Buffer.from(await data.arrayBuffer())
}

export async function loadOfficePdfConfig(
  officeId: number,
  fallbackReceptorNombre?: string | null
): Promise<OfficePdfConfig> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: {
      nombre: true,
      pdfReceptorNombre: true,
      pdfReceptorDireccionLinea: true,
      pdfReceptorTelefono: true,
      pdfFirmaStorageBucket: true,
      pdfFirmaStorageKey: true,
      pdfSelloStorageBucket: true,
      pdfSelloStorageKey: true,
      pdfReciboStampStorageBucket: true,
      pdfReciboStampStorageKey: true,
    },
  })

  return {
    receptorNombre:
      office?.pdfReceptorNombre?.trim() ||
      fallbackReceptorNombre?.trim() ||
      office?.nombre?.trim() ||
      DEFAULT_RECEPTOR_NOMBRE,
    receptorDireccionLinea:
      office?.pdfReceptorDireccionLinea?.trim() || DEFAULT_RECEPTOR_DIRECCION_LINEA,
    receptorTelefono: office?.pdfReceptorTelefono?.trim() || null,
    firmaStorageBucket: office?.pdfFirmaStorageBucket ?? null,
    firmaStorageKey: office?.pdfFirmaStorageKey ?? null,
    selloStorageBucket: office?.pdfSelloStorageBucket ?? null,
    selloStorageKey: office?.pdfSelloStorageKey ?? null,
    reciboStampStorageBucket: office?.pdfReciboStampStorageBucket ?? null,
    reciboStampStorageKey: office?.pdfReciboStampStorageKey ?? null,
  }
}

export async function loadOfficePdfImages(officeId: number): Promise<OfficePdfImages> {
  const config = await loadOfficePdfConfig(officeId)
  const [firma, sello] = await Promise.all([
    readStoragePng(config.firmaStorageBucket, config.firmaStorageKey)
      .then(asset => asset ?? readPublicPng('./public/mock-firma.png')),
    readStoragePng(config.selloStorageBucket, config.selloStorageKey)
      .then(asset => asset ?? readPublicPng('./public/mock-sello.png')),
  ])

  return {
    firma,
    sello,
  }
}

export async function loadOfficeReciboStamp(officeId: number) {
  const config = await loadOfficePdfConfig(officeId)

  return (
    await readStoragePng(config.reciboStampStorageBucket, config.reciboStampStorageKey)
  ) ?? readPublicPng('./public/recibo-pagado.png')
}
