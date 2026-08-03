import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, handleApiError, withApiUser } from '@/lib/api/server'
import { recordSettingsEvent } from '@/lib/audit/businessEvents'
import { invalidateOfficeCaches } from '@/lib/cache/officeCache'
import { bumpOfficeCacheRevision } from '@/lib/cache/officeCacheRevision'
import { isPngBytes, PDF_ASSETS_BUCKET } from '@/lib/pdf/officeConfig'
import { loadPdfSettingsRepresentation, PDF_ASSET_DEFINITIONS, type PdfAssetKind } from '@/lib/pdf/settings'
import { prisma } from '@/lib/prisma'
import { createServerSupabaseStorageClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'
const MAX_ASSET_BYTES = 5 * 1024 * 1024
const kinds = Object.keys(PDF_ASSET_DEFINITIONS) as PdfAssetKind[]

function requireAdmin(isOfficeAdmin: boolean) {
  if (!isOfficeAdmin) throw new ApiError('FORBIDDEN', 'Solo administradores de oficina pueden gestionar la configuracion PDF', 403)
}

function textValue(form: FormData, name: string, maxLength: number) {
  const value = form.get(name)
  if (value !== null && typeof value !== 'string') throw new ApiError('VALIDATION_ERROR', `${name} debe ser texto`, 400)
  const normalized = (value ?? '').trim()
  if (normalized.length > maxLength) throw new ApiError('VALIDATION_ERROR', `${name} excede el largo maximo`, 400)
  return normalized || null
}

async function removeObjects(storage: ReturnType<typeof createServerSupabaseStorageClient>, keys: string[]) {
  if (!keys.length) return
  await storage.storage.from(PDF_ASSETS_BUCKET).remove(keys).catch(() => undefined)
}

export async function GET(req: NextRequest) {
  return withApiUser(req, 'settings.pdf.read', async user => {
    try {
      requireAdmin(user.isOfficeAdmin)
      const data = await loadPdfSettingsRepresentation(user.officeId)
      if (!data) throw new ApiError('NOT_FOUND', 'Oficina no encontrada', 404)
      return apiSuccess(data)
    } catch (error) {
      return handleApiError(error, { operation: 'settings.pdf.read', request: req, user })
    }
  })
}

export async function PUT(req: NextRequest) {
  return withApiUser(req, 'settings.pdf.update', async user => {
    const storage = createServerSupabaseStorageClient()
    const uploadedKeys: string[] = []
    let committed = false
    try {
      requireAdmin(user.isOfficeAdmin)
      const form = await req.formData()
      const config = {
        pdfReceptorNombre: textValue(form, 'receptorNombre', 160),
        pdfReceptorDireccionLinea: textValue(form, 'receptorDireccionLinea', 240),
        pdfReceptorTelefono: textValue(form, 'receptorTelefono', 60),
      }
      const files = new Map<PdfAssetKind, { bytes: Uint8Array; key: string }>()
      const removals = new Set<PdfAssetKind>()

      for (const kind of kinds) {
        const remove = form.get(`remove${kind.charAt(0).toUpperCase()}${kind.slice(1)}`) === 'true'
        const candidate = form.get(kind)
        const file = candidate instanceof File && candidate.size > 0 ? candidate : null
        if (remove && file) throw new ApiError('VALIDATION_ERROR', `No puedes reemplazar y eliminar ${kind} a la vez`, 400)
        if (remove) removals.add(kind)
        if (!file) continue
        if (file.type !== 'image/png' || file.size > MAX_ASSET_BYTES) throw new ApiError('VALIDATION_ERROR', `${kind} debe ser PNG y pesar maximo 5 MB`, 400)
        const bytes = new Uint8Array(await file.arrayBuffer())
        if (!isPngBytes(bytes)) throw new ApiError('VALIDATION_ERROR', `${kind} no contiene una firma PNG valida`, 400)
        files.set(kind, { bytes, key: `offices/${user.officeId}/pdf-assets/${kind}/${crypto.randomUUID()}.png` })
      }

      for (const kind of kinds) {
        const file = files.get(kind)
        if (!file) continue
        const { error } = await storage.storage.from(PDF_ASSETS_BUCKET).upload(file.key, file.bytes, { contentType: 'image/png', upsert: false })
        if (error) throw new ApiError('SERVICE_UNAVAILABLE', `No se pudo cargar el recurso ${kind}`, 503)
        uploadedKeys.push(file.key)
      }

      const current = await prisma.office.findUnique({ where: { id: user.officeId } })
      if (!current) throw new ApiError('NOT_FOUND', 'Oficina no encontrada', 404)
      const changedFields = ['receptorNombre', 'receptorDireccionLinea', 'receptorTelefono']
      for (const kind of kinds) if (files.has(kind) || removals.has(kind)) changedFields.push(kind)

      const result = await prisma.$transaction(async tx => {
        const data: Record<string, string | null> = { ...config }
        for (const kind of kinds) {
          const definition = PDF_ASSET_DEFINITIONS[kind]
          const file = files.get(kind)
          if (file) {
            data[definition.bucketField] = PDF_ASSETS_BUCKET
            data[definition.keyField] = file.key
          } else if (removals.has(kind)) {
            data[definition.bucketField] = null
            data[definition.keyField] = null
          }
        }
        await tx.office.update({ where: { id: user.officeId }, data })
        const cacheRevision = await bumpOfficeCacheRevision(tx, user.officeId)
        await recordSettingsEvent(tx, user, { resource: 'OfficePdfConfig', action: 'updated', recordId: user.officeId, changedFields })
        return cacheRevision
      })
      committed = true

      for (const kind of kinds) {
        if (!files.has(kind) && !removals.has(kind)) continue
        const definition = PDF_ASSET_DEFINITIONS[kind]
        const key = current[definition.keyField]
        const bucket = current[definition.bucketField] || PDF_ASSETS_BUCKET
        if (key) await storage.storage.from(bucket).remove([key]).catch(() => undefined)
      }
      invalidateOfficeCaches(user.officeId)
      const representation = await loadPdfSettingsRepresentation(user.officeId)
      return apiSuccess({ ...representation!, cacheRevision: result })
    } catch (error) {
      if (!committed) await removeObjects(storage, uploadedKeys)
      return handleApiError(error, { operation: 'settings.pdf.update', request: req, user })
    }
  })
}
