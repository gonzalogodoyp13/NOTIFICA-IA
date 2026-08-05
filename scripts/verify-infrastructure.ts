import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'

import { validateDatabaseConfiguration } from '../lib/infrastructure/databaseConfig'

type Mode = 'static' | 'local' | 'qa' | 'production-read-only'

const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const modeValue = args.find((_, index) => args[index - 1] === '--mode')
  ?? args.find((value) => value.startsWith('--mode='))?.slice('--mode='.length)
  ?? 'local'
const mode = modeValue as Mode
const allowedModes: Mode[] = ['static', 'local', 'qa', 'production-read-only']

if (!allowedModes.includes(mode)) {
  throw new Error(`Unsupported mode: ${modeValue}`)
}

function loadLocalEnvironment() {
  const envPath = path.join(root, '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || process.env[match[1]] !== undefined) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[match[1]] = value
  }
}

if (mode === 'local' || mode === 'static') loadLocalEnvironment()

function walk(directory: string): string[] {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return /\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [fullPath] : []
  })
}

function relative(file: string) {
  return path.relative(root, file).replaceAll('\\', '/')
}

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
}

function runStaticChecks() {
  const errors: string[] = []
  const warnings: string[] = []
  const sourceFiles = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'lib'))]
  const constructors: string[] = []

  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8')
    const constructorCount = source.match(/\bnew\s+PrismaClient\s*\(/g)?.length ?? 0
    constructors.push(...Array.from({ length: constructorCount }, () => relative(file)))
    if (/\$disconnect\s*\(/.test(source)) errors.push(`Request-path Prisma disconnect found in ${relative(file)}.`)
    if (/export\s+const\s+runtime\s*=\s*['"]edge['"]/.test(source) && /(?:@\/lib\/prisma|PrismaClient)/.test(source)) {
      errors.push(`Edge-runtime Prisma usage found in ${relative(file)}.`)
    }
    if (/\bpreferredRegion\b/.test(source)) errors.push(`Route-level region override found in ${relative(file)}.`)
    if (relative(file).startsWith('app/api/') && relative(file).endsWith('/route.ts')
      && !/(?:withApiUser|withRequestTiming)/.test(source)
      && !/^export\s*\{[^}]+\}\s*from\s*['"]/m.test(source)) {
      errors.push(`API route does not use canonical request timing: ${relative(file)}.`)
    }
  }

  if (constructors.length !== 1 || constructors[0] !== 'lib/prisma.ts') {
    errors.push(`Expected one application PrismaClient constructor in lib/prisma.ts; found ${constructors.length}.`)
  }

  if (fs.existsSync(path.join(root, 'app/api/_latency-middleware.ts'))) {
    errors.push('The retired latency helper still exists.')
  }

  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8')
  if (!/directUrl\s*=\s*env\("DIRECT_URL"\)/.test(schema)) errors.push('Prisma datasource does not declare DIRECT_URL.')

  const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8')
  for (const expected of ['DATABASE_URL=', 'DIRECT_URL=', 'NEXT_PUBLIC_SUPABASE_URL=', 'NEXT_PUBLIC_ENVIRONMENT=']) {
    if (!envExample.includes(expected)) errors.push(`.env.example is missing ${expected}.`)
  }

  const vercelPath = path.join(root, 'vercel.json')
  let configuredRegion: string | undefined
  if (!fs.existsSync(vercelPath)) {
    warnings.push('vercel.json is intentionally pending verified Supabase-region selection.')
  } else {
    const vercel = readJson(vercelPath)
    const regions = vercel.regions
    if (!Array.isArray(regions) || regions.length !== 1 || typeof regions[0] !== 'string') {
      errors.push('vercel.json must define exactly one Vercel region.')
    } else {
      configuredRegion = regions[0]
    }
    if (vercel.fluid !== true) errors.push('vercel.json must enable Fluid Compute with fluid=true.')
    const git = vercel.git as { deploymentEnabled?: unknown } | undefined
    const deploymentEnabled = git?.deploymentEnabled
    if (typeof deploymentEnabled !== 'object' || deploymentEnabled === null
      || (deploymentEnabled as Record<string, unknown>).main !== false) {
      errors.push('vercel.json must prevent automatic production deployment from main.')
    }
  }

  return { errors, warnings, configuredRegion }
}

async function main() {
  const staticResult = runStaticChecks()
  const errors = [...staticResult.errors]
  const warnings = [...staticResult.warnings]

  if (mode === 'production-read-only' && !args.includes('--confirm-production')) {
    errors.push('Production verification requires --confirm-production.')
  }
  if ((mode === 'qa' || mode === 'production-read-only') && !staticResult.configuredRegion) {
    errors.push('Deployed verification requires a committed, verified Vercel region.')
  }
  if (mode === 'qa') {
    if (!args.includes('--allow-mutations')) errors.push('QA verification requires --allow-mutations.')
    if (!['qa', 'test'].includes((process.env.NEXT_PUBLIC_ENVIRONMENT ?? '').toLowerCase())) {
      errors.push('QA verification requires NEXT_PUBLIC_ENVIRONMENT=qa or test.')
    }
    if (process.env.QA_ALLOW_MUTATIONS !== 'true') errors.push('QA verification requires QA_ALLOW_MUTATIONS=true.')
  }

  if (mode !== 'static') {
    const strictEnvironment = mode === 'qa' || mode === 'production-read-only' ? 'production' : process.env.NEXT_PUBLIC_ENVIRONMENT
    const config = validateDatabaseConfiguration({
      databaseUrl: process.env.DATABASE_URL,
      directUrl: process.env.DIRECT_URL,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
      environment: strictEnvironment,
      configuredRegion: staticResult.configuredRegion,
      runtimeRegion: process.env.VERCEL_REGION,
    })
    errors.push(...config.errors)
    warnings.push(...config.warnings)

    if (!errors.length) {
      const prisma = new PrismaClient()
      try {
        const rows = await prisma.$queryRaw<Array<{ connection_count: bigint; active_count: bigint }>>`
          SELECT COUNT(*)::bigint AS connection_count,
                 COUNT(*) FILTER (WHERE state = 'active')::bigint AS active_count
          FROM pg_stat_activity
          WHERE datname = current_database()
        `
        const metrics = rows[0]
        console.log('[infrastructure] database connectivity passed', {
          connectionMode: config.runtime?.mode,
          migrationMode: config.migrations?.mode,
          connectionCount: Number(metrics?.connection_count ?? 0),
          activeCount: Number(metrics?.active_count ?? 0),
        })
      } finally {
        await prisma.$disconnect()
      }

      if (mode === 'production-read-only' && process.env.NEXT_PUBLIC_BASE_URL) {
        const response = await fetch(new URL('/api/ping', process.env.NEXT_PUBLIC_BASE_URL))
        if (!response.ok) errors.push(`Production ping returned HTTP ${response.status}.`)
        if (!response.headers.get('server-timing')) errors.push('Production ping is missing Server-Timing.')
        if (!response.headers.get('x-request-id')) errors.push('Production ping is missing x-request-id.')
      }
    }
  }

  for (const warning of warnings) console.warn(`[infrastructure] warning: ${warning}`)
  if (errors.length) {
    for (const error of errors) console.error(`[infrastructure] error: ${error}`)
    process.exitCode = 1
    return
  }
  console.log(`[infrastructure] ${mode} verification passed (${warnings.length} warning(s)).`)
}

main().catch(() => {
  console.error('[infrastructure] verification failed without exposing connection details.')
  process.exitCode = 1
})
