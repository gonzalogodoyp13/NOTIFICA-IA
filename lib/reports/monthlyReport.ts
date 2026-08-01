import 'server-only'

import { randomUUID } from 'crypto'
import { Prisma, type GeneratedReport } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { enqueueExternalEvent, processActivityOutbox } from '@/lib/audit/outbox'
import { asJsonObject, getString } from '@/lib/utils/json'
import { chileMonthBounds } from './chileTime'
import { buildMonthlyBillingWorkbook, type MonthlyExclusionDetail, type MonthlyReportRow } from './monthlyWorkbook'
import { MONTHLY_REPORT_TYPE, monthlyFinancialSummary, qualifyMonthlySources } from './monthlyCore'
import { deleteReportFile, uploadMonthlyReportWorkbook } from './storage'

const REPORT_STATUS_READY = 'ready'
const EMPTY = '-'

const receiptInclude = {
  rol: {
    select: {
      id: true,
      rol: true,
      tribunal: { select: { nombre: true } },
      demanda: {
        select: {
          caratula: true,
          abogados: { select: { id: true, nombre: true, email: true, bancos: { select: { banco: { select: { nombre: true } } } } } },
          procurador: { select: { id: true, nombre: true, email: true, abogados: { select: { abogado: { select: { bancos: { select: { banco: { select: { nombre: true } } } } } } } } } },
        },
      },
    },
  },
  documentVersion: { select: { deletedAt: true } },
} satisfies Prisma.ReciboInclude

const diligenceSelect = {
  id: true,
  meta: true,
  estadoCobro: true,
  fechaPago: true,
  tipo: { select: { nombre: true } },
} satisfies Prisma.DiligenciaSelect

