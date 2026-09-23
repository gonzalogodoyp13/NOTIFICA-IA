import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createServer, request, type Server } from 'node:https'
import { connect } from 'node:net'
import { generateKeyPairSync, randomUUID, sign, X509Certificate } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createSigningTestDatabase } from './signing-test-database'
import { fingerprint, signingFixture } from './signing-support'
vi.mock('server-only', () => ({}))
import { createDeviceService } from '../../lib/signing/devices'
import { createDeviceHandler } from '../../lib/signing/deviceHttp'
import { createSigningService } from '../../lib/signing/service'
import { enrollmentMessage, sessionMessage } from '../../lib/signing/deviceProtocol'

describe.skipIf(process.env.SIGNING_AGENT_TESTS !== '1')('real Windows agent and HTTPS backend', () => {
  let sandbox: Awaited<ReturnType<typeof createSigningTestDatabase>>
  let server: Server
  let worker: ChildProcess | undefined
  let service: ReturnType<typeof createDeviceService>
  let fixture: Awaited<ReturnType<typeof signingFixture>>
  const keyName = randomUUID()
  const directory = path.resolve('agents/windows/artifacts', `integration-${keyName}`)
  const configPath = path.join(directory, 'config.json')
  const executable = path.resolve('agents/windows/artifacts/win-x64/Notifica.Agent.exe')
  const pipe = String.raw`\\.\pipe\NotificaSigning-${keyName}`
  const observations: unknown[] = []
  let origin: string
  function ipc(value: unknown) {
    return new Promise<any>((resolve, reject) => {
      const socket = connect(pipe)
      let data = ''
      socket.setTimeout(30_000, () => socket.destroy(new Error('Pipe timeout')))
      socket.on('connect', () => socket.write(JSON.stringify(value) + '\n'))
      socket.on('data', chunk => { data += chunk; if (data.includes('\n')) { socket.end(); resolve(JSON.parse(data.trim())) } })
      socket.on('error', reject)
      socket.on('end', () => { if (!data.includes('\n')) reject(new Error('Pipe closed without response')) })
    })
  }
  async function eventually<T>(fn: () => Promise<T>, accept: (value: T) => boolean, duration = 55_000) {
    const deadline = Date.now() + duration
    let last = 'No observation'
    while (Date.now() < deadline) {
      if (worker?.exitCode != null) throw new Error('Agent exited unexpectedly')
      try { const value = await fn(); if (accept(value)) return value; last = 'Unexpected response: ' + JSON.stringify(value) } catch (error) { last = error instanceof Error ? error.message : 'Observation failed' }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    throw new Error('Agent observation timed out: ' + last)
  }
  function start() { worker = spawn(executable, ['--integration-test', '--config', configPath], { windowsHide: true, stdio: 'pipe' }) }
  async function stop() {
    if (worker && worker.exitCode === null) { const current = worker; const ended = new Promise(resolve => current.once('exit', resolve)); current.kill(); await ended }
    worker = undefined
  }
  beforeAll(async () => {
    mkdirSync(directory, { recursive: true })
    execFileSync('pwsh.exe', ['-NoProfile', '-File', path.resolve('agents/windows/create-test-tls.ps1'), '-OutputDirectory', directory], { windowsHide: true })
    const sid = execFileSync('pwsh.exe', ['-NoProfile', '-Command', '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { encoding: 'utf8', windowsHide: true }).trim()
    sandbox = await createSigningTestDatabase(); service = createDeviceService(sandbox.db); fixture = await signingFixture(sandbox.db)
    const handler = createDeviceHandler(service)
    server = createServer({ pfx: readFileSync(path.join(directory, 'test-server.pfx')), passphrase: '' }, async (req, res) => {
      try {
        const buffers = []; for await (const chunk of req) buffers.push(chunk)
        const request = new NextRequest(origin + req.url, { method: 'POST', headers: req.headers as Record<string, string>, body: Buffer.concat(buffers) })
        const response = await handler(request, req.url!.split('/').at(-1)!)
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text())
      } catch { res.writeHead(500); res.end('{}') }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `https://127.0.0.1:${(server.address() as { port: number }).port}`
    writeFileSync(configPath, JSON.stringify({ serverUrl: origin + '/', dataDirectory: directory, allowedUserSid: sid, keyName,
      pkcs11Library: 'C:\\Windows\\System32\\eTPKCS11.dll',
      certificateFingerprint: process.env.SIGNING_AGENT_TEST_CERTIFICATE_FINGERPRINT ?? null, machineKey: false }))
    start()
    await eventually(() => ipc({ action: 'status' }), r => r.ok)
  }, 120_000)
  afterAll(async () => {
    await stop()
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
    if (sandbox) await sandbox.dispose()
    execFileSync('pwsh.exe', ['-NoProfile', '-Command', `if ([Security.Cryptography.CngKey]::Exists('${keyName}')) { $testKey=[Security.Cryptography.CngKey]::Open('${keyName}'); $testKey.Delete(); $testKey.Dispose() }`], { windowsHide: true })
    writeFileSync(path.resolve('agents/windows/artifacts/integration-results.json'), JSON.stringify(observations, null, 2))
    // Only the exact unique test directory created by this test.
    if (path.dirname(directory) !== path.resolve('agents/windows/artifacts')) throw new Error('Unsafe test cleanup path')
    rmSync(directory, { recursive: true, force: true })
  }, 60_000)
  it('enrolls, sends real token heartbeat, recovers after process restart, and observes revocation', async () => {
    const code = await service.createEnrollment(fixture.context, { role: 'SIGNER' })
    expect(await ipc({ action: 'enroll', code: code.code, name: 'Isolated Windows agent test' })).toMatchObject({ ok: true })
    let devices = await eventually(() => service.list(fixture.context), rows => rows.some(r => r.name === 'Isolated Windows agent test' && r.lastHeartbeatAt !== null))
    let device = devices.find(r => r.name === 'Isolated Windows agent test')!
    expect(device.health).toBe('TOKEN_READY')
    expect(device.certificateThumbprint).toMatch(/^[a-f0-9]{64}$/)
    if (process.env.SIGNING_AGENT_TEST_CERTIFICATE_FINGERPRINT) {
      expect(device.certificateThumbprint).toBe(process.env.SIGNING_AGENT_TEST_CERTIFICATE_FINGERPRINT)
    }
    expect((await ipc({ action: 'status' })).status.connectivity).toBe('ONLINE')
    observations.push({ check: 'HTTPS enrollment and real token heartbeat', health: device.health, passed: true })
    const first = device.lastHeartbeatAt!.getTime()
    await stop()
    await expect(ipc({ action: 'status' })).rejects.toThrow()
    start()
    devices = await eventually(() => service.list(fixture.context), rows => rows.some(r => r.id === device.id && r.lastHeartbeatAt!.getTime() > first))
    device = devices.find(r => r.id === device.id)!
    expect(device.health).toBe('TOKEN_READY')
    expect((await ipc({ action: 'status' })).status.deviceId).toBe(device.id)
    observations.push({ check: 'Process restart preserves CNG identity and reconnects', passed: true })
    await service.revoke(fixture.context, device.id)
    const state = await eventually(() => ipc({ action: 'status' }), r => r.status?.errorCode === 'DEVICE_UNAUTHORIZED')
    expect(state.status.connectivity).toBe('OFFLINE')
    observations.push({ check: 'Revocation stops authenticated heartbeat', passed: true })
  }, 180_000)
  it('enrolls an HTTPS test client and claims only authorized synthetic work', async () => {
    const ca = new X509Certificate(readFileSync(path.join(directory, 'test-root.cer'))).toString()
    async function post(action: string, value: unknown, token?: string) {
      return new Promise<{ status: number; body: any }>((resolve, reject) => {
        const req = request(`${origin}/api/signing/device/${action}`, { method: 'POST', ca,
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } }, res => {
          const chunks: Buffer[] = []
          res.on('data', chunk => chunks.push(chunk))
          res.on('error', reject)
          res.on('end', () => {
            try { resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }) }
            catch (error) { reject(error) }
          })
        })
        req.setTimeout(20_000, () => req.destroy(new Error('HTTPS test request timed out')))
        req.on('error', reject)
        req.end(JSON.stringify(value))
      })
    }
    async function enroll(role: 'SIGNER' | 'RECEIVER', office: Awaited<ReturnType<typeof signingFixture>>) {
      const keys = generateKeyPairSync('rsa', { modulusLength: 3072 })
      const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
      const proof = (message: string) => sign('sha256', Buffer.from(message), keys.privateKey).toString('base64')
      const code = await service.createEnrollment(office.context, { role })
      const name = 'Isolated HTTPS client'
      const enrolled = await post('enroll', { code: code.code, name, publicKey, signature: proof(enrollmentMessage(code.code, publicKey, name)) })
      expect(enrolled.status).toBe(201)
      const { deviceId } = enrolled.body.data
      const challenge = await post('challenge', { deviceId })
      expect(challenge.status).toBe(200)
      const { challengeId, nonce } = challenge.body.data
      const session = await post('session', { deviceId, challengeId, nonce, signature: proof(sessionMessage(deviceId, challengeId, nonce)) })
      expect(session.status).toBe(200)
      const { token } = session.body.data
      const heartbeat = await post('heartbeat', { agentVersion: '0.5.0', role, diskFreeBytes: 1000, lastSuccessfulContactAt: null,
        token: role === 'RECEIVER' ? 'NOT_APPLICABLE' : 'READY', certificate: role === 'RECEIVER' ? null : {
          fingerprint, subject: 'Synthetic signer', issuer: 'Synthetic issuer', digitalSignature: true,
          notBefore: '2020-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' } }, token)
      expect(heartbeat.status).toBe(200)
      return { deviceId: deviceId as string, token: token as string }
    }
    const office = await signingFixture(sandbox.db)
    const otherOffice = await signingFixture(sandbox.db)
    const signer = await enroll('SIGNER', office)
    const receiver = await enroll('RECEIVER', office)
    const foreign = await enroll('SIGNER', otherOffice)
    const version = await office.document()
    await createSigningService(sandbox.db).createJob(office.context, { idempotencyKey: randomUUID(), sourceVersionIds: [version.source.id], signerFingerprint: fingerprint })
    expect((await post('claim', {}, receiver.token)).status).toBe(403)
    expect(await post('claim', {}, foreign.token)).toMatchObject({ status: 200, body: { data: null } })
    const claimed = await post('claim', {}, signer.token)
    expect(claimed.status).toBe(200)
    expect(claimed.body.data.sourceVersionId).toBe(version.source.id)
    const lease = { itemId: claimed.body.data.itemId, leaseToken: claimed.body.data.leaseToken }
    expect((await post('input', lease, foreign.token)).body.error.code).toBe('STALE_LEASE')
    expect(await post('input', lease, signer.token)).toMatchObject({ status: 200, body: { data: {
      authorized: true, checksumSha256: version.source.checksumSha256, transferAvailable: false } } })
    expect((await post('renew', lease, signer.token)).status).toBe(200)
    expect((await post('result', lease, signer.token)).body.error.code).toBe('PDF_BODY_REQUIRED')
    await service.revoke(office.context, signer.deviceId)
    for (const action of ['claim', 'input', 'renew', 'result']) {
      expect((await post(action, action === 'claim' ? {} : lease, signer.token)).status).toBe(401)
    }
    expect(await sandbox.db.documentSignature.count({ where: { officeId: office.office.id } })).toBe(0)
    observations.push({ check: 'HTTPS client enrollment, authentication, heartbeat, scoped fake claim and revocation', passed: true })
  }, 180_000)
})
