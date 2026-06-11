import 'server-only'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { deriveNotificationCompleteness } from '@/lib/workflow/completeness'
import { deriveNotificationWorkflowState } from '@/lib/workflow/notificationStatus'
import {
  DASHBOARD_TIMEZONE,
  buildDashboardDateRange,
  calendarDayDifference,
  getOverdueBoundary,
  getRecentDocumentsBoundary,
  isWithinDateRange,
} from '@/lib/dashboard/time'
import type {
  DashboardDocumentRow,
  DashboardFilters,
  DashboardNotificationRow,
  DashboardPayload,
  DashboardReceiptRow,
  DashboardSection,
} from '@/lib/dashboard/types'

const PREVIEW_LIMIT = 10

function demandFilter(filters: DashboardFilters): Prisma.DemandaWhereInput {
  return {
    ...(filters.abogadoIds.length > 0 ? { abogadoId: { in: filters.abogadoIds } } : {}),
    ...(filters.procuradorIds.length > 0 ? { procuradorId: { in: filters.procuradorIds } } : {}),
    ...(filters.bancoIds.length > 0
      ? {
          abogados: {
            bancos: {
              some: { bancoId: { in: filters.bancoIds } },
            },
          },
        }
      : {}),
  }
}

function roleFilter(officeId: number, filters: DashboardFilters): Prisma.RolCausaWhereInput {
  const hasDemandFilters =
    filters.abogadoIds.length > 0 ||
    filters.bancoIds.length > 0 ||
    filters.procuradorIds.length > 0

  return {
    officeId,
    ...(hasDemandFilters ? { demanda: { is: demandFilter(filters) } } : {}),
  }
}

function validStoredDocument(document: {
  pdfId: string | null
  currentVersionId: string | null
  currentVersion: { deletedAt: Date | null } | null
  voidedAt: Date | null
}) {
  return (
    !document.voidedAt &&
    (!!document.pdfId || (!!document.currentVersionId && !document.currentVersion?.deletedAt))
  )
}

function namesFromRole(role: any) {
  const demanda = role?.demanda
  const abogado = demanda?.abogados?.nombre?.trim() || 'Sin abogado'
  const procurador = demanda?.procurador?.nombre?.trim() || 'Sin procurador'
  const bancos = (demanda?.abogados?.bancos ?? [])
    .map((link: any) => link.banco?.nombre?.trim())
    .filter(Boolean)

  return {
    abogado,
    procurador,
    banco: bancos.length > 0 ? bancos.join(', ') : 'Sin banco',
  }
}

function limitRows<T>(rows: T[], section: DashboardSection | undefined, current: DashboardSection) {
  return section === current ? rows : rows.slice(0, PREVIEW_LIMIT)
}

