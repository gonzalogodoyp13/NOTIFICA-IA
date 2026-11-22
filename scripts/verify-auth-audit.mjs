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
    const diagnosticIntake = file === path.join('app', 'api', 'diagnostics', 'browser', 'route.ts')
      && source.includes('requireSameOrigin(request)') && source.includes('boundRequestBody(request, 4096)')
      && source.includes('resolveAuthenticatedUser()') && source.includes('quota.count > 120')
    const operationsRoute = file === path.join('app', 'api', 'operaciones', '[[...path]]', 'route.ts')
      && source.includes('requirePlatformOwner(') && source.includes('withRequestTiming(')
    const publicHealth = file === path.join('app', 'api', 'health', 'route.ts') && source.includes('publicHealth()') && source.includes('withRequestTiming(')
    const ownerVerification=file===path.join('app','api','auth','owner-verification','route.ts')&&source.includes('resolveProvisionedUser()')&&source.includes('ownerEmailIdentity(user,grant)')&&source.includes('requireSameOrigin(request)')&&source.includes('withRequestTiming(')
    const passwordRecovery=file===path.join('app','api','auth','forgot-password','route.ts')&&source.includes('allowPasswordRecovery(')&&source.includes('requireSameOrigin(request)')&&source.includes('boundRequestBody(request)')&&source.includes('withRequestTiming(')
    const allowedWithoutUser = diagnosticIntake || operationsRoute || publicHealth || ownerVerification || passwordRecovery || file.includes(path.join('api', 'internal'))
      || ['update-manifest', 'update-download'].some(name => file === path.join('app', 'api', 'signing', 'device', name, 'route.ts') && source.includes('withRequestTiming'))
      || file === path.join('app', 'api', 'ping', 'route.ts')
      || (file === path.join('app', 'api', 'signing', 'device', '[action]', 'route.ts')
        && source.includes('createDeviceHandler')
        && source.includes("return withRequestTiming(req, 'signing.device', () => handleDeviceRequest(req, params.action))"))
    if (hasHandler && !allowedWithoutUser && !source.includes('withApiUser')) {
      failures.push(`${file}: protected route does not use withApiUser`)
    }
    if (!diagnosticIntake && !operationsRoute && !ownerVerification && /from ['"]@\/lib\/auth-server['"]/.test(source)) {
      failures.push(`${file}: protected route imports an authentication resolver directly`)
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`Auth/audit static verification passed (${checkedFiles.length} files).`)
