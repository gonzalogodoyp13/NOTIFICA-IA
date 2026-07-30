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
  receiptId: id,
  documentId: id,
  documentVersionId: id,
  numeroRecibo: z.string().min(1).max(80),
  version: z.number().int().positive(),
  amount: z.number().finite(),
  paymentMethod: z.string().min(1).max(80),
  operationalReference: z.string().max(120).nullable().optional(),
  notificationId: nullableId,
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

export const ACTIVITY_EVENT_CATALOG = {
  'auth.login': { module: 'auth', critical: false, metadata: emptyMetadata },
  'auth.logout': { module: 'auth', critical: false, metadata: emptyMetadata },
  'notification.created': { module: 'notificaciones', critical: true, metadata: notificationMetadata },
  'notification.updated': { module: 'notificaciones', critical: true, metadata: notificationMetadata },
  'notification.deleted': { module: 'notificaciones', critical: true, metadata: notificationMetadata },
  'receipt.generated': { module: 'recibos', critical: true, metadata: receiptMetadata },
  'receipt.regenerated': { module: 'recibos', critical: true, metadata: receiptMetadata },
  'stamp.generated': { module: 'documents', critical: true, metadata: stampMetadata },
  'audit.export': { module: 'audit', critical: true, metadata: exportMetadata },
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