export async function loadDashboardData(params: {
  officeId: number
  filters: DashboardFilters
  section?: DashboardSection
  now?: Date
}): Promise<DashboardPayload> {
  const now = params.now ?? new Date()
  const { officeId, filters, section } = params
  const selectedRoleFilter = roleFilter(officeId, filters)
  const { from, toExclusive } = buildDashboardDateRange(filters.fechaDesde, filters.fechaHasta)
  const overdueBoundary = getOverdueBoundary(now)
  const recentBoundary = getRecentDocumentsBoundary(now)
  const effectiveDocumentFrom = from && from > recentBoundary ? from : recentBoundary
  const selectedDateRange = {
    ...(from ? { gte: from } : {}),
    ...(toExclusive ? { lt: toExclusive } : {}),
  }
  const hasSelectedDateRange = !!from || !!toExclusive
  const recentDocumentDateRange = {
    gte: effectiveDocumentFrom,
    ...(toExclusive ? { lt: toExclusive } : {}),
  }

  const [notifications, receipts, documents, abogados, bancos, procuradores] = await Promise.all([
    prisma.notificacion.findMany({
      where: {
        voidedAt: null,
        diligencia: {
          estado: 'pendiente',
          ...(hasSelectedDateRange ? { fecha: selectedDateRange } : {}),
          rol: selectedRoleFilter,
        },
      },
      include: {
        ejecutado: { select: { nombre: true } },
        documentos: {
          where: {
            tipo: { in: ['Recibo', 'Estampo'] },
            voidedAt: null,
          },
          include: { currentVersion: true },
          orderBy: { createdAt: 'desc' },
        },
        diligencia: {
          include: {
            tipo: { select: { nombre: true } },
            rol: {
              include: {
                demanda: {
                  include: {
                    abogados: { include: { bancos: { include: { banco: true } } } },
                    procurador: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.recibo.findMany({
      where: {
        rol: selectedRoleFilter,
        diligenciaId: { not: null },
        documentoId: { not: null },
        ...(hasSelectedDateRange
          ? {
              OR: [
                { fechaRecibo: selectedDateRange },
                { fechaRecibo: null, createdAt: selectedDateRange },
              ],
            }
          : {}),
      },
      include: {
        documentVersion: true,
        rol: {
          include: {
            demanda: {
              include: {
                abogados: { include: { bancos: { include: { banco: true } } } },
                procurador: true,
              },
            },
          },
        },
      },
      orderBy: [{ fechaRecibo: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.documento.findMany({
      where: {
        rol: selectedRoleFilter,
        tipo: { in: ['Recibo', 'Estampo'] },
        voidedAt: null,
        AND: [
          {
            OR: [
              { pdfId: { not: null } },
              { currentVersion: { is: { deletedAt: null } } },
            ],
          },
          {
            OR: [
              { generatedAt: recentDocumentDateRange },
              { generatedAt: null, createdAt: recentDocumentDateRange },
            ],
          },
        ],
      },
      include: {
        currentVersion: true,
        rol: {
          include: {
            demanda: {
              include: {
                abogados: { include: { bancos: { include: { banco: true } } } },
                procurador: true,
              },
            },
          },
        },
      },
    }),
    prisma.abogado.findMany({
      where: { officeId },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.banco.findMany({
      where: { officeId },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.procurador.findMany({
      where: { officeId, activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ])

  const pendingRows = notifications
    .filter(notification => isWithinDateRange(notification.diligencia.fecha, from, toExclusive))
    .map(notification => {
      const workflow = deriveNotificationWorkflowState(notification.documentos)
      const completeness = deriveNotificationCompleteness({
        notificacion: notification,
        diligencia: notification.diligencia,
      })
      const names = namesFromRole(notification.diligencia.rol)

      return {
        notificacionId: notification.id,
        diligenciaId: notification.diligenciaId,
        rolId: notification.diligencia.rolId,
        rol: notification.diligencia.rol.rol,
        fecha: notification.diligencia.fecha.toISOString(),
        ejecutado: notification.ejecutado?.nombre?.trim() || 'Sin ejecutado',
        diligenciaTipo: notification.diligencia.tipo.nombre,
        workflowStatus: workflow.workflowStatus,
        overdueDays:
          notification.diligencia.fecha < overdueBoundary
            ? calendarDayDifference(notification.diligencia.fecha, now)
            : null,
        incomplete: !completeness.isComplete,
        missingFields: completeness.missingFields,
        ...names,
      } satisfies DashboardNotificationRow
    })
    .sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime())

  const overdueRows = pendingRows
    .filter(row => new Date(row.fecha) < overdueBoundary)
    .sort((left, right) => new Date(left.fecha).getTime() - new Date(right.fecha).getTime())

  const missingEstampoRows = pendingRows.filter(row => row.workflowStatus === 'recibo_generado')

  const receiptDocumentIds = receipts
    .map(receipt => receipt.documentoId)
    .filter((id): id is string => Boolean(id))
  const receiptDiligenciaIds = receipts
    .map(receipt => receipt.diligenciaId)
    .filter((id): id is string => Boolean(id))

  const [receiptDocuments, receiptDiligencias] = await Promise.all([
    receiptDocumentIds.length > 0
      ? prisma.documento.findMany({
          where: { id: { in: receiptDocumentIds }, rol: { officeId } },
          include: { currentVersion: true },
        })
      : Promise.resolve([]),
    receiptDiligenciaIds.length > 0
      ? prisma.diligencia.findMany({
          where: { id: { in: receiptDiligenciaIds }, rol: { officeId } },
          select: { id: true, estadoCobro: true },
        })
      : Promise.resolve([]),
  ])

  const receiptDocumentMap = new Map(receiptDocuments.map(document => [document.id, document]))
  const receiptDiligenciaMap = new Map(receiptDiligencias.map(diligencia => [diligencia.id, diligencia]))

  const unpaidRows = receipts
    .filter(receipt => {
      const businessDate = receipt.fechaRecibo ?? receipt.createdAt
      const document = receipt.documentoId ? receiptDocumentMap.get(receipt.documentoId) : null
      const diligencia = receipt.diligenciaId ? receiptDiligenciaMap.get(receipt.diligenciaId) : null
      return (
        isWithinDateRange(businessDate, from, toExclusive) &&
        diligencia?.estadoCobro === 'NO_PAGADO' &&
        !!document &&
        validStoredDocument(document) &&
        (!receipt.documentVersion || !receipt.documentVersion.deletedAt)
      )
    })
    .map(receipt => ({
      reciboId: receipt.id,
      documentoId: receipt.documentoId!,
      rolId: receipt.rolId,
      rol: receipt.rol.rol,
      numeroRecibo: receipt.numeroRecibo?.trim() || 'Sin numero',
      monto: Number(receipt.monto),
      fechaRecibo: (receipt.fechaRecibo ?? receipt.createdAt).toISOString(),
      numeroBoleta: receipt.numeroBoleta?.trim() || null,
      ...namesFromRole(receipt.rol),
    } satisfies DashboardReceiptRow))
    .sort((left, right) => new Date(right.fechaRecibo).getTime() - new Date(left.fechaRecibo).getTime())

  const recentDocumentRows = documents
    .filter(document => {
      const businessDate = document.generatedAt ?? document.createdAt
      return (
        validStoredDocument(document) &&
        businessDate >= recentBoundary &&
        isWithinDateRange(businessDate, from, toExclusive)
      )
    })
    .map(document => ({
      documentoId: document.id,
      rolId: document.rolId,
      rol: document.rol.rol,
      nombre: document.nombre,
      tipo: document.tipo,
      generatedAt: (document.generatedAt ?? document.createdAt).toISOString(),
      ...namesFromRole(document.rol),
    } satisfies DashboardDocumentRow))
    .sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime())

  return {
    filters,
    generatedAt: now.toISOString(),
    timezone: DASHBOARD_TIMEZONE,
    metrics: {
      pending: pendingRows.length,
      overdue: overdueRows.length,
      unpaid: unpaidRows.length,
      unpaidAmount: unpaidRows.reduce((total, receipt) => total + receipt.monto, 0),
      missingEstampos: missingEstampoRows.length,
      recentDocuments: recentDocumentRows.length,
    },
    rows: {
      pending: limitRows(pendingRows, section, 'pending'),
      overdue: limitRows(overdueRows, section, 'overdue'),
      unpaid: limitRows(unpaidRows, section, 'unpaid'),
      missingEstampos: limitRows(missingEstampoRows, section, 'missingEstampos'),
      recentDocuments: limitRows(recentDocumentRows, section, 'recentDocuments'),
    },
    options: {
      abogados: abogados.map(abogado => ({
        id: abogado.id,
        nombre: abogado.nombre?.trim() || `Abogado ${abogado.id}`,
      })),
      bancos,
      procuradores,
    },
  }
}
