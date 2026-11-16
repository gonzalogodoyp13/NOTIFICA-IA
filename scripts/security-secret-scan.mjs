// Read-only heuristic scan. Reports locations/categories, never matched secrets.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import readline from 'node:readline'
import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())
const findings = new Map()
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})/],
  ['provider-secret', /\b(?:sk_live_[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{30,}|sb_secret_[A-Za-z0-9_-]{20,})/],
]
const exactSecrets = Object.entries(process.env).filter(([key, value]) =>
  !key.startsWith('NEXT_PUBLIC_') && /SECRET|TOKEN|PASSWORD|SERVICE_ROLE_KEY|DATABASE_URL|DIRECT_URL/.test(key) && value?.length >= 16)
function inspect(text, location, scope) {
  const categories = patterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
  for (const match of text.matchAll(/postgres(?:ql)?:\/\/[^\s:'"]+:([^\s@'"]{8,})@/g)) {
    if (!/^(?:password|your_password|\[your[-_]password\]|<password>)$/i.test(match[1])) categories.push('database-credential')
  }
  for (const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
    try { if (JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).role === 'service_role') categories.push('service-role-jwt') } catch {}
  }
  for (const [name, secret] of exactSecrets) if (text.includes(secret)) categories.push(`configured-secret:${name}`)
  for (const category of new Set(categories)) findings.set(`${scope}:${location}:${category}`, { scope, location, category })
}
const tracked = execFileSync('git', ['ls-files', '-z'], { maxBuffer: 32 * 1024 * 1024 }).toString().split('\0').filter(Boolean)
let currentFiles = 0, skippedFiles = 0, bundleFiles = 0
for (const file of tracked) {
  try {
    if (fs.statSync(file).size > 5 * 1024 * 1024) { skippedFiles++; continue }
    const bytes = fs.readFileSync(file)
    if (bytes.includes(0)) { skippedFiles++; continue }
    inspect(bytes.toString('utf8'), file, 'tracked-working-tree'); currentFiles++
  } catch { skippedFiles++ }
}
function walk(directory) {
  if (!fs.existsSync(directory)) return
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name)
    if (item.isDirectory()) walk(file)
    else if (/\.(js|json|map|html)$/.test(file)) { inspect(fs.readFileSync(file, 'utf8'), file, 'local-browser-build'); bundleFiles++ }
  }
}
walk('.next/static')
walk('.next-security/static')
const child = spawn('git', ['log', '--all', '--format=SCAN_COMMIT:%H', '--no-ext-diff', '--no-textconv', '-p', '--'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let commit = '', file = '', historyLines = 0, gitError = ''
child.stderr.on('data', chunk => { gitError += chunk.toString() })
const closed = new Promise(resolve => child.on('close', resolve))
for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) {
  if (line.startsWith('SCAN_COMMIT:')) commit = line.slice(12)
  else if (line.startsWith('+++ b/')) file = line.slice(6)
  else if (line.startsWith('+') && !line.startsWith('+++')) { inspect(line.slice(1), `${commit}:${file}`, 'git-history'); historyLines++ }
}
const exitCode = await closed
const report = { heuristicOnly: true, currentFiles, skippedFiles, bundleFiles, historyLines, historyComplete: exitCode === 0,
  historyError: gitError ? 'Git emitted diagnostics; review scan completeness.' : null, findings: [...findings.values()] }
fs.mkdirSync('tmp', { recursive: true })
fs.writeFileSync('tmp/security-secret-scan.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ...report, findings: report.findings.slice(0, 35), totalFindings: report.findings.length }, null, 2))
process.exitCode = exitCode !== 0 ? 2 : findings.size ? 1 : 0
