import ExcelJS from 'exceljs'
import type { ActivityEvent, User } from '@prisma/client'

import { formatChileDateTime } from './chileTime'
import { classifyActivityAction } from '@/lib/audit/classification'

type EventWithUser = ActivityEvent & { user: Pick<User, 'email'> | null }

export type DailyReportWorkbookInput = {
  officeName: string
  periodDate: string
  periodStart: Date
  periodEnd: Date
  events: EventWithUser[]
  generatedAt: Date
}

const RESULT_LABELS: Record<string, string> = {
  success: 'Exito',
  failure: 'Error',
  denied: 'Denegado',
}

const MODULE_LABELS: Record<string, string> = {
  auth: 'Autenticacion',
  search: 'Busquedas',
  roles: 'Roles y demandas',
  demandas: 'Roles y demandas',
  diligencias: 'Diligencias',
  notificaciones: 'Notificaciones',
  documents: 'Documentos y descargas',
  recibos: 'Recibos',
  payments: 'Pagos y boletas',
  emails: 'Correos',
  audit: 'Auditoria',
  settings: 'Ajustes',
  security: 'Seguridad',
  reports: 'Reportes',
  system: 'Sistema',
}

const SHEET_DEFS = [
  { name: 'Actividad', filter: () => true },
  { name: 'Creaciones', filter: (event: EventWithUser) => classifyActivityAction(event.eventType, event.description) === 'CREATE' },
  { name: 'Modificaciones', filter: (event: EventWithUser) => classifyActivityAction(event.eventType, event.description) === 'UPDATE' },
  { name: 'Eliminaciones', filter: (event: EventWithUser) => classifyActivityAction(event.eventType, event.description) === 'DELETE' },
  { name: 'Documentos y descargas', filter: (event: EventWithUser) => event.module === 'documents' || /document\./.test(event.eventType) },
  { name: 'Correos', filter: (event: EventWithUser) => event.module === 'emails' || /email|send|reply|receipt\.(send|resend|test)/.test(event.eventType) },
  { name: 'Pagos y boletas', filter: (event: EventWithUser) => event.module === 'payments' || /receipt\.(payment|boleta|undo|export)/.test(event.eventType) },
  { name: 'Errores', filter: (event: EventWithUser) => event.result === 'failure' || event.result === 'denied' },
]

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function scalar(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

export function dailyEventDetail(event: Pick<ActivityEvent, 'metadata' | 'eventType' | 'recordType' | 'recordId' | 'rol' | 'shortName'>) {
  const meta = asObject(event.metadata)
  const parts: string[] = []
  const push = (label: string, value: unknown) => {
    const text = scalar(value)
    if (text) parts.push(`${label}: ${text}`)
  }

  push('ROL', event.rol)
  push('Nombre', event.shortName)
  push('Registro', event.recordType)
  push('ID interno', event.recordId)
  push('Cantidad', meta.count ?? meta.resultCount ?? meta.recipientCount)
  push('Pagina', meta.page)
  push('Tamano pagina', meta.pageSize)
  push('Estado', meta.status)
  push('Modo', meta.mode)
  push('Tipo', meta.type ?? meta.documentType ?? meta.recipientType)
  push('Plantilla', meta.template ?? meta.templateMode)
  push('Categoria', meta.category)
  push('Proveedor', meta.provider)
  push('Lote', meta.dispatchBatchId ?? meta.batchId ?? meta.operationId)
  push('Monto total', meta.totalAmount)
  push('Boleta', meta.numeroBoleta)
  push('Fecha pago', meta.fechaPago)

  if (Array.isArray(meta.editedFields)) {
    const fields = meta.editedFields
      .map(item => asObject(item).label || asObject(item).name)
      .filter(Boolean)
      .slice(0, 12)
      .join(', ')
    if (fields) parts.push(`Campos editados: ${fields}`)
  }

  if (Array.isArray(meta.receiptIds)) parts.push(`Recibos afectados: ${meta.receiptIds.length}`)
  if (Array.isArray(meta.maskedEmails)) parts.push(`Correos enmascarados: ${meta.maskedEmails.slice(0, 3).join(', ')}`)

  return parts.join(' | ') || event.eventType
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
}

function configureSheet(sheet: ExcelJS.Worksheet, widths: number[], headerRowNumber: number) {
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width })
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }]
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: widths.length },
  }
  sheet.eachRow((row, index) => {
    if (index >= headerRowNumber) row.alignment = { vertical: 'top', wrapText: true }
  })
}

