import { loadEnvConfig } from '@next/env'
import { Prisma, PrismaClient } from '@prisma/client'
import { createClient, type User as SupabaseUser } from '@supabase/supabase-js'

loadEnvConfig(process.cwd())

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function maskEmail(value: string) {
  const [local, domain] = value.split('@')
  if (!local || !domain) return '[correo invalido]'
  return `${local.slice(0, 2)}***@${domain}`
}

async function listAuthUsers() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const users: SupabaseUser[] = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) break
  }
  return users
}

async function main() {
  const [dbUsers, authUsers] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, authUserId: true } }),
    listAuthUsers(),
  ])

  const byEmail = new Map<string, SupabaseUser[]>()
  for (const authUser of authUsers) {
    const email = normalizeEmail(authUser.email)
    if (!email) continue
    byEmail.set(email, [...(byEmail.get(email) ?? []), authUser])
  }

  const updates: Array<{ id: string; authUserId: string }> = []
  const problems: string[] = []
  for (const dbUser of dbUsers) {
    const matches = byEmail.get(normalizeEmail(dbUser.email)) ?? []
    if (matches.length !== 1) {
      problems.push(`${dbUser.id} (${maskEmail(dbUser.email)}): ${matches.length} coincidencias`)
      continue
    }
    const authUserId = matches[0].id
    if (dbUser.authUserId && dbUser.authUserId !== authUserId) {
      problems.push(`${dbUser.id} (${maskEmail(dbUser.email)}): vinculo existente diferente`)
      continue
    }
    if (!dbUser.authUserId) updates.push({ id: dbUser.id, authUserId })
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', dbUsers: dbUsers.length, authUsers: authUsers.length, updates: updates.length, problems: problems.length }, null, 2))
  if (problems.length) {
    for (const problem of problems) console.error(`- ${problem}`)
    throw new Error('Auth user backfill stopped because every database user must have exactly one Supabase match.')
  }

  if (!apply) {
    console.log('Dry-run complete. Re-run with --apply to persist the verified mappings.')
    return
  }

  await prisma.$transaction(
    updates.map(update => prisma.user.update({
      where: { id: update.id },
      data: { authUserId: update.authUserId },
    }))
  )
  const [{ count: remaining }] = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "users" WHERE "authUserId" IS NULL`
  )
  if (Number(remaining) !== 0) throw new Error(`${remaining} database user(s) remain without authUserId.`)
  console.log(`Applied ${updates.length} mapping(s); every database user is linked.`)
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
