import 'server-only'

import fs from 'fs'
import path from 'path'

import { officeBinaryCache, officeCacheKey, officeCatalogCache, TRANSIENT_ASSET_FALLBACK_TTL_MS } from '@/lib/cache/officeCache'
import { prisma } from '@/lib/prisma'
import { createServerSupabaseStorageClient } from '@/lib/supabaseServer'

export const PDF_ASSETS_BUCKET = 'pdf-assets'

export type OfficePdfCacheContext = {
  officeId: number
  officeCacheRevision: number
  fallbackReceptorNombre?: string | null
}

type RawOfficePdfConfig = {
  nombre: string
  pdfReceptorNombre: string | null
  pdfReceptorDireccionLinea: string | null
  pdfReceptorTelefono: string | null
  pdfFirmaStorageBucket: string | null
  pdfFirmaStorageKey: string | null
  pdfSelloStorageBucket: string | null
  pdfSelloStorageKey: string | null
  pdfReciboStampStorageBucket: string | null
  pdfReciboStampStorageKey: string | null
}

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

export type OfficePdfImages = { firma?: Uint8Array; sello?: Uint8Array }
export type OfficePdfAssetKind = 'firma' | 'sello' | 'reciboStamp'

const DEFAULT_RECEPTOR_NOMBRE = 'Receptor Judicial'
const DEFAULT_RECEPTOR_DIRECCION_LINEA = ''
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const TRANSPARENT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

export function isPngBytes(value: Uint8Array) {
  return value.byteLength >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => value[index] === byte)
}

export async function loadRawOfficePdfConfig(context: OfficePdfCacheContext): Promise<RawOfficePdfConfig> {
  const key = officeCacheKey('pdf-config', context.officeId, context.officeCacheRevision)
  return officeCatalogCache.getOrLoad(key, async () => {
    const office = await prisma.office.findUnique({
      where: { id: context.officeId },
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
    if (!office) throw new Error('Office not found while loading PDF configuration')
    return office
  }) as Promise<RawOfficePdfConfig>
}

export async function loadOfficePdfConfig(context: OfficePdfCacheContext): Promise<OfficePdfConfig> {
  const office = await loadRawOfficePdfConfig(context)
  return {
    receptorNombre: office.pdfReceptorNombre?.trim() || context.fallbackReceptorNombre?.trim() || office.nombre.trim() || DEFAULT_RECEPTOR_NOMBRE,
    receptorDireccionLinea: office.pdfReceptorDireccionLinea?.trim() || DEFAULT_RECEPTOR_DIRECCION_LINEA,
    receptorTelefono: office.pdfReceptorTelefono?.trim() || null,
    firmaStorageBucket: office.pdfFirmaStorageBucket,
    firmaStorageKey: office.pdfFirmaStorageKey,
    selloStorageBucket: office.pdfSelloStorageBucket,
    selloStorageKey: office.pdfSelloStorageKey,
    reciboStampStorageBucket: office.pdfReciboStampStorageBucket,
    reciboStampStorageKey: office.pdfReciboStampStorageKey,
  }
}

async function readPublicPng(context: OfficePdfCacheContext, kind: OfficePdfAssetKind, relativePath: string) {
  const filePath = path.resolve(relativePath)
  const key = officeCacheKey('pdf-asset-fallback', context.officeId, context.officeCacheRevision, kind)
  if (!fs.existsSync(filePath)) {
    if (kind !== 'reciboStamp') return undefined
    return officeBinaryCache.getOrLoad(key, async () => Buffer.from(TRANSPARENT_PNG_BASE64, 'base64'))
  }
  return officeBinaryCache.getOrLoad(key, async () => {
    const bytes = await fs.promises.readFile(filePath)
    if (!isPngBytes(bytes)) throw new Error(`Invalid bundled PNG for ${kind}`)
    return bytes
  })
}

async function loadAsset(
  context: OfficePdfCacheContext,
  kind: OfficePdfAssetKind,
  storageBucket: string | null,
  storageKey: string | null,
  fallbackPath: string
) {
  if (!storageKey) return readPublicPng(context, kind, fallbackPath)
  const bucket = storageBucket || PDF_ASSETS_BUCKET
  const key = officeCacheKey('pdf-asset', context.officeId, context.officeCacheRevision, kind, bucket, storageKey)
  try {
    return await officeBinaryCache.getOrLoadDynamic(key, async () => {
      const supabase = createServerSupabaseStorageClient()
      const { data, error } = await supabase.storage.from(bucket).download(storageKey)
      if (!error && data) {
        const bytes = Buffer.from(await data.arrayBuffer())
        if (isPngBytes(bytes)) return { value: bytes }
      }
      console.warn('Configured PDF asset unavailable; using fallback', { kind, bucket })
      const fallback = await readPublicPng(context, kind, fallbackPath)
      if (!fallback) throw new Error(`No bundled fallback available for ${kind}`)
      return { value: fallback, ttlMs: TRANSIENT_ASSET_FALLBACK_TTL_MS }
    })
  } catch {
    return undefined
  }
}

export async function loadOfficePdfImages(context: OfficePdfCacheContext): Promise<OfficePdfImages> {
  const config = await loadOfficePdfConfig(context)
  const [firma, sello] = await Promise.all([
    loadAsset(context, 'firma', config.firmaStorageBucket, config.firmaStorageKey, './public/mock-firma.png'),
    loadAsset(context, 'sello', config.selloStorageBucket, config.selloStorageKey, './public/mock-sello.png'),
  ])
  return { firma, sello }
}

export async function loadOfficeReciboStamp(context: OfficePdfCacheContext) {
  const config = await loadOfficePdfConfig(context)
  return loadAsset(context, 'reciboStamp', config.reciboStampStorageBucket, config.reciboStampStorageKey, './public/recibo-pagado.png')
}

export async function loadOfficePdfAsset(context: OfficePdfCacheContext, kind: OfficePdfAssetKind) {
  if (kind === 'reciboStamp') return loadOfficeReciboStamp(context)
  const images = await loadOfficePdfImages(context)
  return images[kind]
}
