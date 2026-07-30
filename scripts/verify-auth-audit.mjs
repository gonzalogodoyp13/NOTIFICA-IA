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
const auditWrite = /auditLog\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/

for (const file of checkedFiles) {
  const source = fs.readFileSync(file, 'utf8')
  if (source.includes('prismaNoMiddleware')) failures.push(`${file}: imports the removed second Prisma client`)
  if (source.includes('auditMiddleware')) failures.push(`${file}: references the removed Prisma audit middleware`)
  if (/\.\$use\s*\(/.test(source)) failures.push(`${file}: registers Prisma middleware`)
  if (auditWrite.test(source)) failures.push(`${file}: writes to historical AuditLog`)
  if (file.startsWith(path.join('app', 'api')) && file.endsWith('route.ts')) {
    const hasHandler = /export async function (?:GET|POST|PUT|PATCH|DELETE)/.test(source)
    const allowedWithoutUser = file.includes(path.join('api', 'internal'))
      || file === path.join('app', 'api', 'ping', 'route.ts')
      || file === path.join('app', 'api', 'log', 'route.ts')
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
