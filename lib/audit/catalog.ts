import { z } from 'zod'

const id = z.string().min(1).max(120)
const nullableId = id.nullable().optional()
const emptyMetadata = z.object({}).strict()
const notificationMetadata = z.object({
  notificationId: id,
  diligenceId: id,
  executedPartyId: nullableId,
  changedFields: z.array(z.string().min(1).max(80)).max(100).optional(),
  deletedDocumentCount: z.number().int().nonnegative().optional(),
  deletedReceiptCount: z.number().int().nonnegative().optional(),
}).strict()
const receiptMetadata = z.object({
  reservationId: id,
  receiptId: id,
  documentId: id,
  documentVersionId: id,
  numeroRecibo: z.string().min(1).max(80),
  version: z.number().int().positive(),
  amount: z.number().finite(),
  paymentMethod: z.string().min(1).max(80),
  operationalReference: z.string().max(120).nullable().optional(),
  notificationId: nullableId,
  priorReceiptId: nullableId,
}).strict()
const receiptFailureMetadata = z.object({
  reservationId: id,
  notificationId: id,
  numeroRecibo: z.string().min(1).max(80),
  operation: z.enum(['GENERATE', 'REGENERATE', 'CORRECT']),
  errorCode: z.string().min(1).max(120),
}).strict()
const stampMetadata = z.object({
  documentId: id,
  documentVersionId: id,
  templateId: z.union([z.number().int().positive(), id]),
  templateSlug: z.string().min(1).max(120),
  templateCategory: z.string().min(1).max(120),
  notificationId: nullableId,
  version: z.number().int().positive(),
}).strict()
const exportMetadata = z.object({
  format: z.enum(['csv', 'json']),
  source: z.enum(['activity', 'legacy']),
  count: z.number().int().nonnegative(),
}).strict()
const legacyRetirementMetadata = z.object({
  policyId: z.literal('AUDITLOG-DEV-ZERO-RETENTION-V1'),
  strategy: z.literal('PURGE_NO_ARCHIVE'),
  deletedCount: z.number().int().nonnegative(),
  oldestAt: z.string().datetime().nullable(),
  newestAt: z.string().datetime().nullable(),
}).strict()
const reportType = z.enum(['daily', 'monthly', 'custom'])
const checksum = z.string().regex(/^[a-f0-9]{64}$/)
const reportGenerationMetadata = z.object({
  reportId: id,
  versionId: id,
  versionNumber: z.number().int().positive(),
  reportType,
  periodDate: z.string().min(7).max(25),
  activityCount: z.number().int().nonnegative(),
  checksumSha256: checksum,
  sizeBytes: z.number().int().nonnegative(),
  generationMode: z.string().min(1).max(80),
}).strict()
const reportDeliveryMetadata = z.object({
  reportId: id,
  versionId: id,
  attemptId: id,
  attemptNumber: z.number().int().positive(),
  reportType,
  periodDate: z.string().min(7).max(25),
  status: z.enum(['SENT', 'PARTIAL', 'FAILED', 'NO_RECIPIENTS', 'CANCELLED']),
  mode: z.enum(['MANUAL', 'SCHEDULED']),
  target: z.enum(['ALL_AUTHORIZED', 'FAILED_ONLY']),
  sentCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  recipientCount: z.number().int().nonnegative(),
  checksumSha256: checksum,
}).strict()
const reportDownloadMetadata = z.object({
  reportId: id,
  versionId: id.nullable().optional(),
  reportType: reportType.optional(),
  periodDate: z.string().min(7).max(25).optional(),
  checksumSha256: checksum.nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  requestId: id,
  current: z.boolean().optional(),
  reason: z.enum(['permission', 'office_boundary', 'not_found', 'unavailable', 'storage', 'checksum', 'audit']).optional(),
}).strict()
const reportRestoreMetadata = z.object({
  reportId: id,
  versionId: id,
  previousVersionId: id.nullable(),
  versionNumber: z.number().int().positive(),
  reportType: z.literal('monthly'),
  periodDate: z.string().min(7).max(10),
  checksumSha256: checksum,
  sizeBytes: z.number().int().nonnegative(),
}).strict()

export const ACTIVITY_EVENT_CATALOG = {
  'auth.login': { module: 'auth', critical: false, metadata: emptyMetadata },
  'auth.logout': { module: 'auth', critical: false, metadata: emptyMetadata },
  'notification.created': { module: 'notificaciones', critical: true, metadata: notificationMetadata },
  'notification.updated': { module: 'notificaciones', critical: true, metadata: notificationMetadata },
  'notification.deleted': { module: 'notificaciones', critical: true, metadata: notificationMetadata },
  'receipt.generated': { module: 'recibos', critical: true, metadata: receiptMetadata },
  'receipt.regenerated': { module: 'recibos', critical: true, metadata: receiptMetadata },
  'receipt.corrected': { module: 'recibos', critical: true, metadata: receiptMetadata },
  'receipt.generation_failed': { module: 'recibos', critical: false, metadata: receiptFailureMetadata },
  'stamp.generated': { module: 'documents', critical: true, metadata: stampMetadata },
  'audit.export': { module: 'audit', critical: true, metadata: exportMetadata },
  'audit.legacy_retired': { module: 'audit', critical: true, metadata: legacyRetirementMetadata },
  'report.daily.generated': { module: 'reports', critical: true, metadata: reportGenerationMetadata },
  'report.daily.regenerated': { module: 'reports', critical: true, metadata: reportGenerationMetadata },
  'report.monthly.generated': { module: 'reports', critical: true, metadata: reportGenerationMetadata },
  'report.monthly.regenerated': { module: 'reports', critical: true, metadata: reportGenerationMetadata },
  'report.custom.generated': { module: 'reports', critical: true, metadata: reportGenerationMetadata },
  'report.custom.regenerated': { module: 'reports', critical: true, metadata: reportGenerationMetadata },
  'report.daily.sent': { module: 'reports', critical: true, metadata: reportDeliveryMetadata },
  'report.monthly.sent': { module: 'reports', critical: true, metadata: reportDeliveryMetadata },
  'report.custom.sent': { module: 'reports', critical: true, metadata: reportDeliveryMetadata },
  'report.downloaded': { module: 'reports', critical: true, metadata: reportDownloadMetadata },
  'report.download_denied': { module: 'reports', critical: true, metadata: reportDownloadMetadata },
  'report.download_failed': { module: 'reports', critical: true, metadata: reportDownloadMetadata },
  'report.version.restored': { module: 'reports', critical: true, metadata: reportRestoreMetadata },
} as const

export type CanonicalActivityEventType = keyof typeof ACTIVITY_EVENT_CATALOG

export function validateCatalogEvent(eventType: string, module: string, metadata: unknown) {
  const definition = ACTIVITY_EVENT_CATALOG[eventType as CanonicalActivityEventType]
  if (!definition) return metadata
  if (definition.module !== module) {
    throw new Error(`Event ${eventType} must use module ${definition.module}.`)
  }
  return definition.metadata.parse(metadata ?? {})
}
