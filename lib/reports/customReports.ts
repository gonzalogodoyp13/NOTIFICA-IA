import 'server-only'

import ExcelJS from 'exceljs'
import { Prisma, type ActivityEvent, type CustomReportDefinition, type User } from '@prisma/client'

import { ApiError } from '@/lib/api/server'
import { classifyActivityAction } from '@/lib/audit/classification'
import { recordBestEffortEvent } from '@/lib/audit/activityEvent'
import { prisma } from '@/lib/prisma'
import { dailyEventDetail } from './dailyWorkbook'
import { chileDayBounds, formatChileDateTime } from './chileTime'
import {
  CUSTOM_REPORT_COLUMN_LABELS,
  CUSTOM_REPORT_COLUMNS,
  CustomDefinitionInputSchema,
  nextScheduleRun,
} from './automationCore'
import { configuredRecipients } from './recipients'
import { persistReportVersion } from './versioning'

type CustomColumn = typeof CUSTOM_REPORT_COLUMNS[number]
type EventWithUser = ActivityEvent & { user: Pick<User, 'email'> | null }

function stringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function actionCategory(event: Pick<ActivityEvent, 'eventType' | 'description'>) {
  if (/\b(read|list|search|lookup|download|view|preview|export)\b/i.test(event.eventType)) return 'READ'
  return classifyActivityAction(event.eventType, event.description)
}

function groupCounts(events: EventWithUser[], key: (event: EventWithUser) => string) {
  const counts = new Map<string, number>()
  for (const event of events) counts.set(key(event), (counts.get(key(event)) ?? 0) + 1)
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

function eventValue(event: EventWithUser, column: CustomColumn) {
  if (column === 'timestamp') return formatChileDateTime(event.occurredAt)
  if (column === 'actor') return event.actorType === 'SYSTEM' ? 'Sistema' : event.user?.email ?? 'Administrador no disponible'
  if (column === 'module') return event.module
  if (column === 'category') return actionCategory(event)
  if (column === 'eventType') return event.eventType
  if (column === 'result') return event.result
  if (column === 'recordType') return event.recordType ?? ''
  if (column === 'recordId') return event.recordId ?? ''
  if (column === 'rol') return event.rol ?? ''
  if (column === 'shortName') return event.shortName ?? ''
  if (column === 'description') return event.description
  return dailyEventDetail(event)
}

async function buildCustomWorkbook(input: {
  definition: CustomReportDefinition
  officeName: string
  periodLabel: string
  periodStart: Date
  periodEnd: Date
  events: EventWithUser[]
  columns: CustomColumn[]
}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'NOTIFICA IA'
  workbook.created = new Date()
  const summary = workbook.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 1 }] })
  summary.columns = [{ width: 30 }, { width: 50 }]
  summary.addRow(['Reporte personalizado', input.definition.name])
  summary.addRow(['Oficina', input.officeName])
  summary.addRow(['Periodo', input.periodLabel])
  summary.addRow(['Inicio Chile', formatChileDateTime(input.periodStart)])
  summary.addRow(['Fin Chile', formatChileDateTime(input.periodEnd)])
  summary.addRow(['Filas de detalle', input.events.length])
  summary.addRow(['Columnas', input.columns.map(column => CUSTOM_REPORT_COLUMN_LABELS[column]).join(', ')])
  summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }

  const grouped = workbook.addWorksheet('Agrupaciones', { views: [{ state: 'frozen', ySplit: 1 }] })
  grouped.columns = [{ width: 22 }, { width: 42 }, { width: 14 }]
  grouped.addRow(['Dimensión', 'Valor', 'Cantidad'])
  for (const [dimension, values] of [
    ['Módulo', groupCounts(input.events, event => event.module)],
    ['Resultado', groupCounts(input.events, event => event.result)],
    ['Categoría', groupCounts(input.events, event => actionCategory(event))],
    ['Actor', groupCounts(input.events, event => event.actorType === 'SYSTEM' ? 'Sistema' : event.user?.email ?? 'Administrador no disponible')],
  ] as const) for (const [value, count] of values) grouped.addRow([dimension, value, count])
  grouped.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  grouped.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
  grouped.autoFilter = { from: 'A1', to: 'C1' }

  const details = workbook.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 1 }] })
  details.columns = input.columns.map(column => ({ header: CUSTOM_REPORT_COLUMN_LABELS[column], key: column, width: column === 'description' || column === 'detail' ? 55 : 24 }))
  for (const event of input.events) details.addRow(Object.fromEntries(input.columns.map(column => [column, eventValue(event, column)])))
  details.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  details.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
  details.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: input.columns.length } }
  details.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true } })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function listCustomDefinitions(officeId: number) {
  return prisma.customReportDefinition.findMany({
    where: { officeId },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }],
    include: {
      recipients: { select: { userId: true } },
      schedule: true,
      _count: { select: { reports: true, jobs: true } },
    },
  })
}

