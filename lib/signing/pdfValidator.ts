import 'server-only'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { Sha256, SigningError, SupportedSigningLevel } from './core'

// Below Vercel's 4.5 MB request/response limit. The Windows engine's own
// parser limit is higher, but the authenticated web transport caps each PDF.
export const MAX_SIGNING_PDF = 4 * 1024 * 1024
export const ValidationReport = z.object({
  signerFingerprint: Sha256, certificateIssuer: z.string().min(1).max(500),
  providerType: z.literal('PYHANKO_0_37_SERVER'), level: SupportedSigningLevel,
  timestampAt: z.string().datetime({ offset: true }).nullable(),
  revocationCheckedAt: z.string().datetime({ offset: true }), validatedAt: z.string().datetime({ offset: true }),
  sourceChecksum: Sha256, signedChecksum: Sha256, validator: z.literal('pyHanko 0.37.0'),
  sourcePreserved: z.literal(true), offline: z.literal(true), archiveTimestampCount: z.number().int().min(0),
}).strict()
export type PdfValidationRequest = {
  source: Buffer; signed: Buffer; sourceChecksum: string; signerFingerprint: string;
  requestedLevel: 'PADES_B' | 'PADES_LT' | 'PADES_LTA'
}
export type PdfValidator = (request: PdfValidationRequest) => Promise<z.infer<typeof ValidationReport>>
let running = 0

export async function validateSigningPdfRemote(request: PdfValidationRequest, transport: typeof fetch = fetch) {
  const url = new URL(process.env.SIGNING_VALIDATOR_URL!)
  const token = process.env.SIGNING_VALIDATOR_TOKEN
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !token || !/^[A-Za-z0-9_-]{43,128}$/.test(token))
    throw new SigningError('VALIDATOR_NOT_CONFIGURED')
  const response = await transport(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(95_000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream',
      'X-Source-Length': String(request.source.length), 'X-Source-Sha256': request.sourceChecksum,
      'X-Signer-Sha256': request.signerFingerprint, 'X-Requested-Level': request.requestedLevel },
    body: new Uint8Array(Buffer.concat([request.source, request.signed])), cache: 'no-store' })
  if (!response.ok || !response.body) throw new SigningError('VALIDATION_FAILED')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > 32_768) { await reader.cancel(); throw new SigningError('INVALID_EVIDENCE') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return z.object({ ok: z.literal(true), evidence: ValidationReport }).strict()
    .parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))).evidence
}

/** Separate backend process, independent of the Windows worker and its report.
 * No network fetching or inherited application credentials in the validator. */
export const validateSigningPdf: PdfValidator = async request => {
  if (process.env.SIGNING_VALIDATOR_URL) return validateSigningPdfRemote(request)
  const configPath = process.env.SIGNING_VALIDATOR_CONFIG
  if (!configPath || !path.isAbsolute(configPath)) throw new SigningError('VALIDATOR_NOT_CONFIGURED')
  const config = z.object({ python: z.string(), roots: z.array(z.string()).min(1) }).passthrough()
    .parse(JSON.parse(await readFile(configPath, 'utf8')))
  if (!path.isAbsolute(config.python)) throw new SigningError('VALIDATOR_NOT_CONFIGURED')
  if (running >= 2) throw new SigningError('VALIDATOR_BUSY')
  running++
  let directory: string | undefined
  try {
    directory = await mkdtemp(path.join(tmpdir(), 'notifica-validation-'))
    const sourcePath = path.join(directory, 'source.pdf'), signedPath = path.join(directory, 'signed.pdf')
    await writeFile(sourcePath, request.source, { flag: 'wx', mode: 0o600 })
    await writeFile(signedPath, request.signed, { flag: 'wx', mode: 0o600 })
    const answer = await new Promise<string>((resolve, reject) => {
      const child = execFile(config.python, ['-I', path.join(process.cwd(), 'scripts/signing/validate_pdf.py'), configPath], {
        timeout: 90_000, maxBuffer: 32_768, windowsHide: true, encoding: 'utf8',
        env: { NODE_ENV: 'production', SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: directory, TMP: directory },
      }, (error, stdout) => error ? reject(new SigningError('VALIDATION_FAILED')) : resolve(stdout))
      child.stdin?.on('error', () => { /* child completion reports the fixed error */ })
      child.stdin?.end(JSON.stringify({ sourcePath, signedPath, sourceChecksum: request.sourceChecksum,
        signerFingerprint: request.signerFingerprint, requestedLevel: request.requestedLevel }))
    })
    const parsed = z.object({ ok: z.literal(true), evidence: ValidationReport }).strict().parse(JSON.parse(answer))
    return parsed.evidence
  } finally {
    try { if (directory) await rm(directory, { recursive: true, force: true }) }
    finally { running-- }
  }
}
