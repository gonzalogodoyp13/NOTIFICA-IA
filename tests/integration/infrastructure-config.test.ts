import { describe, expect, it } from 'vitest'

import {
  describeDatabaseUrl,
  validateDatabaseConfiguration,
} from '../../lib/infrastructure/databaseConfig'

const ref = 'abcdefghijklmnopqrst'
const otherRef = 'zyxwvutsrqponmlkjihg'
const runtimeUrl = `postgresql://postgres.${ref}:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=10&connect_timeout=10&sslmode=require`
const sessionUrl = `postgresql://postgres.${ref}:secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`
const directUrl = `postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres?sslmode=require`
const supabaseUrl = `https://${ref}.supabase.co`

describe('database infrastructure configuration', () => {
  it('recognizes Supavisor transaction, session, and direct connections safely', () => {
    expect(describeDatabaseUrl(runtimeUrl)).toMatchObject({ mode: 'transaction-pooler', port: 6543, projectRef: ref })
    expect(describeDatabaseUrl(sessionUrl)).toMatchObject({ mode: 'session-pooler', port: 5432, projectRef: ref })
    expect(describeDatabaseUrl(directUrl)).toMatchObject({ mode: 'direct', port: 5432, projectRef: ref })
    expect(JSON.stringify(describeDatabaseUrl(runtimeUrl))).not.toContain('secret')
  })

  it('accepts the production pooled-runtime and session-migration contract', () => {
    const result = validateDatabaseConfiguration({
      databaseUrl: runtimeUrl,
      directUrl: sessionUrl,
      supabaseUrl,
      environment: 'production',
      configuredRegion: 'gru1',
      runtimeRegion: 'gru1',
    })
    expect(result.errors).toEqual([])
  })

  it('accepts a direct migration endpoint', () => {
    const result = validateDatabaseConfiguration({
      databaseUrl: runtimeUrl, directUrl, supabaseUrl, environment: 'production',
    })
    expect(result.errors).toEqual([])
  })

  it('rejects direct runtime and transaction-mode migrations in production', () => {
    const result = validateDatabaseConfiguration({
      databaseUrl: directUrl, directUrl: runtimeUrl, supabaseUrl, environment: 'production',
    })
    expect(result.errors).toContain('Production DATABASE_URL must use Supavisor transaction mode on port 6543.')
    expect(result.errors).toContain('DIRECT_URL must use a direct endpoint or Supavisor session mode on port 5432.')
  })

  it('rejects missing, malformed, mismatched-project, and mismatched-region values', () => {
    const missing = validateDatabaseConfiguration({})
    expect(missing.errors).toHaveLength(3)

    const malformed = validateDatabaseConfiguration({ databaseUrl: 'not-a-url', directUrl: 'also-bad', supabaseUrl: 'bad' })
    expect(malformed.errors).toHaveLength(3)

    const mismatch = validateDatabaseConfiguration({
      databaseUrl: runtimeUrl,
      directUrl: `postgresql://postgres.${otherRef}:secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
      supabaseUrl,
      environment: 'production',
      configuredRegion: 'gru1',
      runtimeRegion: 'iad1',
    })
    expect(mismatch.errors).toContain('Database, migration, and Supabase service configuration reference different projects.')
    expect(mismatch.errors).toContain('Configured Vercel region does not match VERCEL_REGION at runtime.')
  })

  it('requires all production pooling parameters', () => {
    const incomplete = `postgresql://postgres.${ref}:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require`
    const result = validateDatabaseConfiguration({ databaseUrl: incomplete, directUrl: sessionUrl, supabaseUrl, environment: 'production' })
    expect(result.errors).toEqual(expect.arrayContaining([
      'Production DATABASE_URL must set pgbouncer=true.',
      'Production DATABASE_URL must set connection_limit=1.',
      'Production DATABASE_URL must set pool_timeout=10.',
      'Production DATABASE_URL must set connect_timeout=10.',
    ]))
  })
})
