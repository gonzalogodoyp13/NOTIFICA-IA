import 'server-only'

import { prismaNoMiddleware } from '@/lib/prismaNoMiddleware'

export async function recordOperationalActivity(params: {
  userId: string
  officeId: number
  eventType: 'bulk_payment' | 'bulk_boleta' | 'receipt_export'
  rolId?: string
  reciboIds?: string[]
  count: number
  numeroBoleta?: string
  fechaPago?: string
}) {
  try {
    await prismaNoMiddleware.auditLog.create({
      data: {
        userId: params.userId,
        officeId: params.officeId,
        tabla: 'OperationalActivity',
        accion: params.eventType,
        diff: {
          rolId: params.rolId,
          reciboIds: params.reciboIds?.slice(0, 100),
          count: params.count,
          numeroBoleta: params.numeroBoleta,
          fechaPago: params.fechaPago,
        },
      },
    })
  } catch (error) {
    console.error('[operational activity] Could not record event:', error)
  }
}
