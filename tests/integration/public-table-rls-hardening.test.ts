import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

describe('public table RLS hardening', () => {
  const migration = readFileSync(
    join(process.cwd(), 'prisma/migrations/20260827210000_harden_public_table_rls/migration.sql'),
    'utf8',
  ).replace(/\r\n/g, '\n')

  it('makes future public objects opt-in for Data API access', () => {
    expect(migration).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public')
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated, service_role')
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated, service_role')
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC')
  })

  it('enables RLS and removes client grants from every existing public table', () => {
    expect(migration).toContain("c.relkind IN ('r', 'p')")
    expect(migration).toContain("'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY'")
    expect(migration).toContain("'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated'")
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated')
    expect(migration).not.toContain("'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY'")
    expect(migration).not.toContain('CREATE POLICY')
  })

  it('hardens the append-only trigger function', () => {
    expect(migration).toContain("ALTER FUNCTION public.prevent_activity_history_mutation() SET search_path = ''")
    expect(migration).toContain('FROM PUBLIC, anon, authenticated')
  })
})
