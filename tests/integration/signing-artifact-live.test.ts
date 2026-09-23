import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:https'
import { connect } from 'node:net'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createSigningTestDatabase } from './signing-test-database'
import { signingFixture } from './signing-support'
vi.mock('server-only', () => ({}))
import { createDeviceService } from '../../lib/signing/devices'
import { createDeviceHandler } from '../../lib/signing/deviceHttp'
import { createSigningService } from '../../lib/signing/service'
import { createServerSupabaseStorageClient } from '../../lib/supabaseServer'
import { buildEstampoPdf } from '../../lib/estampos/pdf'

describe.skipIf(process.env.SIGNING_ARTIFACT_LIVE !== '1')('Phase 7 real estampo / storage / Windows / USB acceptance', () => {
  it('downloads an immutable estampo, signs with local consent, validates on server and recovers a lost commit response after restart', async () => {
    const keyName = randomUUID(), directory = path.resolve('agents/windows/artifacts/phase7', `live-${keyName}`)
    mkdirSync(directory, { recursive: true })
    const executable = path.resolve('agents/windows/artifacts/win-x64/Notifica.Agent.exe')
    const configPath = path.join(directory, 'config.json'), journalPath = path.join(directory, 'signing-work.json')
    let sandbox: Awaited<ReturnType<typeof createSigningTestDatabase>> | undefined
    let server: Server | undefined, worker: ChildProcess | undefined, tray: ChildProcess | undefined
    let origin = '', lostResponse = false, uploads = 0
    let sourceKey: string | undefined, officeId: number | undefined
    const observation: Record<string, unknown> = { startedAt: new Date().toISOString(), completed: false }
    const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex')
    const config = JSON.parse(readFileSync(path.resolve('agents/windows/artifacts/phase6/engine.json'), 'utf8'))
    const fingerprint = process.env.SIGNING_AGENT_TEST_CERTIFICATE_FINGERPRINT!
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Explicit real certificate identity required')
    const pipe = String.raw`\\.\pipe\NotificaSigning-${keyName}`
    function ipc(value: unknown) {
      return new Promise<any>((resolve, reject) => {
        const socket = connect(pipe); let data = ''
        socket.setTimeout(6000, () => socket.destroy(new Error('PIPE_TIMEOUT')))
        socket.on('connect', () => socket.write(JSON.stringify(value) + '\n'))
        socket.on('data', bytes => { data += bytes; if (data.includes('\n')) { socket.end(); resolve(JSON.parse(data)) } })
        socket.on('error', reject)
      })
    }
    async function until<T>(fn: () => Promise<T>, accept: (v: T) => boolean, ms = 75_000) {
      const end = Date.now() + ms
      while (Date.now() < end) {
        if (worker?.exitCode !== null && worker?.exitCode !== undefined) throw new Error('AGENT_EXITED')
        try { const value = await fn(); if (accept(value)) return value } catch { }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      throw new Error('ACCEPTANCE_OBSERVATION_TIMEOUT')
    }
    function start() {
      worker = spawn(executable, ['--integration-test', '--config', configPath], { windowsHide: true, stdio: 'ignore' })
    }
    async function stop(process: ChildProcess | undefined) {
      if (process?.exitCode === null) { const exit = new Promise(resolve => process.once('exit', resolve)); process.kill(); await exit }
    }
    try {
      sandbox = await createSigningTestDatabase()
      const f = await signingFixture(sandbox.db); officeId = f.office.id
      const service = createDeviceService(sandbox.db), handler = createDeviceHandler(service)
      const store = createServerSupabaseStorageClient({ requireServiceRole: true })
      const bucket = await store.storage.getBucket('documents')
      expect(bucket.error).toBeNull(); expect(bucket.data?.public).toBe(false)
      const v = await f.document()
      const bytes = Buffer.from(await buildEstampoPdf(
        'PRUEBA CONTROLADA DE FIRMA DIGITAL - FASE 7.\nEste estampo sintetico se genera con el motor de NOTIFICA IA. No corresponde a una diligencia real ni produce efectos procesales.\nVerifica transferencia privada, firma del token, validacion independiente y versionado inmutable.',
        { receptorNombre: 'PRUEBA TECNICA NOTIFICA IA', tribunalNombre: 'Tribunal sintetico - sin efectos legales', rolNumero: 'PHASE7-TEST', bancoNombre: null, ejecutadoNombre: 'Datos sinteticos' }), 'base64')
      writeFileSync(path.join(directory, 'estampo-source.pdf'), bytes)
      sourceKey = `offices/${f.office.id}/phase7-tests/${keyName}/source.pdf`
      expect((await store.storage.from('documents').upload(sourceKey, bytes, { contentType: 'application/pdf', upsert: false })).error).toBeNull()
      // Real storage collision behavior, with a deliberately different body.
      expect((await store.storage.from('documents').upload(sourceKey, Buffer.from('must not replace'), { upsert: false })).error).not.toBeNull()
      await sandbox.db.documentoVersion.update({ where: { id: v.source.id }, data: { storageBucket: 'documents', storageKey: sourceKey, checksumSha256: hash(bytes), sizeBytes: bytes.length } })
      execFileSync('pwsh.exe', ['-NoProfile', '-File', path.resolve('agents/windows/create-test-tls.ps1'), '-OutputDirectory', directory], { windowsHide: true })
      const sid = execFileSync('pwsh.exe', ['-NoProfile', '-Command', '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { encoding: 'utf8', windowsHide: true }).trim()
      server = createServer({ pfx: readFileSync(path.join(directory, 'test-server.pfx')), passphrase: '' }, async (req, res) => {
        try {
          const parts: Buffer[] = []; let count = 0
          for await (const part of req) { count += part.length; if (count > 32 * 1024 * 1024) throw Error('TOO_LARGE'); parts.push(part) }
          const action = req.url!.split('/').at(-1)!
          const response = await handler(new NextRequest(origin + req.url, { method: 'POST', headers: req.headers as Record<string, string>, body: Buffer.concat(parts) }), action)
          const body = Buffer.from(await response.arrayBuffer())
          if (action === 'result' && response.status === 200) {
            uploads++
            if (!lostResponse) { lostResponse = true; res.destroy(); return }
          }
          res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(body)
        } catch { if (!res.destroyed) { res.writeHead(500); res.end('{}') } }
      })
      await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
      origin = `https://127.0.0.1:${(server.address() as { port: number }).port}`
      writeFileSync(configPath, JSON.stringify({ serverUrl: origin + '/', dataDirectory: directory, allowedUserSid: sid, keyName,
        pkcs11Library: 'C:\\Windows\\System32\\eTPKCS11.dll', certificateFingerprint: fingerprint, machineKey: false,
        signingEngine: { ...config, outputDirectory: path.join(directory, 'signed') } }))
      start()
      await until(() => ipc({ action: 'status' }), s => s.ok)
      const code = await service.createEnrollment(f.context, { role: 'SIGNER' })
      expect((await ipc({ action: 'enroll', code: code.code, name: 'Controlled Phase 7 signer' })).ok).toBe(true)
      await until(() => service.list(f.context), rows => rows.some(r => r.health === 'TOKEN_READY' && r.name === 'Controlled Phase 7 signer'))
      await createSigningService(sandbox.db).createJob(f.context, { idempotencyKey: randomUUID(), sourceVersionIds: [v.source.id], signerFingerprint: fingerprint, requestedLevel: 'PADES_LT' })
      const preview = await until(() => ipc({ action: 'controlled-batch' }), s => s.batch?.state === 'AWAITING_APPROVAL')
      expect(preview.batch.batch.documents[0].sourceSha256).toBe(hash(bytes))
      writeFileSync(path.join(directory, 'ready.json'), JSON.stringify({ ready: true, documentId: v.doc.id, sourceChecksum: hash(bytes), at: new Date().toISOString() }))
      console.log(`PHASE7_LOCAL_APPROVAL_READY ${directory}`)
      // Visible only for the user's explicit local review and PIN entry.
      tray = spawn(executable, ['--show-signing', '--config', configPath], { windowsHide: false, stdio: 'ignore' })
      await until(async () => existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, 'utf8')) : null,
        state => state?.state === 'SIGNED' && lostResponse, 330_000)
      const beforeRestart = await ipc({ action: 'controlled-batch' })
      observation.localResult = { loginAttempts: beforeRestart.batch.tokenLoginAttempts, signatureOperations: beforeRestart.batch.tokenSignatureOperations }
      expect(beforeRestart.batch.tokenLoginAttempts).toBe(1); expect(beforeRestart.batch.tokenSignatureOperations).toBe(1)
      await stop(tray); tray = undefined
      await stop(worker); worker = undefined
      start()
      await until(async () => JSON.parse(readFileSync(journalPath, 'utf8')), state => state.state === 'COMMITTED')
      const signature = await sandbox.db.documentSignature.findFirstOrThrow({ where: { officeId: f.office.id }, include: { signedVersion: true } })
      expect((await sandbox.db.documento.findUniqueOrThrow({ where: { id: v.doc.id } })).currentVersionId).toBe(signature.signedVersionId)
      const sourceStored = await store.storage.from('documents').download(sourceKey)
      const signedStored = await store.storage.from(signature.signedVersion.storageBucket).download(signature.signedVersion.storageKey)
      expect(sourceStored.error).toBeNull(); expect(signedStored.error).toBeNull()
      expect(hash(Buffer.from(await sourceStored.data!.arrayBuffer()))).toBe(hash(bytes))
      const signed = Buffer.from(await signedStored.data!.arrayBuffer())
      expect(hash(signed)).toBe(signature.signedChecksum)
      writeFileSync(path.join(directory, 'estampo-signed.pdf'), signed)
      expect(await sandbox.db.documentSignature.count({ where: { officeId: f.office.id } })).toBe(1)
      expect(await sandbox.db.signingAttempt.count({ where: { officeId: f.office.id, result: 'SUCCEEDED' } })).toBe(1)
      expect(uploads).toBeGreaterThanOrEqual(2)
      const artifact = await sandbox.db.signingArtifact.findUniqueOrThrow({ where: { id: signature.signedVersionId } })
      observation.validation = artifact.validation
      observation.completed = true; observation.sourceChecksum = hash(bytes); observation.signedChecksum = signature.signedChecksum
      observation.lostResponseRecoveredAfterRestart = true; observation.privateStorageCollisionRejected = true
      observation.signatureCount = 1; observation.signedVersionId = signature.signedVersionId
    } finally {
      await stop(tray); await stop(worker)
      if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())) }
      if (sandbox) {
        const store = createServerSupabaseStorageClient({ requireServiceRole: true })
        const uploaded = officeId ? await sandbox.db.signingArtifact.findMany({ where: { officeId } }) : []
        const keys = [...(sourceKey ? [sourceKey] : []), ...uploaded.map(row => row.storageKey)]
        if (keys.length) expect((await store.storage.from('documents').remove(keys)).error).toBeNull()
        await sandbox.dispose()
      }
      execFileSync('pwsh.exe', ['-NoProfile', '-Command', `if ([Security.Cryptography.CngKey]::Exists('${keyName}')) { $testKey=[Security.Cryptography.CngKey]::Open('${keyName}'); $testKey.Delete(); $testKey.Dispose() }`], { windowsHide: true })
      for (const name of ['test-server.pfx', 'signing-work.json', 'signing-work.json.part', 'identity.json']) rmSync(path.join(directory, name), { force: true })
      observation.cleanupCompleted = true; observation.finishedAt = new Date().toISOString()
      writeFileSync(path.join(directory, 'acceptance.json'), JSON.stringify(observation, null, 2))
      console.log(`PHASE7_ACCEPTANCE_EVIDENCE ${directory}`)
    }
  }, 600_000)
})
