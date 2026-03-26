import { parseEstampoTipo } from '@/lib/estampos/selection'
import { prisma } from '@/lib/prisma'
import { ReceiptFilterSchema, type ReceiptFiltersInput } from '@/lib/validations/recibos'

export interface ReceiptListRow {
  reciboId: string
  rolId: string
  documentoId: string | null
  numeroRecibo: string
  rol: string
  tribunal: string
  caratula: string
  gestion: string
  resultado: string
  abogado: string
  procurador: string
  banco: string
  valor: number
  fechaCreacionRecibo: string
  estado: string
  numeroBoleta: string
}

export interface ReceiptListResult {
  rows: ReceiptListRow[]
  summary: {
    totalRowsShown: number
    totalValorShown: number
  }
  pagination: {
    page: number
    pageSize: number
    totalRows: number
    totalPages: number
  }
}

const EMPTY_VALUE = '-'

function toDateRange(fechaDesde?: string, fechaHasta?: string) {
  if (!fechaDesde || !fechaHasta) {
    return undefined
  }

  return {
    gte: new Date(`${fechaDesde}T00:00:00.000Z`),
    lte: new Date(`${fechaHasta}T23:59:59.999Z`),
  }
}

function normalizeLabel(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : EMPTY_VALUE
}

function dedupe(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map(value => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  )
}

function getBancoLabel(recibo: any) {
  const abogado = recibo.rol?.demanda?.abogados
  const procurador = recibo.rol?.demanda?.procurador

  const bancos = dedupe([
    abogado?.banco?.nombre,
    ...(abogado?.bancos ?? []).map((item: any) => item.banco?.nombre),
    ...(procurador?.bancos ?? []).map((item: any) => item.banco?.nombre),
  ])

  return bancos.length > 0 ? bancos.join(', ') : EMPTY_VALUE
}

function getResultadoLabel(notificacion: any, diligencia: any) {
  const notificacionMeta =
    notificacion?.meta && typeof notificacion.meta === 'object' && !Array.isArray(notificacion.meta)
      ? (notificacion.meta as Record<string, unknown>)
      : null
  const diligenciaMeta =
    diligencia?.meta && typeof diligencia.meta === 'object' && !Array.isArray(diligencia.meta)
      ? (diligencia.meta as Record<string, unknown>)
      : null

  const estampoTipo = parseEstampoTipo(notificacionMeta)

  if (estampoTipo?.kind === 'WIZARD' && estampoTipo.categoria) {
    return estampoTipo.categoria
  }

  if (typeof diligenciaMeta?.resultado === 'string' && diligenciaMeta.resultado.trim()) {
    return diligenciaMeta.resultado.trim()
  }

  if (typeof notificacionMeta?.resultado === 'string' && notificacionMeta.resultado.trim()) {
    return notificacionMeta.resultado.trim()
  }

  return EMPTY_VALUE
}

function getNumeroRecibo(recibo: any, documento: any) {
  if (recibo.numeroRecibo?.trim()) {
    return recibo.numeroRecibo.trim()
  }

  const nombreDocumento = documento?.nombre?.trim()
  if (nombreDocumento?.startsWith('Recibo ')) {
    return nombreDocumento.replace(/^Recibo\s+/, '').trim()
  }

  return EMPTY_VALUE
}

function getEstadoLabel(recibo: any, documento: any, diligencia: any) {
  if (documento?.voidedAt) {
    return 'Anulado'
  }

  if (diligencia?.boletaEstado === 'PAGADO') {
    return 'Pagado'
  }

  if (diligencia?.boletaEstado === 'NO_PAGADO') {
    return 'No pagado'
  }

  return EMPTY_VALUE
}

export function parseReceiptFilters(searchParams: URLSearchParams, defaults?: Partial<ReceiptFiltersInput>) {
  const parsed = ReceiptFilterSchema.safeParse({
    procuradorIds: searchParams.getAll('procuradorId').length
      ? searchParams.getAll('procuradorId')
      : defaults?.procuradorIds?.map(String),
    bancoIds: searchParams.getAll('bancoId').length
      ? searchParams.getAll('bancoId')
      : defaults?.bancoIds?.map(String),
    abogadoIds: searchParams.getAll('abogadoId').length
      ? searchParams.getAll('abogadoId')
      : defaults?.abogadoIds?.map(String),
    rol: searchParams.get('rol') ?? defaults?.rol,
    fechaDesde: searchParams.get('fechaDesde') ?? defaults?.fechaDesde,
    fechaHasta: searchParams.get('fechaHasta') ?? defaults?.fechaHasta,
    page: searchParams.get('page') ?? defaults?.page ?? 1,
    pageSize: searchParams.get('pageSize') ?? defaults?.pageSize ?? 25,
  })

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Filtros invalidos.'
    throw new Error(message)
  }

  return parsed.data
}

