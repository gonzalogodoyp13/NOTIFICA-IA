import 'server-only'

import { prisma } from '@/lib/prisma'
import {
  FALLBACK_SMART_RECIBOS_TEMPLATE,
  SMART_RECIBOS_TEMPLATE_KEY,
  buildTemplatePayload,
} from '@/lib/recibos/email-template-core'

export async function officeNameForTemplate(officeId: number, fallback?: string | null) {
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { nombre: true } })
  return office?.nombre?.trim() || fallback?.trim() || 'Oficina'
}

export async function loadSmartRecibosTemplate(officeId: number) {
  const template = await prisma.emailTemplate.findUnique({
    where: { officeId_key: { officeId, key: SMART_RECIBOS_TEMPLATE_KEY } },
    select: { subject: true, body: true },
  })
  if (!template) {
    return buildTemplatePayload({
      subject: FALLBACK_SMART_RECIBOS_TEMPLATE.subject,
      body: FALLBACK_SMART_RECIBOS_TEMPLATE.body,
      source: 'fallback',
    })
  }
  return buildTemplatePayload({ subject: template.subject, body: template.body, source: 'saved' })
}

export async function saveSmartRecibosTemplate(params: {
  officeId: number
  userId: string
  subject: string
  body: string
}) {
  const template = await prisma.emailTemplate.upsert({
    where: { officeId_key: { officeId: params.officeId, key: SMART_RECIBOS_TEMPLATE_KEY } },
    create: {
      officeId: params.officeId,
      key: SMART_RECIBOS_TEMPLATE_KEY,
      subject: params.subject,
      body: params.body,
      updatedByUserId: params.userId,
    },
    update: {
      subject: params.subject,
      body: params.body,
      updatedByUserId: params.userId,
    },
    select: { subject: true, body: true },
  })
  return buildTemplatePayload({ subject: template.subject, body: template.body, source: 'saved' })
}
