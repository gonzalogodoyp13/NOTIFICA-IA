import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { ReceiptFilterSchema, type ReceiptFiltersInput } from '@/lib/validations/recibos'
import { asJsonObject, getString } from '@/lib/utils/json'

export interface ReceiptListRow {
  reciboId: string
  createdAt: string
  rolId: string
  documentoId: string | null
  notificacionId: string | null
  numeroRecibo: string
  rol: string
  tribunal: string
  caratula: string
  gestion: string
  estampoTemplate: string
  estampoTemplateKey: string | null
  resultado: string
  abogado: string
  procurador: string
  banco: string
  valor: number
  fechaRecibo: string
  fechaEjecucion: string | null
  fechaPago: string | null
  estado: 'Pagado' | 'Sin pagar'
  numeroBoleta: string
}

export interface ReceiptListResult {
  rows: ReceiptListRow[]
  summary: { totalRowsShown: number; totalValorShown: number }
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number }
}

export interface ReceiptTemplateOption { key: string; label: string; kind: 'wizard' | 'custom' }

const EMPTY = '-'
const validDocumentWhere = {
  voidedAt: null,
  OR: [{ pdfId: { not: null } }, { currentVersion: { is: { deletedAt: null } } }],
} satisfies Prisma.DocumentoWhereInput

const receiptListInclude = {
  rol: { select: { rol: true, tribunal: { select: { nombre: true } }, demanda: { select: {
    caratula: true,
    abogados: { select: { nombre: true, bancos: { select: { banco: { select: { nombre: true } } } } } },
    procurador: { select: { nombre: true, abogados: { select: { abogado: { select: { bancos: { select: { banco: { select: { nombre: true } } } } } } } } } },
  } } } },
} satisfies Prisma.ReciboInclude

const receiptDiligenceSelect = {
  id: true, meta: true, estadoCobro: true, fechaPago: true, tipo: { select: { nombre: true } },
} satisfies Prisma.DiligenciaSelect

const receiptNotificationSelect = { id: true, meta: true } satisfies Prisma.NotificacionSelect

const templateDocumentSelect = {
  id: true, createdAt: true, notificacionId: true, diligenciaId: true,
  estampoBaseId: true, estampoId: true,
  estampoBase: { select: { nombreVisible: true } },
  estampo: { select: { nombre: true } },
} satisfies Prisma.DocumentoSelect

type ReceiptWithRelations = Prisma.ReciboGetPayload<{ include: typeof receiptListInclude }>
type ReceiptDiligence = Prisma.DiligenciaGetPayload<{ select: typeof receiptDiligenceSelect }>
type ReceiptNotification = Prisma.NotificacionGetPayload<{ select: typeof receiptNotificationSelect }>
type TemplateDocument = Pick<
  Prisma.DocumentoGetPayload<{ select: typeof templateDocumentSelect }>,
  'estampoBaseId' | 'estampoId' | 'estampoBase' | 'estampo'
>

function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
  }
}

function label(value?: string | null) { return value?.trim() || EMPTY }
function unique(values: Array<string | null | undefined>) { return Array.from(new Set(values.map(v => v?.trim()).filter((v): v is string => !!v))) }

function bankLabel(recibo: ReceiptWithRelations) {
  const abogado = recibo.rol?.demanda?.abogados
  const procurador = recibo.rol?.demanda?.procurador
  const values = unique([
    ...(abogado?.bancos ?? []).map(item => item.banco?.nombre),
    ...(procurador?.abogados ?? []).flatMap(item => (item.abogado?.bancos ?? []).map(link => link.banco?.nombre)),
  ])
  return values.length ? values.join(', ') : EMPTY
}

function resultLabel(notification: ReceiptNotification | null | undefined, diligence: ReceiptDiligence | null | undefined) {
  const notificationMeta = asJsonObject(notification?.meta)
  const diligenceMeta = asJsonObject(diligence?.meta)
  return label(
    getString(diligenceMeta?.resultado)?.trim()
      ? getString(diligenceMeta?.resultado)
      : getString(notificationMeta?.resultado)
  )
}

function templateIdentity(document: TemplateDocument | null | undefined): ReceiptTemplateOption | null {
  if (document?.estampoBaseId && document.estampoBase) {
    return { key: `wizard:${document.estampoBaseId}`, label: document.estampoBase.nombreVisible, kind: 'wizard' }
  }
  if (document?.estampoId && document.estampo) {
    return { key: `custom:${document.estampoId}`, label: document.estampo.nombre, kind: 'custom' }
  }
  return null
}