export async function getCustomDefinition(officeId: number, definitionId: string) {
  return prisma.customReportDefinition.findFirst({
    where: { id: definitionId, officeId },
    include: { recipients: { select: { userId: true } }, schedule: true, _count: { select: { reports: true, jobs: true } } },
  })
}

async function validateDefinitionPeople(officeId: number, actorUserIds: string[], recipientUserIds: string[]) {
  const actors = actorUserIds.length ? await prisma.user.count({ where: { officeId, id: { in: actorUserIds } } }) : 0
  if (actors !== new Set(actorUserIds).size) throw new ApiError('VALIDATION_ERROR', 'Uno de los actores seleccionados no pertenece a la oficina.', 400)
  const recipients = await configuredRecipients({ officeId, kind: 'custom', userIds: recipientUserIds })
  if (recipients.length !== new Set(recipientUserIds).size) throw new ApiError('VALIDATION_ERROR', 'Los destinatarios personalizados deben estar habilitados y ser administradores activos.', 400)
}

function scheduleCreateData(officeId: number, definitionId: string, schedule: NonNullable<ReturnType<typeof CustomDefinitionInputSchema.parse>['schedule']>, actorUserId: string) {
  return {
    officeId,
    kind: 'CUSTOM' as const,
    identityKey: `custom:${definitionId}`,
    customDefinitionId: definitionId,
    frequency: schedule.frequency,
    localTime: schedule.localTime,
    weekday: schedule.frequency === 'WEEKLY' ? schedule.weekday ?? 1 : null,
    monthDay: schedule.frequency === 'MONTHLY' ? schedule.monthDay ?? 1 : null,
    timezone: 'America/Santiago',
    enabled: false,
    latenessThresholdMinutes: schedule.latenessThresholdMinutes,
    nextRunAt: nextScheduleRun(schedule),
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
  }
}

export async function createCustomDefinition(input: { officeId: number; actorUserId: string; requestId?: string; value: unknown }) {
  const value = CustomDefinitionInputSchema.parse(input.value)
  await validateDefinitionPeople(input.officeId, value.actorUserIds, value.recipientUserIds)
  const definition = await prisma.$transaction(async tx => {
    const created = await tx.customReportDefinition.create({
      data: {
        officeId: input.officeId,
        name: value.name,
        description: value.description ?? null,
        modules: value.modules,
        actionCategories: value.actionCategories,
        results: value.results,
        actorUserIds: value.actorUserIds,
        includeSystem: value.includeSystem,
        selectedColumns: value.selectedColumns,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId,
        recipients: { create: value.recipientUserIds.map(userId => ({ userId })) },
      },
    })
    if (value.schedule) await tx.reportSchedule.create({ data: scheduleCreateData(input.officeId, created.id, value.schedule, input.actorUserId) })
    return created
  })
  await recordBestEffortEvent({ id: input.actorUserId, officeId: input.officeId, requestId: input.requestId }, {
    eventType: 'report.custom_definition.created', module: 'reports', result: 'success', recordType: 'CustomReportDefinition', recordId: definition.id,
    description: 'Definición de reporte personalizado creada.', metadata: { recipientCount: value.recipientUserIds.length, columnCount: value.selectedColumns.length, scheduled: !!value.schedule },
  })
  return getCustomDefinition(input.officeId, definition.id)
}

