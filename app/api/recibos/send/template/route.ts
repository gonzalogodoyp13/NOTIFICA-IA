import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { loadSmartRecibosTemplate, saveSmartRecibosTemplate } from '@/lib/recibos/email-template'
import { ReceiptEmailTemplateSaveSchema } from '@/lib/validations/recibos'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'get receipt email template', async user => {
    return apiSuccess(await loadSmartRecibosTemplate(user.officeId))
  })
}

export async function PUT(req: NextRequest) {
  return withApiUser(req, 'save receipt email template', async user => {
    const input = parseApiInput(ReceiptEmailTemplateSaveSchema, await req.json())
    return apiSuccess(await saveSmartRecibosTemplate({
      officeId: user.officeId,
      userId: user.id,
      subject: input.subject,
      body: input.body,
    }))
  })
}