export async function getReceiptList(
  officeId: number,
  filters: ReceiptFiltersInput,
  options?: { exportAll?: boolean }
): Promise<ReceiptListResult> {
  const exportAll = options?.exportAll ?? false

  const demandaConditions: Record<string, unknown>[] = []

  if (filters.abogadoIds.length > 0) {
    demandaConditions.push({ abogadoId: { in: filters.abogadoIds } })
  }

  if (filters.procuradorIds.length > 0) {
    demandaConditions.push({ procuradorId: { in: filters.procuradorIds } })
  }

  if (filters.bancoIds.length > 0) {
    demandaConditions.push({
      OR: [
        { abogados: { is: { bancoId: { in: filters.bancoIds } } } },
        { abogados: { is: { bancos: { some: { bancoId: { in: filters.bancoIds } } } } } },
        { procurador: { is: { bancos: { some: { bancoId: { in: filters.bancoIds } } } } } },
      ],
    })
  }

  const where: any = {
    rol: {
      officeId,
      ...(filters.rol
        ? {
            rol: {
              contains: filters.rol,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(demandaConditions.length > 0
        ? {
            demanda: {
              is: {
                AND: demandaConditions,
              },
            },
          }
        : {}),
    },
    ...(filters.fechaDesde && filters.fechaHasta
      ? {
          createdAt: toDateRange(filters.fechaDesde, filters.fechaHasta),
        }
      : {}),
  }

  const totalRows = await prisma.recibo.count({ where })

  const page = exportAll ? 1 : filters.page
  const pageSize = exportAll ? totalRows || filters.pageSize : filters.pageSize
  const skip = exportAll ? 0 : (page - 1) * pageSize

  const recibos = await prisma.recibo.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip,
    take: pageSize,
    include: {
      rol: {
        select: {
          id: true,
          rol: true,
          tribunal: {
            select: {
              nombre: true,
            },
          },
          demanda: {
            select: {
              caratula: true,
              abogados: {
                select: {
                  nombre: true,
                  banco: {
                    select: {
                      id: true,
                      nombre: true,
                    },
                  },
                  bancos: {
                    select: {
                      banco: {
                        select: {
                          id: true,
                          nombre: true,
                        },
                      },
                    },
                  },
                },
              },
              procurador: {
                select: {
                  nombre: true,
                  bancos: {
                    select: {
                      banco: {
                        select: {
                          id: true,
                          nombre: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  const diligenciaIds = Array.from(
    new Set(
      recibos
        .map(recibo => recibo.diligenciaId)
        .filter((value): value is string => Boolean(value))
    )
  )
  const notificacionIds = Array.from(
    new Set(
      recibos
        .map(recibo => recibo.notificacionId)
        .filter((value): value is string => Boolean(value))
    )
  )
  const documentoIds = Array.from(
    new Set(
      recibos
        .map(recibo => recibo.documentoId)
        .filter((value): value is string => Boolean(value))
    )
  )

  const [diligencias, notificaciones, documentos] = await Promise.all([
    diligenciaIds.length > 0
      ? prisma.diligencia.findMany({
          where: { id: { in: diligenciaIds } },
          select: {
            id: true,
            meta: true,
            boletaEstado: true,
            tipo: {
              select: {
                nombre: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    notificacionIds.length > 0
      ? prisma.notificacion.findMany({
          where: { id: { in: notificacionIds } },
          select: {
            id: true,
            meta: true,
          },
        })
      : Promise.resolve([]),
    documentoIds.length > 0
      ? prisma.documento.findMany({
          where: { id: { in: documentoIds } },
          select: {
            id: true,
            nombre: true,
            voidedAt: true,
          },
        })
      : Promise.resolve([]),
  ])

  const diligenciaMap = new Map(diligencias.map(diligencia => [diligencia.id, diligencia]))
  const notificacionMap = new Map(notificaciones.map(notificacion => [notificacion.id, notificacion]))
  const documentoMap = new Map(documentos.map(documento => [documento.id, documento]))

  const rows = recibos.map(recibo => {
    const diligencia = recibo.diligenciaId ? diligenciaMap.get(recibo.diligenciaId) : null
    const notificacion = recibo.notificacionId ? notificacionMap.get(recibo.notificacionId) : null
    const documento = recibo.documentoId ? documentoMap.get(recibo.documentoId) : null

    return {
      reciboId: recibo.id,
      rolId: recibo.rolId,
      documentoId: recibo.documentoId ?? null,
      numeroRecibo: getNumeroRecibo(recibo, documento),
      rol: normalizeLabel(recibo.rol?.rol),
      tribunal: normalizeLabel(recibo.rol?.tribunal?.nombre),
      caratula: normalizeLabel(recibo.rol?.demanda?.caratula),
      gestion: normalizeLabel(diligencia?.tipo?.nombre),
      resultado: getResultadoLabel(notificacion, diligencia),
      abogado: normalizeLabel(recibo.rol?.demanda?.abogados?.nombre),
      procurador: normalizeLabel(recibo.rol?.demanda?.procurador?.nombre),
      banco: getBancoLabel(recibo),
      valor: Number(recibo.monto ?? 0),
      fechaCreacionRecibo: recibo.createdAt.toISOString(),
      estado: getEstadoLabel(recibo, documento, diligencia),
      numeroBoleta: normalizeLabel(recibo.numeroBoleta ?? recibo.ref),
    }
  })

  const totalPages = exportAll ? 1 : Math.max(1, Math.ceil(totalRows / pageSize))

  return {
    rows,
    summary: {
      totalRowsShown: rows.length,
      totalValorShown: rows.reduce((sum, row) => sum + row.valor, 0),
    },
    pagination: {
      page,
      pageSize,
      totalRows,
      totalPages,
    },
  }
}