export async function updateCustomDefinition(input: { officeId: number; definitionId: string; actorUserId: string; requestId?: string; value: unknown }) {
  const value = CustomDefinitionInputSchema.parse(input.value)
  const current = await getCustomDefinition(input.officeId, input.definitionId)
  if (!current) throw new ApiError('NOT_FOUND', 'La definición no existe.', 404)
  if (current.status === 'ARCHIVED') throw new ApiError('CONFLICT', 'Una definición archivada no se puede editar.', 409)
  await validateDefinitionPeople(input.officeId, value.actorUserIds, value.recipientUserIds)
  await prisma.$transaction(async tx => {
    await tx.customReportDefinition.update({ where: { id: current.id }, data: {
      name: value.name, description: value.description ?? null, modules: value.modules, actionCategories: value.actionCategories,
      results: value.results, actorUserIds: value.actorUserIds, includeSystem: value.includeSystem, selectedColumns: value.selectedColumns, updatedByUserId: input.actorUserId,
    } })
    await tx.customReportDefinitionRecipient.deleteMany({ where: { definitionId: current.id } })
    if (value.recipientUserIds.length) await tx.customReportDefinitionRecipient.createMany({ data: value.recipientUserIds.map(userId => ({ definitionId: current.id, userId })) })
    if (value.schedule) await tx.reportSchedule.upsert({
      where: { customDefinitionId: current.id },
      create: scheduleCreateData(input.officeId, current.id, value.schedule, input.actorUserId),
      update: { frequency: value.schedule.frequency, localTime: value.schedule.localTime, weekday: value.schedule.frequency === 'WEEKLY' ? value.schedule.weekday ?? 1 : null, monthDay: value.schedule.frequency === 'MONTHLY' ? value.schedule.monthDay ?? 1 : null, latenessThresholdMinutes: value.schedule.latenessThresholdMinutes, nextRunAt: nextScheduleRun(value.schedule), updatedByUserId: input.actorUserId },
    })
    else await tx.reportSchedule.deleteMany({ where: { customDefinitionId: current.id, enabled: false } })
  })
  await recordBestEffortEvent({ id: input.actorUserId, officeId: input.officeId, requestId: input.requestId }, {
    eventType: 'report.custom_definition.updated', module: 'reports', result: 'success', recordType: 'CustomReportDefinition', recordId: current.id,
    description: 'Definición de reporte personalizado actualizada.', metadata: { recipientCount: value.recipientUserIds.length, columnCount: value.selectedColumns.length, scheduled: !!value.schedule },
  })
  return getCustomDefinition(input.officeId, current.id)
}

export async function archiveCustomDefinition(input: { officeId: number; definitionId: string; actorUserId: string; requestId?: string }) {
  const current = await getCustomDefinition(input.officeId, input.definitionId)
  if (!current) throw new ApiError('NOT_FOUND', 'La definición no existe.', 404)
  if (current.status === 'ARCHIVED') return current
  await prisma.$transaction([
    prisma.customReportDefinition.update({ where: { id: current.id }, data: { status: 'ARCHIVED', archivedAt: new Date(), updatedByUserId: input.actorUserId } }),
    prisma.reportSchedule.updateMany({ where: { customDefinitionId: current.id }, data: { enabled: false, nextRunAt: null, updatedByUserId: input.actorUserId } }),
  ])
  await recordBestEffortEvent({ id: input.actorUserId, officeId: input.officeId, requestId: input.requestId }, {
    eventType: 'report.custom_definition.archived', module: 'reports', result: 'success', recordType: 'CustomReportDefinition', recordId: current.id,
    description: 'Definición de reporte personalizado archivada.', metadata: { reportCount: current._count.reports },
  })
  return getCustomDefinition(input.officeId, current.id)
}

