import fs from 'node:fs'
import path from 'node:path'

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : [target]
  })
}

const checkedFiles = ['app', 'lib', 'scripts']
  .flatMap(walk)
  .filter(file => /\.(?:ts|tsx|js|mjs)$/.test(file) && !file.endsWith('verify-auth-audit.mjs'))
const failures = []
const auditReference = /\bprisma\.auditLog\b/
const auditTypeImport = /import\s+(?:type\s+)?\{[^}]*\bAuditLog\b[^}]*\}\s+from\s+['"]@prisma\/client['"]/

for (const route of [
  'app/api/log/route.ts',
  'app/api/logs/route.ts',
  'app/api/logs/summary/route.ts',
  'app/api/logs/export/route.ts',
  'app/api/logs/recent/route.ts',
]) {
  if (fs.existsSync(route)) failures.push(`${route}: retired audit compatibility route still exists`)
}

if (fs.readFileSync('next.config.js', 'utf8').includes('/ajustes/logs')) {
  failures.push('next.config.js: retired /ajustes/logs redirect still exists')
}

const prismaSchema = fs.readFileSync(path.join('prisma', 'schema.prisma'), 'utf8')
if (/model\s+AuditLog\s*\{/.test(prismaSchema) || /\bauditLogs\s+AuditLog\[\]/.test(prismaSchema)) {
  failures.push('prisma/schema.prisma: retired AuditLog model or relation still exists')
}

for (const file of checkedFiles) {
  const source = fs.readFileSync(file, 'utf8')
  if (source.includes('prismaNoMiddleware')) failures.push(`${file}: imports the removed second Prisma client`)
  if (source.includes('auditMiddleware')) failures.push(`${file}: references the removed Prisma audit middleware`)
  if (/\.\$use\s*\(/.test(source)) failures.push(`${file}: registers Prisma middleware`)
  if (auditReference.test(source)) failures.push(`${file}: references retired prisma.auditLog`)
  if (auditTypeImport.test(source)) failures.push(`${file}: imports the retired AuditLog Prisma type`)
  if (file.startsWith(path.join('app', 'api')) && file.endsWith('route.ts')) {
    const hasHandler = /export async function (?:GET|POST|PUT|PATCH|DELETE)/.test(source)
    const allowedWithoutUser = file.includes(path.join('api', 'internal'))
      || file === path.join('app', 'api', 'ping', 'route.ts')
    if (hasHandler && !allowedWithoutUser && !source.includes('withApiUser')) {
      failures.push(`${file}: protected route does not use withApiUser`)
    }
    if (/from ['"]@\/lib\/auth-server['"]/.test(source)) {
      failures.push(`${file}: protected route imports an authentication resolver directly`)
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`Auth/audit static verification passed (${checkedFiles.length} files).`)
