import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { loadEnvConfig } from '@next/env'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

import { AUTH_STATE_PATH, resolveQaUser } from './qa-support'

loadEnvConfig(process.cwd())

type StoredCookie = {
  name: string
  value: string
  options?: {
    domain?: string
    path?: string
    maxAge?: number
    httpOnly?: boolean
    secure?: boolean
    sameSite?: boolean | 'lax' | 'strict' | 'none'
  }
}

function assertQaMutationGuard() {
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT?.trim().toLowerCase()
  if (!environment || !['local', 'test', 'qa'].includes(environment) || process.env.QA_ALLOW_MUTATIONS !== 'true') {
    throw new Error('QA auth state generation requires NEXT_PUBLIC_ENVIRONMENT=local|test|qa and QA_ALLOW_MUTATIONS=true.')
  }
}

async function main() {
  assertQaMutationGuard()
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Supabase URL, anon key, and service role key are required for QA authentication.')
  }

  const prisma = new PrismaClient()
  try {
    const user = await resolveQaUser(prisma)
    if (!user.isActive) throw new Error('The QA user must be active before creating an authenticated state.')

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const generated = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email })
    if (generated.error || !generated.data.properties?.hashed_token) {
      throw generated.error ?? new Error('Supabase did not return a QA authentication token.')
    }
    if (generated.data.user?.id !== user.authUserId) {
      throw new Error('The generated Supabase identity does not match the linked local QA user.')
    }

    const cookies: StoredCookie[] = []
    const client = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll: () => cookies.map(({ name, value }) => ({ name, value })),
        setAll: nextCookies => {
          for (const next of nextCookies) {
            const index = cookies.findIndex(cookie => cookie.name === next.name)
            if (index >= 0) cookies[index] = next
            else cookies.push(next)
          }
        },
      },
    })
    const verified = await client.auth.verifyOtp({
      type: 'magiclink',
      token_hash: generated.data.properties.hashed_token,
    })
    if (verified.error || verified.data.user?.id !== user.authUserId) {
      throw verified.error ?? new Error('The QA authentication token resolved to the wrong user.')
    }

    const appUrl = new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'http://127.0.0.1:3002')
    const nowSeconds = Math.floor(Date.now() / 1000)
    const storageCookies = cookies
      .filter(cookie => cookie.value)
      .map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.options?.domain ?? appUrl.hostname,
        path: cookie.options?.path ?? '/',
        expires: cookie.options?.maxAge ? nowSeconds + cookie.options.maxAge : -1,
        httpOnly: cookie.options?.httpOnly ?? false,
        secure: cookie.options?.secure ?? appUrl.protocol === 'https:',
        sameSite: cookie.options?.sameSite === 'strict'
          ? 'Strict'
          : cookie.options?.sameSite === 'none'
            ? 'None'
            : 'Lax',
      }))
    if (storageCookies.length === 0) throw new Error('Supabase did not create any session cookies.')

    mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true })
    writeFileSync(AUTH_STATE_PATH, JSON.stringify({ cookies: storageCookies, origins: [] }, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
    console.log(`QA authentication state refreshed for the linked user in office ${user.officeId}.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'QA authentication state generation failed.')
  process.exitCode = 1
})
