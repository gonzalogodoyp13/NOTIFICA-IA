import 'server-only'
import type { Prisma } from '@prisma/client'
import { automaticSigningConfig } from './automaticConfig'
import { createSigningJobInTransaction } from './service'
import type { SigningContext } from './core'

// The document records the user's intent even before a signer has been enrolled.
// Callers hold the office workflow lock, so heartbeat and generation cannot queue twice.
export async function enqueueRequestedStamps(tx: Prisma.TransactionClient, officeId: number) {
  const configured = automaticSigningConfig(officeId)
  const devices = configured ? [] : await tx.signingDevice.findMany({ where: {
    officeId, revokedAt: null, role: { in: ['SIGNER', 'SIGNER_RECEIVER'] }, certificateThumbprint: { not: null },
  }, select: { certificateThumbprint: true } })
  const fingerprints = Array.from(new Set(devices.map(d => d.certificateThumbprint!)))
  const config = configured ?? (fingerprints.length === 1 ? { signerFingerprint: fingerprints[0], requestedLevel: 'PADES_LT' as const } : null)
  if (!config) return
  const users = await tx.user.findMany({ where: { officeId, isActive: true }, select: { id: true } })
  const documents = await tx.documento.findMany({ where: {
    officeId, tipo: 'Estampo', voidedAt: null, sourceTemplate: { path: ['signDigitally'], equals: true },
    generatedByUserId: { in: users.map(u => u.id) },
    currentVersion: { is: { deletedAt: null, signingItems: { none: {} }, signedSignatures: { none: {} }, sourceSignatures: { none: {} } } },
  }, select: { id: true, currentVersionId: true, generatedByUserId: true }, take: 100 })
  for (const doc of documents) {
    await createSigningJobInTransaction(tx, { officeId, userId: doc.generatedByUserId! }, {
      idempotencyKey: `stamp_${doc.currentVersionId}`, sourceVersionIds: [doc.currentVersionId!], ...config,
    })
  }
}

export async function replaceNotificationStamp(tx: Prisma.TransactionClient, context: SigningContext,
  document: { id: string; notificacionId: string | null; diligenciaId: string | null }) {
  if (!document.notificacionId) return
  // Only retire generated PDFs for this notification, never another ejecutado.
  // Retained signatures remain audit evidence; the folder catalog omits retired documents.
  await tx.documento.updateMany({ where: { officeId: context.officeId,
    notificacionId: document.notificacionId, diligenciaId: document.diligenciaId,
    tipo: 'Estampo', id: { not: document.id }, voidedAt: null, currentVersionId: { not: null },
  }, data: { voidedAt: new Date(), voidReason: 'Reemplazado por una nueva versión del estampo', voidedByUserId: context.userId } })
}

export async function rememberStampSigningWait(tx: Prisma.TransactionClient, officeId: number,
  doc: { id: string; sourceTemplate: Prisma.JsonValue }) {
  const template = doc.sourceTemplate as Prisma.JsonObject | null
  if (template?.signDigitally !== true) return
  const state = (await notificationSigningStates(tx, officeId, [doc.id])).get(doc.id)
  if (state?.tokenMissing) await tx.documento.update({ where: { id: doc.id },
    data: { sourceTemplate: { ...template, signingTokenMissing: true } } })
}

export async function notificationSigningStates(tx: Pick<Prisma.TransactionClient, 'documento' | 'signingDevice'>,
  officeId: number, documentIds: string[]) {
  if (!documentIds.length) return new Map<string, { requested: boolean; pending: boolean; tokenMissing: boolean }>()
  const [docs, devices] = await Promise.all([
    tx.documento.findMany({ where: { officeId, id: { in: documentIds }, voidedAt: null }, select: {
      id: true, sourceTemplate: true, currentVersion: { select: {
        signedSignatures: { select: { id: true } }, sourceSignatures: { select: { id: true } },
        signingItems: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, errorCode: true, signerFingerprint: true } },
      } },
    } }),
    tx.signingDevice.findMany({ where: { officeId, revokedAt: null, role: { in: ['SIGNER', 'SIGNER_RECEIVER'] },
      health: { in: ['TOKEN_READY', 'CERT_EXPIRING'] }, lastHeartbeatAt: { gte: new Date(Date.now() - 90000) },
      OR: [{ certificateExpiresAt: null }, { certificateExpiresAt: { gt: new Date() } }],
    }, select: { certificateThumbprint: true } }),
  ])
  return new Map(docs.map(doc => {
    const template = doc.sourceTemplate as Record<string, unknown> | null
    const version = doc.currentVersion, item = version?.signingItems[0]
    const pending = template?.signDigitally === true && !!version && !version.signedSignatures.length && !version.sourceSignatures.length && item?.status !== 'CANCELLED'
    return [doc.id, { requested: template?.signDigitally === true, pending, tokenMissing: pending && (template?.signingTokenMissing === true || item?.errorCode === 'TOKEN_MISSING' ||
      !devices.some(d => d.certificateThumbprint && (!item || d.certificateThumbprint === item.signerFingerprint))) }]
  }))
}
