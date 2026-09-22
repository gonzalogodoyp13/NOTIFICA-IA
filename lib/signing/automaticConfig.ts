import 'server-only'
import { z } from 'zod'
import { Sha256, SupportedSigningLevel } from './core'

const officeConfig = z.object({
  signerFingerprint: Sha256,
  requestedLevel: SupportedSigningLevel.default('PADES_LT'),
}).strict()
export type AutomaticSigningConfig = z.infer<typeof officeConfig>

/** Rollout is deliberately opt-in until an authenticated signer is available.
 * Configuration is server-only and scoped to each office; never infer a signer
 * from another office, or accept its identity from a completion request.
 */
export function automaticSigningConfig(officeId: number, env: Record<string, string | undefined> = process.env): AutomaticSigningConfig | null {
  if (!env.SIGNING_AUTO_ENQUEUE_ENABLED || env.SIGNING_AUTO_ENQUEUE_ENABLED === 'false') return null
  if (env.SIGNING_AUTO_ENQUEUE_ENABLED !== 'true') throw new Error('Invalid automatic signing configuration')
  try {
    const offices = z.record(z.string().regex(/^[1-9]\d*$/), officeConfig)
      .parse(JSON.parse(env.SIGNING_AUTO_ENQUEUE_OFFICES ?? '{}'))
    return offices[String(officeId)] ?? null
  } catch {
    throw new Error('Invalid automatic signing configuration')
  }
}
