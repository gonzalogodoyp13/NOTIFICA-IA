import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const tables = ['report_jobs', 'report_job_runs', 'report_recipient_configs', 'report_schedules', 'custom_report_definitions', 'custom_report_definition_recipients']

async function main() {
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT?.trim().toLowerCase()
  if (!['qa', 'test'].includes(environment ?? '')) throw new Error('Phase 4 report verification is restricted to QA/test.')
  const rls = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
    SELECT relname, relrowsecurity FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relname = ANY(${tables}::text[])
  `
  if (rls.length !== tables.length || rls.some(row => !row.relrowsecurity)) throw new Error('One or more Phase 4 report tables do not have RLS enabled.')
  const grants = await prisma.$queryRaw<Array<{ table_name: string; grantee: string; privilege_type: string }>>`
    SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = ANY(${tables}::text[]) AND grantee IN ('anon', 'authenticated')
  `
  if (grants.length) throw new Error('anon/authenticated still have grants on a Phase 4 report table.')
  const buckets = await prisma.$queryRaw<Array<{ id: string; public: boolean; allowed_mime_types: string[] | null }>>`
    SELECT id, public, allowed_mime_types FROM storage.buckets WHERE id = 'reports'
  `
  const bucket = buckets[0]
  if (!bucket || bucket.public || !bucket.allowed_mime_types?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
    throw new Error('The reports bucket is not private and XLSX-only.')
  }
  const [recipientCount, standardSchedules] = await Promise.all([
    prisma.reportRecipientConfig.count(),
    prisma.reportSchedule.count({ where: { identityKey: { in: ['daily', 'monthly'] }, enabled: false } }),
  ])
  console.log('[reports-phase4] security verification passed', { tables: rls.length, forbiddenGrantCount: grants.length, bucket: bucket.id, recipientCount, disabledStandardSchedules: standardSchedules })
}

main().finally(() => prisma.$disconnect())