function addEventSheet(workbook: ExcelJS.Workbook, name: string, events: EventWithUser[]) {
  const sheet = workbook.addWorksheet(name)
  const headers = ['Fecha y hora', 'Usuario', 'Modulo', 'Evento', 'Resultado', 'Tipo registro', 'ID registro', 'ROL', 'Nombre corto', 'Descripcion', 'Detalle']
  const header = sheet.addRow(headers)
  styleHeader(header)
  for (const event of events) {
    sheet.addRow([
      event.occurredAt,
      event.user?.email ?? 'Sistema',
      MODULE_LABELS[event.module] ?? event.module,
      event.eventType,
      RESULT_LABELS[event.result] ?? event.result,
      event.recordType ?? '',
      event.recordId ?? '',
      event.rol ?? '',
      event.shortName ?? '',
      event.description,
      dailyEventDetail(event),
    ])
  }
  if (!events.length) sheet.addRow(['Sin actividad'])
  sheet.getColumn(1).numFmt = 'dd-mm-yyyy hh:mm:ss'
  configureSheet(sheet, [22, 34, 24, 28, 14, 22, 28, 18, 28, 44, 64], 1)
}

function addSummary(workbook: ExcelJS.Workbook, input: DailyReportWorkbookInput) {
  const sheet = workbook.addWorksheet('Resumen')
  sheet.addRow(['Auditoria diaria'])
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF0F172A' } }
  sheet.addRow(['Oficina', input.officeName])
  sheet.addRow(['Fecha reportada', input.periodDate])
  sheet.addRow(['Inicio Chile', formatChileDateTime(input.periodStart)])
  sheet.addRow(['Fin Chile', formatChileDateTime(input.periodEnd)])
  sheet.addRow(['Generado', formatChileDateTime(input.generatedAt)])
  sheet.addRow(['Total actividad', input.events.length])
  sheet.addRow([])
  const header = sheet.addRow(['Categoria', 'Cantidad'])
  styleHeader(header)
  const byResult = new Map<string, number>()
  const byModule = new Map<string, number>()
  for (const event of input.events) {
    byResult.set(event.result, (byResult.get(event.result) ?? 0) + 1)
    byModule.set(event.module, (byModule.get(event.module) ?? 0) + 1)
  }
  for (const [result, count] of Array.from(byResult.entries())) sheet.addRow([RESULT_LABELS[result] ?? result, count])
  sheet.addRow([])
  const moduleHeader = sheet.addRow(['Modulo', 'Cantidad'])
  styleHeader(moduleHeader)
  for (const [module, count] of Array.from(byModule.entries())) sheet.addRow([MODULE_LABELS[module] ?? module, count])
  configureSheet(sheet, [28, 28], 9)
}

function addUserSummary(workbook: ExcelJS.Workbook, events: EventWithUser[]) {
  const sheet = workbook.addWorksheet('Por usuario')
  const header = sheet.addRow(['Usuario', 'Total', 'Exitos', 'Errores', 'Denegados'])
  styleHeader(header)
  const map = new Map<string, { total: number; success: number; failure: number; denied: number }>()
  for (const event of events) {
    const email = event.user?.email ?? 'Sistema'
    const row = map.get(email) ?? { total: 0, success: 0, failure: 0, denied: 0 }
    row.total += 1
    if (event.result === 'success') row.success += 1
    if (event.result === 'failure') row.failure += 1
    if (event.result === 'denied') row.denied += 1
    map.set(email, row)
  }
  for (const [email, row] of Array.from(map.entries())) sheet.addRow([email, row.total, row.success, row.failure, row.denied])
  if (!events.length) sheet.addRow(['Sin actividad'])
  configureSheet(sheet, [34, 12, 12, 12, 12], 1)
}

export async function buildDailyAuditWorkbook(input: DailyReportWorkbookInput) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'NOTIFICA IA'
  workbook.created = input.generatedAt
  workbook.modified = input.generatedAt

  addSummary(workbook, input)
  addUserSummary(workbook, input.events)
  for (const def of SHEET_DEFS) addEventSheet(workbook, def.name, input.events.filter(def.filter))

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
