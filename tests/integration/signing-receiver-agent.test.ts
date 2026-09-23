import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:https'
import { connect } from 'node:net'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createSigningTestDatabase } from './signing-test-database'
import { signingFixture, fingerprint } from './signing-support'
vi.mock('server-only', () => ({}))
import { createDeviceService } from '../../lib/signing/devices'
import { createDeviceHandler } from '../../lib/signing/deviceHttp'
import { createSigningService } from '../../lib/signing/service'
import { sha256 } from '../../lib/signing/deviceProtocol'
import { signingStorage } from '../../lib/signing/artifacts'

describe.skipIf(process.env.SIGNING_RECEIVER_AGENT_TESTS !== '1')('Phase 9 real receiver agents / HTTPS / private storage', () => {
  const root = path.resolve('agents/windows/artifacts/phase9'), directory = path.join(root, 'live-' + randomUUID())
  const agents = [0, 1].map(i => ({ key: randomUUID(), directory: path.join(directory, 'receiver-' + i), process: undefined as ChildProcess | undefined }))
  const executable = path.resolve('agents/windows/artifacts/win-x64/Notifica.Agent.exe')
  const cloudKeys: string[] = [], observed: Record<string, unknown> = {}
  let sandbox: Awaited<ReturnType<typeof createSigningTestDatabase>>, server: Server, origin: string
  let service: ReturnType<typeof createDeviceService>, fixture: Awaited<ReturnType<typeof signingFixture>>
  let dropAck = true, cutDownload = true, allowDownload = false
  const accepted = path.resolve('agents/windows/artifacts/phase7/live-defddef9-b27c-4eed-8395-baa175e23148')
  const source = readFileSync(path.join(accepted, 'estampo-source.pdf')), signed = readFileSync(path.join(accepted, 'estampo-signed.pdf'))
  function ipc(i: number, value: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const socket = connect(String.raw`\\.\pipe\NotificaSigning-${agents[i].key}`); let text = ''
      socket.setTimeout(30000, () => socket.destroy(new Error('IPC_TIMEOUT')))
      socket.on('connect', () => socket.write(JSON.stringify(value) + '\n'))
      socket.on('data', bytes => { text += bytes; if (text.includes('\n')) { socket.end(); resolve(JSON.parse(text)) } })
      socket.on('error', reject)
    })
  }
  async function until(check: () => Promise<boolean>, ms = 120000) {
    const end = Date.now() + ms
    while (Date.now() < end) {
      try { if (await check()) return } catch { /* startup/reconnection */ }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    throw new Error('RECEIVER_ACCEPTANCE_TIMEOUT')
  }
  function start(i: number) { agents[i].process = spawn(executable, ['--integration-test', '--config', path.join(agents[i].directory, 'config.json')], { windowsHide: true, stdio: 'ignore' }) }
  async function stop(i: number) {
    const child = agents[i].process
    if (child && child.exitCode === null) { const ended = new Promise(resolve => child.once('exit', resolve)); child.kill(); await ended }
    agents[i].process = undefined
  }
  beforeAll(async () => {
    mkdirSync(directory, { recursive: true })
    const evidence = JSON.parse(readFileSync(path.join(accepted, 'acceptance.json'), 'utf8'))
    expect(sha256(source)).toBe(evidence.sourceChecksum); expect(sha256(signed)).toBe(evidence.signedChecksum)
    execFileSync('pwsh.exe', ['-NoProfile', '-File', path.resolve('agents/windows/create-test-tls.ps1'), '-OutputDirectory', directory], { windowsHide: true })
    const sid = execFileSync('pwsh.exe', ['-NoProfile', '-Command', '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { windowsHide: true, encoding: 'utf8' }).trim()
    sandbox = await createSigningTestDatabase(); fixture = await signingFixture(sandbox.db)
    // Transport acceptance reuses the exact independently validated Phase 7 PDF.
    // This fixture report seeds its committed state; it is not a new cryptographic validation claim.
    service = createDeviceService(sandbox.db, { validator: async r => ({ signerFingerprint: r.signerFingerprint, certificateIssuer: 'Phase 9 transport fixture',
      providerType: 'PYHANKO_0_37_SERVER', level: r.requestedLevel, timestampAt: new Date().toISOString(),
      revocationCheckedAt: new Date().toISOString(), validatedAt: new Date().toISOString(), sourceChecksum: sha256(r.source), signedChecksum: sha256(r.signed),
      validator: 'pyHanko 0.37.0', sourcePreserved: true, offline: true, archiveTimestampCount: 0 }) })
    const handler = createDeviceHandler(service)
    server = createServer({ pfx: readFileSync(path.join(directory, 'test-server.pfx')), passphrase: '' }, async (req, res) => {
      try {
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk)
        const action = req.url!.split('/').at(-1)!
        if (action === 'delivery-download' && !allowDownload) { res.writeHead(503); res.end('{}'); return }
        const response = await handler(new NextRequest(origin + req.url, { method: 'POST', headers: req.headers as Record<string, string>, body: Buffer.concat(chunks) }), action)
        const bytes = Buffer.from(await response.arrayBuffer())
        if (action === 'ack' && response.status === 200 && dropAck) { dropAck = false; observed.lostAcknowledgement = true; res.destroy(); return }
        if (action === 'delivery-download' && response.status === 200 && cutDownload) {
          cutDownload = false; observed.interruptedDownload = true
          res.writeHead(200, Object.fromEntries(response.headers)); res.write(bytes.subarray(0, 100)); res.destroy(); return
        }
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(bytes)
      } catch { res.writeHead(500); res.end('{}') }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `https://127.0.0.1:${(server.address() as { port: number }).port}`
    for (const a of agents) {
      mkdirSync(a.directory, { recursive: true }); copyFileSync(path.join(directory, 'test-root.cer'), path.join(a.directory, 'test-root.cer'))
      writeFileSync(path.join(a.directory, 'config.json'), JSON.stringify({ serverUrl: origin + '/', dataDirectory: a.directory, allowedUserSid: sid,
        keyName: a.key, pkcs11Library: path.join(a.directory, 'missing.dll'), certificateFingerprint: null, machineKey: false,
        receiverDirectory: path.join(a.directory, 'mirror') }))
    }
    for (let i = 0; i < agents.length; i++) {
      start(i); await until(async () => (await ipc(i, { action: 'status' })).ok, 15000)
      const code = await service.createEnrollment(fixture.context, { role: 'RECEIVER' })
      expect(await ipc(i, { action: 'enroll', code: code.code, name: 'Receiver acceptance ' + i,
        receiverDirectory: path.join(agents[i].directory, 'mirror') })).toMatchObject({ ok: true })
    }
  }, 120000)
  afterAll(async () => {
    for (let i = 0; i < agents.length; i++) await stop(i)
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
    // Exact reserved cloud objects only; no production document paths.
    if (sandbox && fixture) {
      const artifacts = await sandbox.db.signingArtifact.findMany({ where: { officeId: fixture.office.id } })
      for (const a of artifacts) cloudKeys.push(a.storageKey)
    }
    for (const key of Array.from(new Set(cloudKeys))) await signingStorage.remove('documents', key)
    if (sandbox) await sandbox.dispose()
    for (const a of agents) execFileSync('pwsh.exe', ['-NoProfile', '-Command', `if ([Security.Cryptography.CngKey]::Exists('${a.key}')) { $receiverKey=[Security.Cryptography.CngKey]::Open('${a.key}'); $receiverKey.Delete(); $receiverKey.Dispose() }`], { windowsHide: true })
    observed.cleanupCompleted = true; observed.checkedAt = new Date().toISOString()
    writeFileSync(path.join(root, 'receiver-https-results.json'), JSON.stringify(observed, null, 2))
    if (path.dirname(directory) !== root) throw new Error('UNSAFE_TEST_DIRECTORY')
    rmSync(directory, { recursive: true, force: true })
  }, 60000)
  it('mirrors identical committed bytes to two receivers with interruption, collision, restart and revocation', async () => {
    await stop(1)
    const v = await fixture.document(), sourceKey = `phase9-tests/${randomUUID()}/source.pdf`
    cloudKeys.push(sourceKey); await signingStorage.assertPrivate('documents'); await signingStorage.upload('documents', sourceKey, source)
    await sandbox.db.documentoVersion.update({ where: { id: v.source.id }, data: { storageBucket: 'documents', storageKey: sourceKey, checksumSha256: sha256(source), sizeBytes: source.length } })
    const token = randomBytes(32).toString('base64url')
    await sandbox.db.deviceSession.create({ data: { officeId: fixture.office.id, deviceId: fixture.device.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 600000) } })
    const queue = createSigningService(sandbox.db)
    await queue.createJob(fixture.context, { idempotencyKey: randomUUID(), sourceVersionIds: [v.source.id], signerFingerprint: fingerprint })
    const item = (await queue.claim(fixture.office.id, fixture.device.id, 300000))!, lease = { itemId: item.id, leaseToken: item.leaseToken! }
    await service.queue(token, 'start', lease)
    const committed = await service.submitArtifact(token, lease, signed)
    const filename = `${v.doc.id}-${committed.signedVersionId}-firmado.pdf`
    writeFileSync(path.join(agents[0].directory, 'mirror', filename), 'Local file to preserve')
    allowDownload = true; start(1)
    const ids = agents.map(a => JSON.parse(readFileSync(path.join(a.directory, 'identity.json'), 'utf8')).deviceId as string)
    await until(async () => await sandbox.db.documentDelivery.count({ where: { deviceId: { in: ids }, status: 'DELIVERED' } }) === 2, 180000)
    await until(async () => agents.every(a => existsSync(path.join(a.directory, 'receiver-manifest')) && readdirSync(path.join(a.directory, 'receiver-manifest')).length === 1), 45000)
    const checksums = agents.map(a => readdirSync(path.join(a.directory, 'mirror')).filter(n => n.endsWith('.pdf')).map(n => sha256(readFileSync(path.join(a.directory, 'mirror', n)))))
    expect(checksums.every(hashes => hashes.includes(sha256(signed)))).toBe(true)
    expect(readFileSync(path.join(agents[0].directory, 'mirror', filename), 'utf8')).toBe('Local file to preserve')
    expect(observed.interruptedDownload).toBe(true); expect(observed.lostAcknowledgement).toBe(true)
    await stop(0); start(0)
    await until(async () => (await ipc(0, { action: 'status' })).status.deviceId === ids[0], 15000)
    await service.revoke(fixture.context, ids[0])
    await until(async () => (await ipc(0, { action: 'status' })).status.errorCode === 'DEVICE_UNAUTHORIZED', 65000)
    expect(sha256(await signingStorage.download('documents', sourceKey))).toBe(sha256(source))
    observed.twoReceiversSameHash = sha256(signed); observed.collisionPreserved = true; observed.offlineReceiverRestart = true
    observed.revocationObserved = true; observed.sourceUnchanged = true; observed.tokenLoginAttempts = 0; observed.passed = true
    observed.bothManifestsPersisted = true
    // Save public copies outside the disposable credential directory for inspection.
    for (let i = 0; i < agents.length; i++) {
      const matching = readdirSync(path.join(agents[i].directory, 'mirror')).find(n => n.endsWith('.pdf') && sha256(readFileSync(path.join(agents[i].directory, 'mirror', n))) === sha256(signed))!
      copyFileSync(path.join(agents[i].directory, 'mirror', matching), path.join(root, `receiver-${i + 1}-signed.pdf`))
      expect(existsSync(path.join(agents[i].directory, 'receiver-state.json'))).toBe(true)
    }
  }, 300000)
})
