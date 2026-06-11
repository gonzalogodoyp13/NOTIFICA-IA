import 'server-only'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { deriveNotificationCompleteness } from '@/lib/workflow/completeness'
import { deriveNotificationWorkflowState } from '@/lib/workflow/notificationStatus'
import { buildDashboardDateRange, calendarDayDifference } from '@/lib/dashboard/time'
import type {
  DashboardFilters,
  QuickActionKind,
  QuickActionPayload,
  QuickActionRow,
  QuickActionSort,
} from '@/lib/dashboard/types'

function roleFilter(officeId: number, filters: DashboardFilters): Prisma.RolCausaWhereInput {
  const hasDemandFilters = filters.abogadoIds.length > 0 || filters.bancoIds.length > 0 || filters.procuradorIds.length > 0
  return {
    officeId,
    estado: { notIn: ['terminado', 'archivado'] },
    ...(hasDemandFilters ? {
      demanda: { is: {
        ...(filters.abogadoIds.length ? { abogadoId: { in: filters.abogadoIds } } : {}),
        ...(filters.procuradorIds.length ? { procuradorId: { in: filters.procuradorIds } } : {}),
        ...(filters.bancoIds.length ? { abogados: { bancos: { some: { bancoId: { in: filters.bancoIds } } } } } : {}),
      } },
    } : {}),
  }
}

function dateRange(filters: DashboardFilters) {
  const { from, toExclusive } = buildDashboardDateRange(filters.fechaDesde, filters.fechaHasta)
  return from || toExclusive ? { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } : undefined
}

export async function loadQuickActions(params: {
  officeId: number
  filters: DashboardFilters
  kind: QuickActionKind
  sort: QuickActionSort
  offset: number
  limit: number
}): Promise<QuickActionPayload> {
  const notifications = await prisma.notificacion.findMany({
    where: {
      voidedAt: null,
      diligencia: {
        estado: 'pendiente',
        ...(dateRange(params.filters) ? { fecha: dateRange(params.filters) } : {}),
        rol: roleFilter(params.officeId, params.filters),
      },
    },
    include: {
      ejecutado: { include: { comunas: true } },
      documentos: {
        where: { tipo: { in: ['Recibo', 'Estampo'] }, voidedAt: null },
        include: { currentVersion: true },
      },
      diligencia: {
        include: {
          tipo: { select: { nombre: true } },
          rol: {
            include: {
              demanda: {
                include: {
                  abogados: { include: { bancos: { include: { banco: true } } } },
                },
              },
            },
          },
        },
      },
    },
  })

  const now = new Date()
  const rows = notifications.flatMap(notification => {
    const workflow = deriveNotificationWorkflowState(notification.documentos)
    if (workflow.workflowStatus === 'ejecutada') return []
    if (params.kind === 'missingRecibo' && workflow.workflowStatus !== 'nueva') return []
    if (params.kind === 'missingEstampo' && workflow.workflowStatus !== 'recibo_generado') return []

    const completeness = deriveNotificationCompleteness({ notificacion: notification, diligencia: notification.diligencia })
    const documentActivity = notification.documentos.reduce((latest, document) => {
      const timestamp = document.generatedAt ?? document.createdAt
      return timestamp > latest ? timestamp : latest
    }, notification.updatedAt ?? notification.createdAt ?? notification.diligencia.createdAt)
    const notificationMeta = notification.meta && typeof notification.meta === 'object' && !Array.isArray(notification.meta)
      ? notification.meta as Record<string, unknown>
      : {}
    const targetStep: 1 | 2 | 3 = workflow.workflowStatus === 'recibo_generado'
      ? 3
      : notificationMeta.fechaEjecucion ? 2 : 1

    return [{
      notificacionId: notification.id,
      diligenciaId: notification.diligenciaId,
      rolId: notification.diligencia.rol.id,
      rol: notification.diligencia.rol.rol,
      ejecutado: notification.ejecutado?.nombre?.trim() || 'Sin ejecutado',
      diligenciaTipo: notification.diligencia.tipo.nombre,
      scheduledAt: notification.diligencia.fecha.toISOString(),
      latestActivityAt: documentActivity.toISOString(),
      workflowStatus: workflow.workflowStatus,
      targetStep,
      blockers: completeness.missingFields,
      overdueDays: Math.max(0, calendarDayDifference(notification.diligencia.fecha, now)),
    } satisfies QuickActionRow]
  })

  rows.sort((left, right) => {
    const direction = params.sort === 'recent' ? -1 : 1
    const leftTime = params.sort === 'overdue' ? Date.parse(left.scheduledAt) : Date.parse(left.latestActivityAt)
    const rightTime = params.sort === 'overdue' ? Date.parse(right.scheduledAt) : Date.parse(right.latestActivityAt)
    return (leftTime - rightTime) * direction || left.notificacionId.localeCompare(right.notificacionId)
  })

  const page = rows.slice(params.offset, params.offset + params.limit)
  return {
    kind: params.kind,
    sort: params.sort,
    total: rows.length,
    rows: page,
    nextOffset: params.offset + page.length < rows.length ? params.offset + page.length : null,
  }
}
