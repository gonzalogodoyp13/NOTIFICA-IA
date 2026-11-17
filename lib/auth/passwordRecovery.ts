import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { createServerSupabaseStorageClient } from '@/lib/supabaseServer'
import { createSystemMailAdapter } from '@/lib/email/system-mailer'
import { RequestSecurityError } from '@/lib/security/request'

async function consumeQuota(identity: string, seconds: number, limit: number) {
  const key = createHash('sha256').update(`password-recovery:${seconds}:${identity}`).digest('hex')
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO device_rate_limits (key, "windowAt", count)
    VALUES (${key}, to_timestamp(floor(extract(epoch from statement_timestamp()) / ${seconds}::int) * ${seconds}::int), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN device_rate_limits."windowAt" = EXCLUDED."windowAt"
        THEN LEAST(device_rate_limits.count + 1, 1000000) ELSE 1 END,
      "windowAt" = EXCLUDED."windowAt" RETURNING count`
  if (rows.length !== 1) throw new RequestSecurityError('SERVICE_UNAVAILABLE', 503)
  return rows[0].count <= limit
}

/** Persistent limits apply equally to registered and unregistered emails. */
export async function allowPasswordRecovery(email: string, ip: string) {
  const [globalAllowed, ipAllowed] = await Promise.all([
    consumeQuota('global', 900, 100),
    consumeQuota(`ip:${ip}`, 900, 10),
  ])
  if (!globalAllowed || !ipAllowed) throw new RequestSecurityError('RATE_LIMITED', 429, 900)
  const [emailAllowed, cooldownAllowed] = await Promise.all([
    consumeQuota(`email:${email}`, 3600, 3),
    consumeQuota(`email:${email}`, 60, 1),
  ])
  return emailAllowed && cooldownAllowed
}

export function passwordRecoverySender() {
  const origin = new URL(process.env.APP_ORIGIN!)
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
    throw new Error('RECOVERY_ORIGIN_NOT_CONFIGURED')
  }
  const mailer = createSystemMailAdapter()
  if (mailer.provider === 'dry-run') throw new Error('RECOVERY_MAIL_NOT_CONFIGURED')
  // This client requires the service credential and never reads browser cookies.
  const auth = createServerSupabaseStorageClient({ requireServiceRole: true, timeoutMs: 15_000 })
  return async (email: string) => {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, isActive: true },
      select: { email: true, authUserId: true },
    })
    if (!user) return
    const { data, error } = await auth.auth.admin.generateLink({ type: 'recovery', email: user.email })
    if (error || !data.properties?.hashed_token || data.user?.id !== user.authUserId) throw new Error('RECOVERY_LINK_FAILED')
    const link = new URL('/auth/set-password', origin)
    link.hash = new URLSearchParams({ type: 'recovery', token_hash: data.properties.hashed_token }).toString()
    await mailer.send({
      to: [user.email],
      subject: 'Restablece tu contraseña de NOTIFICA IA',
      text: `Recibimos una solicitud para restablecer tu contraseña de NOTIFICA IA.\n\nAbre este enlace y elige una nueva contraseña de al menos 12 caracteres:\n${link}\n\nEl enlace es personal, de un solo uso y tiene una vigencia limitada. Si expiró, solicita uno nuevo desde la página de inicio de sesión.\n\nSi no solicitaste este cambio, ignora este correo. Tu contraseña no cambia hasta que completes el proceso.\n\nNOTIFICA IA`,
      attachments: [],
      idempotencyKey: `password-recovery-${randomUUID()}`,
    })
  }
}
