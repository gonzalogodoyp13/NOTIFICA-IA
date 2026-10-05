import 'server-only'

import { createHash } from 'crypto'

import { documentObjectStore } from './objectStore'

export const DOCUMENT_STORAGE_BUCKET = 'documents'
export const PDF_MIME_TYPE = 'application/pdf'

type BuildStorageKeyInput = {
  officeId: number
  rolId: string
  documentoId: string
  versionNumber: number
  fileName: string
  createdAt?: Date
}

type UploadPdfInput = BuildStorageKeyInput & {
  pdfBase64: string
}

export type StoredPdfMetadata = {
  storageBucket: string
  storageKey: string
  fileName: string
  sizeBytes: number
  checksumSha256: string
  mimeType: string
}

function normalizeBase64Pdf(pdfBase64: string) {
  return pdfBase64.includes(',') ? pdfBase64.split(',').pop() ?? '' : pdfBase64
}

export function pdfBase64ToBuffer(pdfBase64: string) {
  return Buffer.from(normalizeBase64Pdf(pdfBase64), 'base64')
}

export function safePdfFileName(name: string) {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  const base = normalized || 'documento'
  return base.endsWith('.pdf') ? base : `${base}.pdf`
}

export function hasStoredPdf(documento: {
  pdfId?: string | null
  currentVersion?: { id: string; deletedAt?: Date | string | null } | null
  currentVersionId?: string | null
}) {
  return !!documento.pdfId || (!!documento.currentVersionId && !documento.currentVersion?.deletedAt)
}

export function buildDocumentStorageKey(input: BuildStorageKeyInput) {
  const createdAt = input.createdAt ?? new Date()
  const yyyy = String(createdAt.getFullYear())
  const mm = String(createdAt.getMonth() + 1).padStart(2, '0')
  const dd = String(createdAt.getDate()).padStart(2, '0')

  return [
    `offices/${input.officeId}`,
    `roles/${input.rolId}`,
    `documents/${input.documentoId}`,
    `versions/v${input.versionNumber}`,
    yyyy,
    mm,
    dd,
    input.fileName,
  ].join('/')
}

export async function uploadPdfToDocumentStorage(input: UploadPdfInput): Promise<StoredPdfMetadata> {
  const fileName = safePdfFileName(input.fileName)
  const buffer = pdfBase64ToBuffer(input.pdfBase64)
  const checksumSha256 = createHash('sha256').update(buffer).digest('hex')
  const storageKey = buildDocumentStorageKey({ ...input, fileName })
  const store = documentObjectStore()
  await store.assertPrivate(DOCUMENT_STORAGE_BUCKET)
  await store.upload(DOCUMENT_STORAGE_BUCKET, storageKey, buffer)

  return {
    storageBucket: DOCUMENT_STORAGE_BUCKET,
    storageKey,
    fileName,
    sizeBytes: buffer.length,
    checksumSha256,
    mimeType: PDF_MIME_TYPE,
  }
}

export async function downloadPdfFromDocumentStorage(storageBucket: string, storageKey: string) {
  const store = documentObjectStore()
  await store.assertPrivate(storageBucket)
  return store.download(storageBucket, storageKey)
}

export async function deletePdfFromDocumentStorage(storageBucket: string, storageKey: string) {
  await documentObjectStore().remove(storageBucket, storageKey)
}