export async function generateCustomReport(input: {
  officeId: number
  definitionId: string
  periodStart: Date
  periodEnd: Date
  periodLabel: string
  userId?: string | null
  generationMode: string
  requestId?: string
  force?: boolean
  cancellationCheck?: () => Promise<boolean>
}) {
  const definition = await prisma.customReportDefinition.findFirst({ where: { id: input.definitionId, officeId: input.officeId, status: 'ACTIVE' } })
  if (!definition) throw new ApiError('NOT_FOUND', 'La definición activa no existe.', 404)
  if (input.periodEnd <= input.periodStart) throw new ApiError('VALIDATION_ERROR', 'El rango de fechas no es válido.', 400)
  const durationDays = Math.ceil((input.periodEnd.getTime() - input.periodStart.getTime()) / 86400000)
  if (durationDays > 367) throw new ApiError('VALIDATION_ERROR', 'El rango máximo es de 366 días.', 400)
  if (await input.cancellationCheck?.()) throw new ApiError('CONFLICT', 'Trabajo cancelado antes de consultar la actividad.', 409)

  const modules = stringArray(definition.modules)
  const results = stringArray(definition.results)
  const actorUserIds = stringArray(definition.actorUserIds)
  const categories = new Set(stringArray(definition.actionCategories))
  const where: Prisma.ActivityEventWhereInput = {
    officeId: input.officeId,
    occurredAt: { gte: input.periodStart, lte: input.periodEnd },
    ...(modules.length ? { module: { in: modules } } : {}),
    ...(results.length ? { result: { in: results } } : {}),
    ...((actorUserIds.length || !definition.includeSystem) ? {
      OR: [
        ...(actorUserIds.length ? [{ userId: { in: actorUserIds } }] : []),
        ...(definition.includeSystem ? [{ actorType: 'SYSTEM' as const }] : []),
      ],
    } : {}),
  }
  const candidates = await prisma.activityEvent.findMany({
    where,
    include: { user: { select: { email: true } } },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    take: 50_001,
  })
  const events = candidates.filter(event => categories.has(actionCategory(event)))
  if (candidates.length > 50_000 || events.length > 50_000) throw new ApiError('VALIDATION_ERROR', 'El reporte supera 50.000 filas. Acota el rango o los filtros.', 400)
  if (!events.length) return { status: 'no_activity' as const, periodLabel: input.periodLabel }
  if (await input.cancellationCheck?.()) throw new ApiError('CONFLICT', 'Trabajo cancelado antes de construir el archivo.', 409)
  const columns = stringArray(definition.selectedColumns).filter((column): column is CustomColumn => CUSTOM_REPORT_COLUMNS.includes(column as CustomColumn))
  const office = await prisma.office.findUnique({ where: { id: input.officeId }, select: { nombre: true } })
  const generatedAt = new Date()
  const persisted = await persistReportVersion({
    officeId: input.officeId,
    reportType: 'custom',
    identityKey: `custom:${definition.id}`,
    customDefinitionId: definition.id,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    periodDate: input.periodLabel,
    timezone: 'America/Santiago',
    activityCount: events.length,
    generatedAt,
    expiresAt: null,
    generatedByUserId: input.userId ?? null,
    generationMode: input.generationMode,
    metadata: { definitionId: definition.id, definitionName: definition.name, rowCount: events.length, selectedColumns: columns },
    cancellationCheck: input.cancellationCheck,
    requestId: input.requestId,
    buildWorkbook: () => buildCustomWorkbook({ definition, officeName: office?.nombre ?? `Oficina ${input.officeId}`, periodLabel: input.periodLabel, periodStart: input.periodStart, periodEnd: input.periodEnd, events, columns }),
  })
  return { status: 'generated' as const, report: persisted.report }
}

export function customRunBounds(dateFrom: string, dateTo: string) {
  return { start: chileDayBounds(dateFrom).start, end: chileDayBounds(dateTo).end, label: dateFrom === dateTo ? dateFrom : `${dateFrom}_${dateTo}` }
}
