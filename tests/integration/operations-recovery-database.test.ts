import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
vi.mock('server-only',()=>({}))
const state=vi.hoisted(()=>({db:null as any,actor:null as any}))
vi.mock('@/lib/prisma',()=>({prisma:new Proxy({},{get:(_,key)=>{const value=state.db[key];return typeof value==='function'?value.bind(state.db):value}})}))
vi.mock('@/lib/operations/auth',()=>({requirePlatformOwner:async()=>state.actor,requireRecoveryOwner:async()=>state.actor,OperationsAccessError:class extends Error{constructor(public status:number,public code:string){super(code)}}}))
vi.mock('@/lib/email/system-mailer',()=>({createSystemMailAdapter:()=>{throw new Error('LIVE_EMAIL_FORBIDDEN')}}))
vi.mock('@/lib/diagnostics/server',()=>({reportUnexpected:async()=>{throw new Error('UNEXPECTED_DIAGNOSTIC')}}))
import { createSigningTestDatabase } from './signing-test-database'
import { signingFixture, fingerprint, hashA } from './signing-support'
import { previewRecovery, executeRecovery, verifyRecovery } from '@/lib/operations/recovery'
it.skipIf(process.env.TEST_RECOVERY_DATABASE!=='true')('races actual recovery transactions in a disposable schema; no customer effects',async()=>{
  const fixture=await createSigningTestDatabase(['operations_recoveries','platform_grants','platform_audit','report_jobs','report_job_runs','generated_reports'])
  state.db=fixture.db
  try {
    const a=await signingFixture(fixture.db), b=await signingFixture(fixture.db)
    state.actor={id:b.user.id,officeId:b.office.id}
    await fixture.db.platformGrant.create({data:{userId:b.user.id}}) // synthetic schema only
    const job=await fixture.db.reportJob.create({data:{officeId:a.office.id,type:'GENERATE',origin:'MANUAL',reportKind:'daily',idempotencyKey:randomUUID(),requestedPeriodStart:new Date('2026-01-01'),requestedPeriodEnd:new Date('2026-01-02'),requestedPeriodLabel:'test',payload:{}}})
    const preview=await previewRecovery({kind:'report',targetId:job.id,officeId:a.office.id})
    const input={kind:'report',targetId:job.id,officeId:a.office.id,action:'report.cancel',fingerprint:preview.fingerprint,confirmation:`report.cancel ${job.id} oficina ${a.office.id}`,reason:'Safe isolated cancellation verification'}
    const results=await Promise.all(Array.from({length:3},()=>executeRecovery({...input,idempotencyKey:randomUUID()})))
    expect(new Set(results.map(x=>x.id)).size).toBe(1)
    expect(await fixture.db.reportJob.findUnique({where:{id:job.id},select:{status:true}})).toEqual({status:'CANCELLED'})
    expect(await fixture.db.activityEvent.count({where:{eventType:'report.job.cancel_requested'}})).toBe(1)
    expect(await fixture.db.platformAudit.count({where:{action:'recovery.requested'}})).toBe(3)
    expect(await fixture.db.platformAudit.count({where:{action:'recovery.deduplicated'}})).toBe(2)
    const failed=await fixture.db.reportJob.create({data:{officeId:a.office.id,type:'GENERATE',origin:'MANUAL',status:'FAILED',reportKind:'daily',idempotencyKey:randomUUID(),requestedPeriodStart:new Date('2026-02-01'),requestedPeriodEnd:new Date('2026-02-02'),requestedPeriodLabel:'test',payload:{},resultCode:'FAILED'}})
    const rp=await previewRecovery({kind:'report',targetId:failed.id,officeId:a.office.id})
    const retryInput={kind:'report',targetId:failed.id,officeId:a.office.id,action:'report.retry',fingerprint:rp.fingerprint,confirmation:`report.retry ${failed.id} oficina ${a.office.id}`,reason:'Safe isolated retry verification',idempotencyKey:randomUUID()}
    const retry=await executeRecovery(retryInput)
    expect((await executeRecovery(retryInput)).id).toBe(retry.id)
    expect(await fixture.db.reportJob.count({where:{retryOfJobId:failed.id}})).toBe(1)
    expect((await verifyRecovery(retry.id)).status).toBe('ACCEPTED')
    await fixture.db.reportJob.update({where:{id:retry.resultId!},data:{status:'RUNNING'}})
    expect((await verifyRecovery(retry.id)).status).toBe('RUNNING')
    await fixture.db.reportJob.update({where:{id:retry.resultId!},data:{status:'SUCCEEDED',resultCode:'NO_ACTIVITY'}})
    expect((await verifyRecovery(retry.id)).status).toBe('SUCCEEDED')
    const doc=await a.document()
    await fixture.db.signingDevice.update({where:{id:a.device.id},data:{lastHeartbeatAt:new Date(),certificateExpiresAt:new Date(Date.now()+86400000)}})
    const sj=await fixture.db.signingJob.create({data:{officeId:a.office.id,requestedByUserId:a.user.id,signerFingerprint:fingerprint,idempotencyKey:randomUUID(),requestHash:hashA,status:'FAILED'}})
    const item=await fixture.db.signingItem.create({data:{officeId:a.office.id,jobId:sj.id,documentoId:doc.doc.id,sourceVersionId:doc.source.id,sourceChecksum:hashA,signerFingerprint:fingerprint,status:'FAILED',attemptCount:1,errorCode:'PIN_REQUIRED'}})
    const sp=await previewRecovery({kind:'signing',targetId:item.id,officeId:a.office.id})
    const si={kind:'signing',targetId:item.id,officeId:a.office.id,action:'signing.retry',fingerprint:sp.fingerprint,confirmation:`signing.retry ${item.id} oficina ${a.office.id}`,reason:'Safe isolated signing queue verification'}
    await Promise.all([executeRecovery({...si,idempotencyKey:randomUUID()}),executeRecovery({...si,idempotencyKey:randomUUID()})])
    expect((await fixture.db.signingItem.findUniqueOrThrow({where:{id:item.id}})).status).toBe('QUEUED')
    expect(await fixture.db.activityEvent.count({where:{eventType:'signing.retried'}})).toBe(1)
    expect(await fixture.db.documentSignature.count()).toBe(0) // never signs
    const signingAction=await fixture.db.operationsRecovery.findFirstOrThrow({where:{targetId:item.id,intentKey:{not:null}}})
    await fixture.db.signingItem.update({where:{id:item.id},data:{status:'WAITING_FOR_OPERATOR'}})
    expect((await verifyRecovery(signingAction.id)).status).toBe('PARTIAL')
    await fixture.db.signingItem.update({where:{id:item.id},data:{status:'FAILED',errorCode:'INTERNAL_ERROR'}})
    const uncertain=await previewRecovery({kind:'signing',targetId:item.id,officeId:a.office.id})
    expect(uncertain.actions.find(x=>x.action==='signing.retry')?.eligible).toBe(false)
    await expect(executeRecovery({...si,fingerprint:uncertain.fingerprint,idempotencyKey:randomUUID()})).rejects.toThrow('RECOVERY_INELIGIBLE')
    expect(await fixture.db.operationsRecovery.count({where:{targetId:item.id,status:'FAILED',safeCode:'RECOVERY_INELIGIBLE'}})).toBe(1)
    const dp=await previewRecovery({kind:'device',targetId:a.device.id,officeId:a.office.id})
    const diagnostics=await executeRecovery({kind:'device',targetId:a.device.id,officeId:a.office.id,action:'diagnostics',fingerprint:dp.fingerprint,confirmation:`diagnostics ${a.device.id} oficina ${a.office.id}`,reason:'Safe heartbeat evidence verification',idempotencyKey:randomUUID()})
    expect((await verifyRecovery(diagnostics.id)).status).toBe('RUNNING')
    await fixture.db.signingDevice.update({where:{id:a.device.id},data:{lastHeartbeatAt:new Date()}})
    expect((await verifyRecovery(diagnostics.id)).status).toBe('SUCCEEDED')
    // Explicitly synthetic device; no agent connection or customer enrollment exists here.
    const revoke=await executeRecovery({kind:'device',targetId:a.device.id,officeId:a.office.id,action:'device.revoke',fingerprint:dp.fingerprint,confirmation:`device.revoke ${a.device.id} oficina ${a.office.id}`,reason:'Safe isolated enrollment verification',idempotencyKey:randomUUID()})
    expect(revoke.status).toBe('SUCCEEDED')
    expect((await fixture.db.signingDevice.findUniqueOrThrow({where:{id:a.device.id}})).revokedAt).not.toBeNull()
    expect(await fixture.db.platformAudit.count({where:{action:'recovery.accepted',targetId:revoke.id}})).toBe(1)
    await expect(previewRecovery({kind:'device',targetId:a.device.id,officeId:b.office.id})).rejects.toThrow('NOT_FOUND')
    const rollbackJob=await fixture.db.reportJob.create({data:{officeId:a.office.id,type:'GENERATE',origin:'MANUAL',reportKind:'daily',idempotencyKey:randomUUID(),requestedPeriodStart:new Date('2026-03-01'),requestedPeriodEnd:new Date('2026-03-02'),requestedPeriodLabel:'test',payload:{}}})
    const rollbackPreview=await previewRecovery({kind:'report',targetId:rollbackJob.id,officeId:a.office.id})
    // Fault injection applies only to our generated schema, never public tables.
    await fixture.db.$executeRawUnsafe(`CREATE FUNCTION "${fixture.schema}".reject_recovery_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'recovery.accepted' THEN RAISE EXCEPTION 'synthetic audit outage'; END IF; RETURN NEW; END $$`)
    await fixture.db.$executeRawUnsafe(`CREATE TRIGGER reject_recovery_audit BEFORE INSERT ON "${fixture.schema}".platform_audit FOR EACH ROW EXECUTE FUNCTION "${fixture.schema}".reject_recovery_audit()`)
    const rollbackInput={kind:'report',targetId:rollbackJob.id,officeId:a.office.id,action:'report.cancel',fingerprint:rollbackPreview.fingerprint,confirmation:`report.cancel ${rollbackJob.id} oficina ${a.office.id}`,reason:'Safe audit failure injection',idempotencyKey:randomUUID()}
    await expect(executeRecovery(rollbackInput)).rejects.toThrow()
    expect((await fixture.db.reportJob.findUniqueOrThrow({where:{id:rollbackJob.id}})).status).toBe('QUEUED')
    const unknown=await fixture.db.operationsRecovery.findUniqueOrThrow({where:{idempotencyKey:rollbackInput.idempotencyKey}})
    expect(unknown.status).toBe('OUTCOME_UNKNOWN')
    expect(await fixture.db.platformAudit.count({where:{targetId:unknown.id,action:'recovery.result'}})).toBe(1)
    await expect(executeRecovery({...rollbackInput,idempotencyKey:randomUUID()})).rejects.toThrow('PRIOR_OUTCOME_UNKNOWN')
  } finally {await fixture.dispose()}
},240000)
