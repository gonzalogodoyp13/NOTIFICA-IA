// Run under an operator-managed supervisor; independent of browser/signing agents.
// The secret is supplied by the server's environment/secret store, never arguments.
import { randomUUID } from 'node:crypto'
let url
try { url = new URL(process.env.SIGNING_MAINTENANCE_URL ?? 'https://invalid.invalid') }
catch { console.error('SIGNING_MAINTENANCE_CONFIGURATION_REQUIRED'); process.exit(1) }
const secret = process.env.CRON_SECRET
if (!process.env.SIGNING_MAINTENANCE_URL || url.protocol !== 'https:' || url.username || url.password || url.hash || !secret || secret.length < 32) {
  console.error('SIGNING_MAINTENANCE_CONFIGURATION_REQUIRED'); process.exit(1)
}
do {
  let ok = false
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` }, redirect: 'error', signal: AbortSignal.timeout(290000) })
    ok = response.ok
    await response.body?.cancel()
  } catch { /* Fixed diagnostics only. */ }
  console.info(JSON.stringify({ subsystem: 'signing', operation: 'maintenance_dispatch', correlationId: randomUUID(), ok, at: new Date().toISOString() }))
  if (process.argv.includes('--once')) process.exit(ok ? 0 : 1)
  await new Promise(resolve => setTimeout(resolve, 300000))
} while (true)
