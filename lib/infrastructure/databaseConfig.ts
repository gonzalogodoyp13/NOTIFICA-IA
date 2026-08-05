export type DatabaseConnectionMode =
  | 'direct'
  | 'session-pooler'
  | 'transaction-pooler'
  | 'unknown'

export type SafeDatabaseDescriptor = {
  mode: DatabaseConnectionMode
  hostKind: 'supabase-direct' | 'supabase-pooler' | 'other' | 'invalid'
  port: number | null
  projectRef: string | null
  sslRequired: boolean
  parameters: Record<string, string>
}

export type DatabaseConfigurationInput = {
  databaseUrl?: string
  directUrl?: string
  supabaseUrl?: string
  environment?: string
  configuredRegion?: string
  runtimeRegion?: string
}

export type DatabaseConfigurationResult = {
  errors: string[]
  warnings: string[]
  runtime: SafeDatabaseDescriptor | null
  migrations: SafeDatabaseDescriptor | null
  supabaseProjectRef: string | null
}

const PROJECT_REF_PATTERN = /^[a-z0-9]{15,32}$/i

function normalizedPort(url: URL) {
  if (url.port) return Number(url.port)
  return url.protocol === 'postgres:' || url.protocol === 'postgresql:' ? 5432 : null
}

function projectRefFromUsername(username: string) {
  const decoded = decodeURIComponent(username)
  const suffix = decoded.split('.').at(-1) ?? ''
  return PROJECT_REF_PATTERN.test(suffix) ? suffix.toLowerCase() : null
}

export function describeDatabaseUrl(value?: string): SafeDatabaseDescriptor | null {
  if (!value?.trim()) return null

  try {
    const url = new URL(value)
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      return {
        mode: 'unknown', hostKind: 'invalid', port: null, projectRef: null,
        sslRequired: false, parameters: {},
      }
    }

    const hostname = url.hostname.toLowerCase()
    const port = normalizedPort(url)
    const directMatch = hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)
    const isPooler = hostname.endsWith('.pooler.supabase.com')
    const projectRef = directMatch?.[1]?.toLowerCase() ?? projectRefFromUsername(url.username)
    const mode: DatabaseConnectionMode = directMatch && port === 5432
      ? 'direct'
      : isPooler && port === 6543
        ? 'transaction-pooler'
        : isPooler && port === 5432
          ? 'session-pooler'
          : 'unknown'

    const parameters = Object.fromEntries(
      ['pgbouncer', 'connection_limit', 'pool_timeout', 'connect_timeout', 'sslmode']
        .map((key) => [key, url.searchParams.get(key)])
        .filter((entry): entry is [string, string] => entry[1] !== null)
    )

    return {
      mode,
      hostKind: directMatch ? 'supabase-direct' : isPooler ? 'supabase-pooler' : 'other',
      port,
      projectRef,
      sslRequired: url.searchParams.get('sslmode') === 'require',
      parameters,
    }
  } catch {
    return {
      mode: 'unknown', hostKind: 'invalid', port: null, projectRef: null,
      sslRequired: false, parameters: {},
    }
  }
}

export function projectRefFromSupabaseUrl(value?: string) {
  if (!value?.trim()) return null
  try {
    const match = new URL(value).hostname.match(/^([a-z0-9]+)\.supabase\.co$/i)
    return match?.[1]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

function isProduction(environment?: string) {
  return environment?.trim().toLowerCase() === 'production'
}

export function validateDatabaseConfiguration(
  input: DatabaseConfigurationInput
): DatabaseConfigurationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const runtime = describeDatabaseUrl(input.databaseUrl)
  const migrations = describeDatabaseUrl(input.directUrl)
  const supabaseProjectRef = projectRefFromSupabaseUrl(input.supabaseUrl)
  const strict = isProduction(input.environment)

  if (!runtime) errors.push('DATABASE_URL is required.')
  else if (runtime.hostKind === 'invalid') errors.push('DATABASE_URL is malformed or is not PostgreSQL.')

  if (!migrations) errors.push('DIRECT_URL is required for controlled migrations.')
  else if (migrations.hostKind === 'invalid') errors.push('DIRECT_URL is malformed or is not PostgreSQL.')

  if (!supabaseProjectRef) errors.push('The Supabase project URL is missing or malformed.')

  if (runtime && runtime.hostKind !== 'invalid') {
    if (strict && runtime.mode !== 'transaction-pooler') {
      errors.push('Production DATABASE_URL must use Supavisor transaction mode on port 6543.')
    } else if (!strict && runtime.mode !== 'transaction-pooler') {
      warnings.push('DATABASE_URL is not using Supavisor transaction mode; acceptable only for local transition work.')
    }

    const requiredRuntimeParameters: Record<string, string> = {
      pgbouncer: 'true', connection_limit: '1', pool_timeout: '10', connect_timeout: '10', sslmode: 'require',
    }
    for (const [key, expected] of Object.entries(requiredRuntimeParameters)) {
      if (strict && runtime.parameters[key] !== expected) {
        errors.push(`Production DATABASE_URL must set ${key}=${expected}.`)
      }
    }
  }

  if (migrations && migrations.hostKind !== 'invalid') {
    if (!['direct', 'session-pooler'].includes(migrations.mode)) {
      errors.push('DIRECT_URL must use a direct endpoint or Supavisor session mode on port 5432.')
    }
    if (strict && !migrations.sslRequired) {
      errors.push('Production DIRECT_URL must set sslmode=require.')
    }
  }

  const refs = [runtime?.projectRef, migrations?.projectRef, supabaseProjectRef].filter(Boolean) as string[]
  if (new Set(refs).size > 1) {
    errors.push('Database, migration, and Supabase service configuration reference different projects.')
  }

  if (input.configuredRegion && input.runtimeRegion && input.configuredRegion !== input.runtimeRegion) {
    errors.push('Configured Vercel region does not match VERCEL_REGION at runtime.')
  }

  return { errors, warnings, runtime, migrations, supabaseProjectRef }
}
