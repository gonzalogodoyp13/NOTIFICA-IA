import 'server-only'

import { createHash } from 'crypto'

import { createServerSupabaseStorageClient } from '@/lib/supabaseServer'

export const REPORT_STORAGE_BUCKET = 'reports'
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export type StoredReportFile = {
  storageBucket: string
  storageKey: string
  fileName: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
}

export function reportChecksum(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export function dailyReportFileName(periodDate: string) {
  return `auditoria-diaria-${periodDate}.xlsx`
}

export function monthlyReportFileName(periodDate: string) {
  return `reporte-mensual-${periodDate}.xlsx`
}

export function dailyReportStorageKey(input: { officeId: number; periodDate: string; reportId: string }) {
  const [year, month, day] = input.periodDate.split('-')
  return [
    `offices/${input.officeId}`,
    'daily',
    year,
    month,
    day,
    `${input.reportId}.xlsx`,
  ].join('/')
}

export function monthlyReportStorageKey(input: { officeId: number; periodDate: string; reportId: string }) {
  const [year, month] = input.periodDate.split('-')
  return [
    `offices/${input.officeId}`,
    'monthly',
    year,
    month,
    `${input.reportId}.xlsx`,
  ].join('/')
}

export async function uploadReportWorkbook(input: {
  buffer: Buffer
  officeId: number
  periodDate: string
  reportId: string
}): Promise<StoredReportFile> {
  const storageKey = dailyReportStorageKey(input)
  const fileName = dailyReportFileName(input.periodDate)
  const supabase = createServerSupabaseStorageClient()
  const { error } = await supabase.storage.from(REPORT_STORAGE_BUCKET).upload(storageKey, input.buffer, {
    contentType: XLSX_MIME_TYPE,
    upsert: false,
  })

  if (error) throw new Error(`No se pudo subir el reporte a storage: ${error.message}`)

  return {
    storageBucket: REPORT_STORAGE_BUCKET,
    storageKey,
    fileName,
    mimeType: XLSX_MIME_TYPE,
    sizeBytes: input.buffer.length,
    checksumSha256: reportChecksum(input.buffer),
  }
}

export async function uploadMonthlyReportWorkbook(input: {
  buffer: Buffer
  officeId: number
  periodDate: string
  reportId: string
  upsert?: boolean
}): Promise<StoredReportFile> {
  const storageKey = monthlyReportStorageKey(input)
  const fileName = monthlyReportFileName(input.periodDate)
  const supabase = createServerSupabaseStorageClient()
  const { error } = await supabase.storage.from(REPORT_STORAGE_BUCKET).upload(storageKey, input.buffer, {
    contentType: XLSX_MIME_TYPE,
    upsert: input.upsert ?? false,
  })

  if (error) throw new Error(`No se pudo subir el reporte mensual a storage: ${error.message}`)

  return {
    storageBucket: REPORT_STORAGE_BUCKET,
    storageKey,
    fileName,
    mimeType: XLSX_MIME_TYPE,
    sizeBytes: input.buffer.length,
    checksumSha256: reportChecksum(input.buffer),
  }
}

export async function downloadReportFile(storageBucket: string, storageKey: string) {
  const supabase = createServerSupabaseStorageClient()
  const { data, error } = await supabase.storage.from(storageBucket).download(storageKey)
  if (error || !data) throw new Error(`No se pudo descargar el reporte: ${error?.message ?? 'archivo no encontrado'}`)
  return Buffer.from(await data.arrayBuffer())
}

export async function deleteReportFile(storageBucket: string, storageKey: string) {
  const supabase = createServerSupabaseStorageClient()
  const { error } = await supabase.storage.from(storageBucket).remove([storageKey])
  if (error) throw new Error(`No se pudo eliminar el reporte: ${error.message}`)
}
