import 'server-only'
import { DeviceError } from './deviceProtocol'

export function releaseVersion(value: string) {
  if (!/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value)) return null
  return value.split('.').map(Number)
}
export function agentSupported(version: string | null, minimum = process.env.SIGNING_MIN_AGENT_VERSION ?? '0.0.0') {
  const floor = releaseVersion(minimum), actual = releaseVersion(version ?? '0.0.0')
  if (!floor) throw new DeviceError('AGENT_RELEASE_POLICY_INVALID', 503)
  if (!actual) return false
  for (let i = 0; i < 3; i++) if (actual[i] !== floor[i]) return actual[i] > floor[i]
  return true
}
export function requireSupportedAgent(version: string | null) {
  if (!agentSupported(version)) throw new DeviceError('AGENT_UPDATE_REQUIRED', 426)
}
