import { createHash, createPublicKey, verify } from 'node:crypto'
import { z } from 'zod'

export const DeviceId = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/)
export const Hash = z.string().regex(/^[a-f0-9]{64}$/)
export const Secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
export const Role = z.enum(['SIGNER', 'RECEIVER', 'SIGNER_RECEIVER'])
export const Certificate = z.object({
  fingerprint: Hash, subject: z.string().min(1).max(512), issuer: z.string().min(1).max(512),
  notBefore: z.string().datetime(), expiresAt: z.string().datetime(),
  digitalSignature: z.literal(true),
}).strict()
export const Heartbeat = z.object({
  agentVersion: z.string().regex(/^\d+\.\d+\.\d+$/).max(30), role: Role,
  diskFreeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  lastSuccessfulContactAt: z.string().datetime().nullable(),
  token: z.enum(['MISSING', 'READY', 'DRIVER_MISSING', 'DRIVER_ERROR', 'CERT_MISSING', 'CERT_INVALID', 'CERT_AMBIGUOUS', 'NOT_APPLICABLE']),
  certificate: Certificate.nullable(),
}).strict().superRefine((value, ctx) => {
  if ((value.token === 'READY') !== (value.certificate !== null)) ctx.addIssue({ code: 'custom', message: 'Certificate state mismatch' })
  if ((value.role === 'RECEIVER') !== (value.token === 'NOT_APPLICABLE')) ctx.addIssue({ code: 'custom', message: 'Role state mismatch' })
})
export const Enroll = z.object({ code: Secret, name: z.string().trim().min(1).max(100),
  publicKey: z.string().min(300).max(1000), signature: z.string().min(300).max(700) }).strict()
export const SessionProof = z.object({ deviceId: DeviceId, challengeId: z.string().uuid(), nonce: Secret,
  signature: z.string().min(300).max(700) }).strict()
export const DeviceLease = z.object({ itemId: DeviceId, leaseToken: z.string().uuid() }).strict()
export class DeviceError extends Error {
  constructor(public code: string, public status = 403) { super(code) }
}
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export function publicIdentity(value: string) {
  try {
    const key = createPublicKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'spki' })
    if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength !== 3072) throw new Error()
    const canonical = key.export({ format: 'der', type: 'spki' }).toString('base64')
    if (canonical !== value) throw new Error()
    return canonical
  } catch { throw new DeviceError('INVALID_DEVICE_KEY', 400) }
}
export const enrollmentMessage = (code: string, key: string, name: string) => `NOTIFICA-DEVICE-ENROLL-V1\n${sha256(code)}\n${sha256(Buffer.from(key, 'base64'))}\n${name}`
export const sessionMessage = (id: string, challenge: string, nonce: string) => `NOTIFICA-DEVICE-SESSION-V1\n${id}\n${challenge}\n${nonce}`
export function verifyProof(publicKey: string, message: string, signature: string) {
  try { return verify('sha256', Buffer.from(message, 'utf8'), {
    key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki',
  }, Buffer.from(signature, 'base64')) } catch { return false }
}
export function observedHealth(report: z.infer<typeof Heartbeat>, now: Date) {
  if (report.token === 'MISSING' || report.token === 'NOT_APPLICABLE') return 'AGENT_ONLINE_TOKEN_MISSING' as const
  if (report.token !== 'READY' || !report.certificate || new Date(report.certificate.notBefore) > now) return 'DRIVER_ERROR' as const
  const remaining = new Date(report.certificate.expiresAt).getTime() - now.getTime()
  return remaining <= 0 ? 'CERT_EXPIRED' as const : remaining < 30 * 86400_000 ? 'CERT_EXPIRING' as const : 'TOKEN_READY' as const
}