export function parseReceiptFilters(searchParams: URLSearchParams, defaults?: Partial<ReceiptFiltersInput>) {
  const parsed = ReceiptFilterSchema.safeParse({
    procuradorIds: searchParams.getAll('procuradorId').length ? searchParams.getAll('procuradorId') : defaults?.procuradorIds?.map(String),
    bancoIds: searchParams.getAll('bancoId').length ? searchParams.getAll('bancoId') : defaults?.bancoIds?.map(String),
    abogadoIds: searchParams.getAll('abogadoId').length ? searchParams.getAll('abogadoId') : defaults?.abogadoIds?.map(String),
    estados: searchParams.getAll('estado').length ? searchParams.getAll('estado') : defaults?.estados,
    estampoTemplates: searchParams.getAll('estampoTemplate').length ? searchParams.getAll('estampoTemplate') : defaults?.estampoTemplates,
    rol: searchParams.get('rol') ?? defaults?.rol,
    fechaEjecucionDesde: searchParams.get('fechaEjecucionDesde') ?? defaults?.fechaEjecucionDesde,
    fechaEjecucionHasta: searchParams.get('fechaEjecucionHasta') ?? defaults?.fechaEjecucionHasta,
    numeroBoleta: searchParams.get('numeroBoleta') ?? defaults?.numeroBoleta,
    boletaMatch: searchParams.get('boletaMatch') ?? defaults?.boletaMatch ?? 'contains',
    montoMin: searchParams.get('montoMin') ?? defaults?.montoMin,
    montoMax: searchParams.get('montoMax') ?? defaults?.montoMax,
    page: searchParams.get('page') ?? defaults?.page ?? 1,
    pageSize: searchParams.get('pageSize') ?? defaults?.pageSize ?? 25,
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Filtros invalidos.')
  return parsed.data
}

async function scopedFilterIds(officeId: number, filters: ReceiptFiltersInput) {
  const validReceiptDocuments = await prisma.documento.findMany({
    where: { ...validDocumentWhere, tipo: 'Recibo', rol: { officeId } },
    select: { id: true },
  })
  const validDocumentIds = validReceiptDocuments.map(document => document.id)

  let diligenceIds: string[] | undefined
  if (filters.estados.length) {
    const diligences = await prisma.diligencia.findMany({
      where: { estadoCobro: { in: filters.estados }, rol: { officeId } }, select: { id: true },
    })
    diligenceIds = diligences.map(item => item.id)
  }

  let templateLinks: { notificationIds: string[]; diligenceIds: string[] } | undefined
  if (filters.estampoTemplates.length) {
    const wizardIds = filters.estampoTemplates.filter(v => v.startsWith('wizard:')).map(v => Number(v.slice(7))).filter(Number.isInteger)
    const customIds = filters.estampoTemplates
      .filter(v => v.startsWith('custom:') || v.startsWith('legacy:'))
      .map(v => v.slice(v.indexOf(':') + 1))
      .filter(Boolean)
    const documents = await prisma.documento.findMany({
      where: {
        tipo: 'Estampo',
        rol: { officeId },
        AND: [
          validDocumentWhere,
          { OR: [
            ...(wizardIds.length ? [{ estampoBaseId: { in: wizardIds } }] : []),
            ...(customIds.length ? [{ estampoId: { in: customIds } }] : []),
          ] },
        ],
      },
      select: { notificacionId: true, diligenciaId: true },
    })
    templateLinks = {
      notificationIds: unique(documents.map(item => item.notificacionId)),
      diligenceIds: unique(documents.map(item => item.diligenciaId)),
    }
  }
  return { validDocumentIds, diligenceIds, templateLinks }
}

export async function getReceiptTemplateOptions(officeId: number): Promise<ReceiptTemplateOption[]> {
  const documents = await prisma.documento.findMany({
    where: { tipo: 'Estampo', rol: { officeId }, AND: [validDocumentWhere, { OR: [{ estampoBaseId: { not: null } }, { estampoId: { not: null } }] }] },
    select: { estampoBaseId: true, estampoId: true, estampoBase: { select: { nombreVisible: true } }, estampo: { select: { nombre: true } } },
  })
  const map = new Map<string, ReceiptTemplateOption>()
  for (const document of documents) {
    const option = templateIdentity(document)
    if (option) map.set(option.key, option)
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'es'))
}

export async function getReceiptList(
  officeId: number,
  filters: ReceiptFiltersInput,
  options?: { exportAll?: boolean; reciboIds?: string[]; excludedIds?: string[] }
): Promise<ReceiptListResult> {
  const { validDocumentIds, diligenceIds, templateLinks } = await scopedFilterIds(officeId, filters)
  const demandConditions: Prisma.DemandaWhereInput[] = []
  if (filters.abogadoIds.length) demandConditions.push({ abogadoId: { in: filters.abogadoIds } })
  if (filters.procuradorIds.length) demandConditions.push({ procuradorId: { in: filters.procuradorIds } })
  if (filters.bancoIds.length) demandConditions.push({ OR: [
    { abogados: { is: { bancos: { some: { bancoId: { in: filters.bancoIds } } } } } },
    { procurador: { is: { abogados: { some: { abogado: { bancos: { some: { bancoId: { in: filters.bancoIds } } } } } } } } },
  ] })

  const where: Prisma.ReciboWhereInput = {
    documentoId: { in: validDocumentIds },
    ...(options?.reciboIds?.length ? { id: { in: options.reciboIds } } : options?.excludedIds?.length ? { id: { notIn: options.excludedIds } } : {}),
    ...(diligenceIds ? { diligenciaId: { in: diligenceIds } } : {}),
    ...(templateLinks ? { OR: [
      { notificacionId: { in: templateLinks.notificationIds } },
      { diligenciaId: { in: templateLinks.diligenceIds } },
    ] } : {}),
    ...(filters.fechaEjecucionDesde || filters.fechaEjecucionHasta ? { fechaEjecucion: dateRange(filters.fechaEjecucionDesde, filters.fechaEjecucionHasta) } : {}),
    ...(filters.numeroBoleta ? { numeroBoleta: filters.boletaMatch === 'exact' ? { equals: filters.numeroBoleta, mode: 'insensitive' } : { contains: filters.numeroBoleta, mode: 'insensitive' } } : {}),
    ...(filters.montoMin !== undefined || filters.montoMax !== undefined ? { monto: { ...(filters.montoMin !== undefined ? { gte: filters.montoMin } : {}), ...(filters.montoMax !== undefined ? { lte: filters.montoMax } : {}) } } : {}),
    rol: {
      officeId,
      ...(filters.rol ? { rol: { contains: filters.rol, mode: 'insensitive' } } : {}),
      ...(demandConditions.length ? { demanda: { is: { AND: demandConditions } } } : {}),
    },
  }

  const totalRows = await prisma.recibo.count({ where })
  const exportAll = options?.exportAll ?? false
  const page = exportAll ? 1 : filters.page
  const pageSize = exportAll ? Math.max(totalRows, 1) : filters.pageSize
  const receipts = await prisma.recibo.findMany({
    where, orderBy: [{ fechaEjecucion: 'desc' }, { fechaRecibo: 'desc' }, { createdAt: 'desc' }],
    skip: exportAll ? 0 : (page - 1) * pageSize, take: pageSize,
    include: receiptListInclude,
  })

  const diligenceIdList = unique(receipts.map(item => item.diligenciaId))
  const notificationIds = unique(receipts.map(item => item.notificacionId))
  const [diligences, notifications, stampDocuments] = await Promise.all([
    diligenceIdList.length ? prisma.diligencia.findMany({ where: { id: { in: diligenceIdList }, rol: { officeId } }, select: receiptDiligenceSelect }) : [],
    notificationIds.length ? prisma.notificacion.findMany({ where: { id: { in: notificationIds }, diligencia: { rol: { officeId } } }, select: receiptNotificationSelect }) : [],
    (diligenceIdList.length || notificationIds.length) ? prisma.documento.findMany({
      where: { tipo: 'Estampo', rol: { officeId }, AND: [validDocumentWhere, { OR: [{ notificacionId: { in: notificationIds } }, { diligenciaId: { in: diligenceIdList } }] }] },
      select: templateDocumentSelect,
      orderBy: { createdAt: 'desc' },
    }) : [],
  ])
  const diligenceMap = new Map(diligences.map(item => [item.id, item]))
  const notificationMap = new Map(notifications.map(item => [item.id, item]))

  const rows = receipts.map(receipt => {
    const diligence = receipt.diligenciaId ? diligenceMap.get(receipt.diligenciaId) : null
    const notification = receipt.notificacionId ? notificationMap.get(receipt.notificacionId) : null
    const stamp = stampDocuments.find(doc => receipt.notificacionId && doc.notificacionId === receipt.notificacionId)
      ?? stampDocuments.find(doc => receipt.diligenciaId && doc.diligenciaId === receipt.diligenciaId)
    const template = templateIdentity(stamp)
    return {
      reciboId: receipt.id, createdAt: receipt.createdAt.toISOString(), rolId: receipt.rolId, documentoId: receipt.documentoId, notificacionId: receipt.notificacionId,
      numeroRecibo: label(receipt.numeroRecibo), rol: label(receipt.rol.rol), tribunal: label(receipt.rol.tribunal?.nombre),
      caratula: label(receipt.rol.demanda?.caratula), gestion: label(diligence?.tipo.nombre), estampoTemplate: template?.label ?? EMPTY,
      estampoTemplateKey: template?.key ?? null, resultado: resultLabel(notification, diligence),
      abogado: label(receipt.rol.demanda?.abogados?.nombre), procurador: label(receipt.rol.demanda?.procurador?.nombre),
      banco: bankLabel(receipt), valor: Number(receipt.monto), fechaRecibo: (receipt.fechaRecibo ?? receipt.createdAt).toISOString(),
      fechaEjecucion: receipt.fechaEjecucion?.toISOString() ?? null, fechaPago: diligence?.fechaPago?.toISOString() ?? null,
      estado: diligence?.estadoCobro === 'PAGADO' ? 'Pagado' as const : 'Sin pagar' as const,
      numeroBoleta: label(receipt.numeroBoleta ?? receipt.ref),
    }
  })
  return {
    rows,
    summary: { totalRowsShown: rows.length, totalValorShown: rows.reduce((sum, row) => sum + row.valor, 0) },
    pagination: { page, pageSize, totalRows, totalPages: exportAll ? 1 : Math.max(1, Math.ceil(totalRows / pageSize)) },
  }
}
