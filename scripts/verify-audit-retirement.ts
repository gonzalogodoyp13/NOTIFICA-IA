import fs from 'node:fs'
import path from 'node:path'

type Stage = 'guarded' | 'removed'

const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const stageValue = args.find((_, index) => args[index - 1] === '--stage')
  ?? args.find(value => value.startsWith('--stage='))?.slice('--stage='.length)
const stage = stageValue as Stage

if (!['guarded', 'removed'].includes(stage)) {
  throw new Error('Use --stage=guarded or --stage=removed.')
}

function loadEnvironmentFile(file: string, overwrite = false) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || (!overwrite && process.env[match[1]] !== undefined)) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[match[1]] = value
  }
}

loadEnvironmentFile(path.join(root, '.env'))
if (args.includes('--mode=qa') || args.some((value, index) => args[index - 1] === '--mode' && value === 'qa')) {
  loadEnvironmentFile(path.join(root, '.env.qa.local'), true)
  if (process.env.NEXT_PUBLIC_ENVIRONMENT !== 'qa' || process.env.QA_ALLOW_MUTATIONS !== 'true') {
    throw new Error('QA verification requires NEXT_PUBLIC_ENVIRONMENT=qa and QA_ALLOW_MUTATIONS=true.')
  }
}

const forbiddenApplicationPatterns = [
  /prisma\.auditLog\b/,
  /Prisma\.AuditLog\b/,
  /\bAuditLog(?:Where|Select|Include|OrderBy|Create|Update|Unchecked|Scalar|GetPayload)/,
]

function walk(directory: string): string[] {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : [target]
  })
}

function verifyRemovedContracts(errors: string[]) {
  const removedPaths = [
    'app/api/log/route.ts',
    'app/api/logs/route.ts',
    'app/api/logs/summary/route.ts',
    'app/api/logs/export/route.ts',
    'app/api/logs/recent/route.ts',
  ]
  for (const relative of removedPaths) {
    if (fs.existsSync(path.join(root, relative))) errors.push(`${relative} still exists.`)
  }

  const sourceFiles = ['app', 'lib', 'scripts']
    .flatMap(directory => walk(path.join(root, directory)))
    .filter(file => /\.(?:ts|tsx|js|mjs)$/.test(file)
      && !file.endsWith('verify-audit-retirement.ts')
      && !file.endsWith('verify-auth-audit.mjs'))
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8')
    for (const pattern of forbiddenApplicationPatterns) {
      if (pattern.test(source)) errors.push(`${path.relative(root, file)} retains an AuditLog runtime reference.`)
    }
  }

  const nextConfig = fs.readFileSync(path.join(root, 'next.config.js'), 'utf8')
  if (nextConfig.includes('/ajustes/logs')) errors.push('The /ajustes/logs redirect still exists.')
}

async function main() {
  const errors: string[] = []
  if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) errors.push('DATABASE_URL and DIRECT_URL are required.')

  if (stage === 'removed') verifyRemovedContracts(errors)
  if (errors.length) throw new Error(errors.join('\n'))

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()
  try {
    const relation = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public.audit_logs') IS NOT NULL AS "exists"
    `
    const exists = relation[0]?.exists === true

    if (stage === 'guarded') {
      if (!exists) errors.push('audit_logs must exist during the guarded stage.')
      if (exists) {
        const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "audit_logs"`
        if (Number(countRows[0]?.count ?? -1) !== 0) errors.push('audit_logs is not empty.')

        const security = await prisma.$queryRaw<Array<{ rls: boolean; guarded: boolean }>>`
          SELECT c.relrowsecurity AS rls,
                 EXISTS (
                   SELECT 1 FROM pg_trigger t
                   WHERE t.tgrelid = c.oid AND t.tgname = 'audit_logs_retired' AND NOT t.tgisinternal
                 ) AS guarded
          FROM pg_class c
          WHERE c.oid = 'public.audit_logs'::regclass
        `
        if (!security[0]?.rls) errors.push('audit_logs RLS is disabled.')
        if (!security[0]?.guarded) errors.push('audit_logs_retired trigger is missing.')

        const grants = await prisma.$queryRaw<Array<{ grantee: string; privilege_type: string }>>`
          SELECT grantee, privilege_type
          FROM information_schema.role_table_grants
          WHERE table_schema = 'public'
            AND table_name = 'audit_logs'
            AND grantee IN ('anon', 'authenticated')
        `
        if (grants.length) errors.push('audit_logs still grants client-role privileges.')
      }

      const events = await prisma.activityEvent.findMany({
        where: { eventType: 'audit.legacy_retired' },
        select: { officeId: true, metadata: true, deduplicationKey: true },
      })
      const allowedKeys = new Set(['policyId', 'strategy', 'deletedCount', 'oldestAt', 'newestAt'])
      for (const event of events) {
        const metadata = event.metadata as Record<string, unknown> | null
        if (!metadata || Object.keys(metadata).some(key => !allowedKeys.has(key))) {
          errors.push(`Office ${event.officeId} retirement evidence contains unapproved metadata.`)
          continue
        }
        if (metadata.policyId !== 'AUDITLOG-DEV-ZERO-RETENTION-V1'
          || metadata.strategy !== 'PURGE_NO_ARCHIVE'
          || !Number.isInteger(metadata.deletedCount)
          || Number(metadata.deletedCount) < 0) {
          errors.push(`Office ${event.officeId} retirement evidence is invalid.`)
        }
        const expectedKey = `auditlog-retirement:AUDITLOG-DEV-ZERO-RETENTION-V1:${event.officeId}`
        if (event.deduplicationKey !== expectedKey) errors.push(`Office ${event.officeId} retirement key is invalid.`)
      }
    } else {
      if (exists) errors.push('audit_logs still exists after the removed stage.')
      const canonical = await prisma.$queryRaw<Array<{ events: boolean; outbox: boolean; append_only: boolean }>>`
        SELECT to_regclass('public.activity_events') IS NOT NULL AS events,
               to_regclass('public.activity_outbox') IS NOT NULL AS outbox,
               EXISTS (
                 SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.activity_events'::regclass
                   AND tgname = 'activity_events_append_only'
                   AND NOT tgisinternal
               ) AS append_only
      `
      if (!canonical[0]?.events || !canonical[0]?.outbox || !canonical[0]?.append_only) {
        errors.push('Canonical ActivityEvent protections are incomplete.')
      }
    }
  } finally {
    await prisma.$disconnect()
  }

  if (errors.length) throw new Error(errors.join('\n'))
  console.log(`Legacy audit retirement verification passed for stage: ${stage}.`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
