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

export function customReportFileName(periodDate: string, definitionId?: string) {
  return `reporte-personalizado-${definitionId ? `${definitionId.slice(0, 8)}-` : ''}${periodDate}.xlsx`
}

export function dailyReportStorageKey(input: { officeId: number; periodDate: string; reportId: string; versionNumber: number }) {
  const [year, month, day] = input.periodDate.split('-')
  return [
    `offices/${input.officeId}`,
    'daily',
    year,
    month,
    day,
    `v${input.versionNumber}-${input.reportId}.xlsx`,
  ].join('/')
}

export function monthlyReportStorageKey(input: { officeId: number; periodDate: string; reportId: string; versionNumber: number }) {
  const [year, month] = input.periodDate.split('-')
  return [
    `offices/${input.officeId}`,
    'monthly',
    year,
    month,
    `v${input.versionNumber}-${input.reportId}.xlsx`,
  ].join('/')
}

export async function downloadReportFile(storageBucket: string, storageKey: string) {
  const supabase = createServerSupabaseStorageClient({ requireServiceRole: true })
  const { data, error } = await supabase.storage.from(storageBucket).download(storageKey)
  if (error || !data) throw new Error(`No se pudo descargar el reporte: ${error?.message ?? 'archivo no encontrado'}`)
  return Buffer.from(await data.arrayBuffer())
}

export async function deleteReportFile(storageBucket: string, storageKey: string) {
  const supabase = createServerSupabaseStorageClient({ requireServiceRole: true })
  const { error } = await supabase.storage.from(storageBucket).remove([storageKey])
  if (error) throw new Error(`No se pudo eliminar el reporte: ${error.message}`)
}

export function customReportStorageKey(input: { officeId: number; periodDate: string; reportId: string; versionNumber: number }) {
  return [
    `offices/${input.officeId}`,
    'custom',
    input.periodDate,
    `v${input.versionNumber}-${input.reportId}.xlsx`,
  ].join('/')
}

export function reportVersionStorageKey(input: {
  officeId: number
  reportType: 'daily' | 'monthly' | 'custom'
  periodDate: string
  reportId: string
  versionNumber: number
}) {
  return input.reportType === 'daily'
    ? dailyReportStorageKey(input)
    : input.reportType === 'monthly'
      ? monthlyReportStorageKey(input)
      : customReportStorageKey(input)
}

export async function uploadReportVersionWorkbook(input: {
  buffer: Buffer
  storageKey: string
  fileName: string
}): Promise<StoredReportFile> {
  const supabase = createServerSupabaseStorageClient({ requireServiceRole: true })
  const { error } = await supabase.storage.from(REPORT_STORAGE_BUCKET).upload(input.storageKey, input.buffer, {
    contentType: XLSX_MIME_TYPE,
    upsert: false,
  })
  if (error) throw new Error(`No se pudo subir la version del reporte a storage: ${error.message}`)
  return {
    storageBucket: REPORT_STORAGE_BUCKET,
    storageKey: input.storageKey,
    fileName: input.fileName,
    mimeType: XLSX_MIME_TYPE,
    sizeBytes: input.buffer.length,
    checksumSha256: reportChecksum(input.buffer),
  }
}

export async function verifyStoredReportFile(file: StoredReportFile) {
  const buffer = await downloadReportFile(file.storageBucket, file.storageKey)
  const checksumSha256 = reportChecksum(buffer)
  if (buffer.length !== file.sizeBytes || checksumSha256 !== file.checksumSha256) {
    throw new Error('La version almacenada no coincide con el tamano o checksum esperado.')
  }
  return buffer
}