const notificationSelect = {
  id: true,
  meta: true,
  voidedAt: true,
  documentos: {
    select: {
      id: true,
      tipo: true,
      pdfId: true,
      currentVersionId: true,
      currentVersion: { select: { deletedAt: true } },
      voidedAt: true,
      createdAt: true,
      estampoBaseId: true,
      estampoId: true,
      estampoBase: { select: { nombreVisible: true } },
      estampo: { select: { nombre: true } },
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.NotificacionSelect

type ReceiptWithRelations = Prisma.ReciboGetPayload<{ include: typeof receiptInclude }>
type DiligenceRow = Prisma.DiligenciaGetPayload<{ select: typeof diligenceSelect }>
type NotificationRow = Prisma.NotificacionGetPayload<{ select: typeof notificationSelect }>

export type MonthlyReportResult =
  | { status: 'generated'; report: GeneratedReport }
  | { status: 'existing'; report: GeneratedReport }
  | { status: 'no_activity'; periodDate: string; periodStart: Date; periodEnd: Date }

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function label(value?: string | null) {
  return value?.trim() || EMPTY
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(value => value?.trim()).filter((value): value is string => !!value)))
}

function bankLabel(recibo: ReceiptWithRelations) {
  const abogado = recibo.rol?.demanda?.abogados
  const procurador = recibo.rol?.demanda?.procurador
  const values = unique([
    ...(abogado?.bancos ?? []).map(item => item.banco?.nombre),
    ...(procurador?.abogados ?? []).flatMap(item => (item.abogado?.bancos ?? []).map(link => link.banco?.nombre)),
  ])
  return values.length ? values.join(', ') : EMPTY
}

function resultLabel(notification: NotificationRow | null | undefined, diligence: DiligenceRow | null | undefined) {
  const notificationMeta = asJsonObject(notification?.meta)
  const diligenceMeta = asJsonObject(diligence?.meta)
  return label(getString(diligenceMeta?.resultado)?.trim() ? getString(diligenceMeta?.resultado) : getString(notificationMeta?.resultado))
}

function templateLabel(notification: NotificationRow | null | undefined) {
  const stamp = notification?.documentos.find(document => document.tipo === 'Estampo')
  return label(stamp?.estampoBase?.nombreVisible ?? stamp?.estampo?.nombre)
}

function toMonthlyRow(receipt: ReceiptWithRelations, diligence: DiligenceRow | null, notification: NotificationRow, qualified: {
  financialClass: MonthlyReportRow['financialClass']
  reconciliationWarnings: string[]
  amount: number
}): MonthlyReportRow {
  return {
    receiptId: receipt.id,
    notificationId: notification.id,
    rolId: receipt.rolId,
    rol: label(receipt.rol.rol),
    tribunal: label(receipt.rol.tribunal?.nombre),
    caratula: label(receipt.rol.demanda?.caratula),
    gestion: label(diligence?.tipo.nombre),
    resultado: resultLabel(notification, diligence),
    estampoTemplate: templateLabel(notification),
    abogado: label(receipt.rol.demanda?.abogados?.nombre),
    procurador: label(receipt.rol.demanda?.procurador?.nombre),
    banco: bankLabel(receipt),
    numeroRecibo: label(receipt.numeroRecibo),
    numeroBoleta: label(receipt.numeroBoleta),
    fechaEjecucion: receipt.fechaEjecucion ?? receipt.createdAt,
    fechaPago: diligence?.fechaPago ?? null,
    estadoCobro: diligence?.estadoCobro ?? 'NO_PAGADO',
    amount: qualified.amount,
    financialClass: qualified.financialClass,
    reconciliationWarnings: qualified.reconciliationWarnings,
  }
}

function exclusionDetail(receipt: ReceiptWithRelations, reason: string): MonthlyExclusionDetail {
  return {
    receiptId: receipt.id,
    notificationId: receipt.notificacionId ?? '',
    rol: label(receipt.rol.rol),
    numeroRecibo: label(receipt.numeroRecibo),
    amount: Math.round(Number(receipt.monto)),
    reason,
  }
}

function nextMetadata(existing: GeneratedReport | null, input: {
  force: boolean
  qualifiedCount: number
  excludedCount: number
  generatedAt: Date
  financialSummary: ReturnType<typeof monthlyFinancialSummary>
}) {
  const previous = existing ? {
    checksumSha256: existing.checksumSha256,
    sizeBytes: existing.sizeBytes,
    storageKey: existing.storageKey,
    generatedAt: existing.generatedAt.toISOString(),
  } : null
  const existingMeta = asJsonObject(existing?.metadata) ?? {}
  const history = Array.isArray(existingMeta.regenerationHistory) ? existingMeta.regenerationHistory.slice(-9) : []
  return {
    generatedFrom: 'Recibo/Notificacion/Documento',
    force: input.force,
    qualifiedNotificationCount: input.qualifiedCount,
    excludedReceiptCount: input.excludedCount,
    financialSummary: input.financialSummary,
    previousChecksum: previous?.checksumSha256 ?? null,
    regenerationHistory: previous ? [...history, previous] : history,
    generatedAt: input.generatedAt.toISOString(),
  }
}

export async function buildMonthlyReportData(officeId: number, bounds: ReturnType<typeof chileMonthBounds>) {
  const receipts = await prisma.recibo.findMany({
    where: {
      status: 'ACTIVE',
      rol: { officeId },
      OR: [
        { fechaEjecucion: { gte: bounds.start, lte: bounds.end } },
        { fechaEjecucion: null, createdAt: { gte: bounds.start, lte: bounds.end } },
      ],
    },
    include: receiptInclude,
    orderBy: [{ fechaEjecucion: 'desc' }, { createdAt: 'desc' }],
  })

  const notificationIds = unique(receipts.map(receipt => receipt.notificacionId))
  const diligenceIds = unique(receipts.map(receipt => receipt.diligenciaId))
  const [notifications, diligences] = await Promise.all([
    notificationIds.length ? prisma.notificacion.findMany({
      where: { id: { in: notificationIds }, diligencia: { rol: { officeId } } },
      select: notificationSelect,
    }) : [],
    diligenceIds.length ? prisma.diligencia.findMany({
      where: { id: { in: diligenceIds }, rol: { officeId } },
      select: diligenceSelect,
    }) : [],
  ])

  const notificationMap = new Map(notifications.map(notification => [notification.id, notification]))
  const diligenceMap = new Map(diligences.map(diligence => [diligence.id, diligence]))
  const coreSources = receipts.map(receipt => {
    const diligence = receipt.diligenciaId ? diligenceMap.get(receipt.diligenciaId) ?? null : null
    return {
      receipt: {
        reciboId: receipt.id,
        notificacionId: receipt.notificacionId,
        documentoId: receipt.documentoId,
        documentVersionDeletedAt: receipt.documentVersion?.deletedAt ?? null,
        createdAt: receipt.createdAt,
        fechaEjecucion: receipt.fechaEjecucion,
        monto: Number(receipt.monto),
      },
      notification: receipt.notificacionId ? (() => {
        const notification = notificationMap.get(receipt.notificacionId)
        return notification ? { id: notification.id, voidedAt: notification.voidedAt, documents: notification.documentos } : null
      })() : null,
      estadoCobro: diligence?.estadoCobro ?? null,
      numeroBoleta: receipt.numeroBoleta ?? null,
    }
  })

  const qualification = qualifyMonthlySources(coreSources)
  const receiptsById = new Map(receipts.map(receipt => [receipt.id, receipt]))
  const qualifiedRows = qualification.qualified
    .map(item => {
      const receipt = receiptsById.get(item.receiptId)
      const notification = notificationMap.get(item.notificationId)
      if (!receipt || !notification) return null
      const diligence = receipt.diligenciaId ? diligenceMap.get(receipt.diligenciaId) ?? null : null
      return toMonthlyRow(receipt, diligence, notification, item)
    })
    .filter((row): row is MonthlyReportRow => !!row)

  const exclusions = qualification.exclusions.map(item => {
    const receipt = receiptsById.get(item.receiptId)
    return receipt ? exclusionDetail(receipt, item.reason) : {
      receiptId: item.receiptId,
      notificationId: item.notificationId,
      rol: '',
      numeroRecibo: '',
      amount: 0,
      reason: item.reason,
    }
  })

  return { qualifiedRows, exclusions }
}

export async function generateMonthlyReport(input: {
  officeId: number
  userId?: string | null
  month: string
  force?: boolean
  requestId?: string
}): Promise<MonthlyReportResult> {
  const bounds = chileMonthBounds(input.month)
  const existing = await prisma.generatedReport.findUnique({
    where: {
      officeId_reportType_periodStart_periodEnd: {
        officeId: input.officeId,
        reportType: MONTHLY_REPORT_TYPE,
        periodStart: bounds.start,
        periodEnd: bounds.end,
      },
    },
  })
  if (existing && !input.force) return { status: 'existing', report: existing }

  const [office, monthlyData, activityEvents] = await Promise.all([
    prisma.office.findUnique({ where: { id: input.officeId }, select: { nombre: true } }),
    buildMonthlyReportData(input.officeId, bounds),
    prisma.activityEvent.findMany({
      where: { officeId: input.officeId, occurredAt: { gte: bounds.start, lte: bounds.end } },
      include: { user: { select: { email: true } } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    }),
  ])

  if (!monthlyData.qualifiedRows.length) return { status: 'no_activity', periodDate: bounds.isoMonth, periodStart: bounds.start, periodEnd: bounds.end }

  const financialSummary = monthlyFinancialSummary(monthlyData.qualifiedRows)
  const now = new Date()
  const reportId = existing?.id ?? randomUUID()
  const workbook = await buildMonthlyBillingWorkbook({
    officeName: office?.nombre ?? `Oficina ${input.officeId}`,
    periodDate: bounds.isoMonth,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    generatedAt: now,
    rows: monthlyData.qualifiedRows,
    exclusions: monthlyData.exclusions,
    activityEvents,
    deletionEvents: activityEvents.filter(event => /\.delete$/.test(event.eventType) || /void|anul/i.test(`${event.eventType} ${event.description}`)),
    errorEvents: activityEvents.filter(event => event.result === 'failure' || event.result === 'denied'),
  })

  const stored = await uploadMonthlyReportWorkbook({
    buffer: workbook,
    officeId: input.officeId,
    periodDate: bounds.isoMonth,
    reportId,
    upsert: !!existing,
  })

  const data = {
    reportType: MONTHLY_REPORT_TYPE,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    periodDate: bounds.isoMonth,
    timezone: bounds.timezone,
    status: REPORT_STATUS_READY,
    storageBucket: stored.storageBucket,
    storageKey: stored.storageKey,
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    checksumSha256: stored.checksumSha256,
    activityCount: monthlyData.qualifiedRows.length,
    generatedAt: now,
    expiresAt: null,
    createdByUserId: input.userId ?? null,
    generationMode: input.force ? 'manual_force' : 'manual',
    metadata: nextMetadata(existing, {
      force: !!input.force,
      qualifiedCount: monthlyData.qualifiedRows.length,
      excludedCount: monthlyData.exclusions.length,
      financialSummary,
      generatedAt: now,
    }),
  }

  if (existing) {
    const report = await prisma.$transaction(async tx => {
      const updated = await tx.generatedReport.update({ where: { id: existing.id }, data })
      await enqueueExternalEvent(tx, {
        id: input.userId ?? undefined, officeId: input.officeId, requestId: input.requestId,
        actorType: input.userId ? 'USER' : 'SYSTEM', source: input.userId ? 'WEB' : 'SYSTEM',
      }, {
        eventType: 'report.monthly.generated', module: 'reports', result: 'success',
        recordType: 'GeneratedReport', recordId: updated.id, description: 'Reporte mensual generado.',
        deduplicationKey: `report:${updated.id}:${stored.checksumSha256}`,
        metadata: { reportId: updated.id, reportType: updated.reportType, periodDate: updated.periodDate, activityCount: updated.activityCount },
      })
      return updated
    })
    await processActivityOutbox(50).catch(() => undefined)
    return { status: 'generated', report }
  }

  try {
    const report = await prisma.$transaction(async tx => {
      const created = await tx.generatedReport.create({ data: { id: reportId, officeId: input.officeId, ...data } })
      await enqueueExternalEvent(tx, {
        id: input.userId ?? undefined, officeId: input.officeId, requestId: input.requestId,
        actorType: input.userId ? 'USER' : 'SYSTEM', source: input.userId ? 'WEB' : 'SYSTEM',
      }, {
        eventType: 'report.monthly.generated', module: 'reports', result: 'success',
        recordType: 'GeneratedReport', recordId: created.id, description: 'Reporte mensual generado.',
        deduplicationKey: `report:${created.id}:${stored.checksumSha256}`,
        metadata: { reportId: created.id, reportType: created.reportType, periodDate: created.periodDate, activityCount: created.activityCount },
      })
      return created
    })
    await processActivityOutbox(50).catch(() => undefined)
    return { status: 'generated', report }
  } catch (error) {
    if (isUniqueConstraint(error)) {
      await deleteReportFile(stored.storageBucket, stored.storageKey).catch(() => undefined)
      const report = await prisma.generatedReport.findUniqueOrThrow({
        where: {
          officeId_reportType_periodStart_periodEnd: {
            officeId: input.officeId,
            reportType: MONTHLY_REPORT_TYPE,
            periodStart: bounds.start,
            periodEnd: bounds.end,
          },
        },
      })
      return { status: 'existing', report }
    }
    await deleteReportFile(stored.storageBucket, stored.storageKey).catch(() => undefined)
    throw error
  }
}

export async function getMonthlyReportFinancialSummary(input: { officeId: number; month: string }) {
  const bounds = chileMonthBounds(input.month)
  const data = await buildMonthlyReportData(input.officeId, bounds)
  return monthlyFinancialSummary(data.qualifiedRows)
}
