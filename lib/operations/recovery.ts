import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSigningService } from '@/lib/signing/service'
import { createDeviceService } from '@/lib/signing/devices'
import { lockSigningOffice } from '@/lib/signing/transaction'
import { retryReportJob, cancelReportJob } from '@/lib/reports/jobs'
import { requirePlatformOwner, requireRecoveryOwner, OperationsAccessError } from './auth'
import { permits } from './policy'
import { recoveryActions, recoveryDecision, recoveryLabels, type RecoveryAction, type RecoveryTarget } from './recovery-policy'
import { signingTrace } from '@/lib/signing/telemetry'
import { SigningError } from '@/lib/signing/core'
import { DeviceError } from '@/lib/signing/deviceProtocol'
import { ApiError } from '@/lib/api/server'

const targetSchema = z.object({ kind:z.enum(['device','signing','report','receipt','email']), targetId:z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/), officeId:z.coerce.number().int().positive() })
const executeSchema = targetSchema.extend({ action:z.enum(recoveryActions), idempotencyKey:z.string().uuid(), fingerprint:z.string().regex(/^[a-f0-9]{64}$/), confirmation:z.string().max(240), reason:z.string().trim().min(10).max(500).refine(v=>! /-----BEGIN|(?:pin|password|token|secret|cookie|authorization|contraseña)\s*[:=]/i.test(v)) }).strict()
type Target = z.infer<typeof targetSchema>
type Db = Prisma.TransactionClient
const json = (value:unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value))
const hash = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

async function snapshot(db:Db, target:Target) {
  const where = { id:target.targetId, officeId:target.officeId }
  if(target.kind==='device') {
    const d=await db.signingDevice.findFirst({where,select:{id:true,officeId:true,role:true,health:true,healthErrorCode:true,agentVersion:true,revokedAt:true,lastHeartbeatAt:true,certificateThumbprint:true}})
    if(!d)throw new OperationsAccessError(404,'NOT_FOUND')
    const pending=await db.signingItem.count({where:{officeId:d.officeId,signerFingerprint:d.certificateThumbprint??'__none__',status:{in:['QUEUED','CLAIMED','SIGNING','RETRY_PENDING','WAITING_FOR_OPERATOR']}}})
    return {kind:target.kind,status:d.revokedAt?'REVOKED':'ENROLLED',revoked:!!d.revokedAt,pending,heartbeat:d.lastHeartbeatAt?.toISOString()??null,health:d.health,code:d.healthErrorCode,version:d.agentVersion&&/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]{1,40})?$/.test(d.agentVersion)?d.agentVersion:null}
  }
  if(target.kind==='signing') {
    const item=await db.signingItem.findFirst({where,select:{status:true,attemptCount:true,maxAttempts:true,errorCode:true,sourceVersionId:true,signerFingerprint:true,jobId:true}})
    if(!item)throw new OperationsAccessError(404,'NOT_FOUND')
    const [signature,artifact,ready,remaining]=await Promise.all([
      db.documentSignature.count({where:{officeId:target.officeId,sourceVersionId:item.sourceVersionId,signerFingerprint:item.signerFingerprint}}),
      db.signingArtifact.count({where:{officeId:target.officeId,itemId:target.targetId}}),
      db.signingDevice.count({where:{officeId:target.officeId,revokedAt:null,role:{in:['SIGNER','SIGNER_RECEIVER']},certificateThumbprint:item.signerFingerprint,health:{in:['TOKEN_READY','CERT_EXPIRING']},healthErrorCode:null,lastHeartbeatAt:{gte:new Date(Date.now()-90000),lte:new Date()},certificateExpiresAt:{gt:new Date()}}}),
      db.signingItem.count({where:{jobId:item.jobId,officeId:target.officeId,status:{notIn:['COMPLETED','CANCELLED']}}}),
    ])
    return {kind:target.kind,status:item.status,attempts:item.attemptCount,maxAttempts:item.maxAttempts,code:item.errorCode,signature:signature>0,artifact:artifact>0,ready:ready>0,jobId:item.jobId,remaining}
  }
  if(target.kind==='report') {
    const job=await db.reportJob.findFirst({where,select:{status:true,type:true,attemptCount:true,payload:true,reportId:true,reportVersionId:true,deliveryAttemptId:true,resultCode:true,requestedPeriodStart:true,requestedPeriodEnd:true}})
    if(!job)throw new OperationsAccessError(404,'NOT_FOUND')
    const payload=job.payload as {force?:boolean;deliverAfter?:boolean}|null
    const [reports,child]=await Promise.all([db.generatedReport.count({where:{officeId:target.officeId,periodStart:job.requestedPeriodStart,periodEnd:job.requestedPeriodEnd}}),db.reportJob.count({where:{officeId:target.officeId,retryOfJobId:target.targetId}})])
    return {kind:target.kind,status:job.status,attempts:job.attemptCount,unsafePayload:job.type!=='GENERATE'||!!payload?.force||!!payload?.deliverAfter,reportExists:reports>0||!!job.reportId||!!job.reportVersionId||!!job.deliveryAttemptId,child:child>0,version:job.reportVersionId,code:job.resultCode}
  }
  if(target.kind==='receipt') {
    const row=await db.receiptGenerationReservation.findFirst({where,select:{status:true,receiptId:true,documentVersionId:true,uploadedAt:true,completedAt:true,failureCode:true}})
    if(!row)throw new OperationsAccessError(404,'NOT_FOUND')
    return {kind:target.kind,status:row.status,receiptId:row.receiptId,version:row.documentVersionId,uploadedAt:row.uploadedAt?.toISOString()??null,completedAt:row.completedAt?.toISOString()??null,code:row.failureCode,uncertainty:'Sin confirmación no se presume que no exista un archivo cargado. Reintento no habilitado.'}
  }
  const row=await db.recibosDispatchRecipient.findFirst({where:{id:target.targetId,batch:{officeId:target.officeId}},select:{status:true,attemptCount:true,sentAt:true,completedAt:true,resolvedAt:true}})
  if(!row)throw new OperationsAccessError(404,'NOT_FOUND')
  return {kind:target.kind,status:row.status,attempts:row.attemptCount,acceptedAt:row.sentAt?.toISOString()??null,completedAt:row.completedAt?.toISOString()??null,resolvedAt:row.resolvedAt?.toISOString()??null,uncertainty:'La ausencia de aceptación registrada no demuestra que el proveedor no envió. No se reenvía desde este Centro.'}
}
function stateFingerprint(state:Awaited<ReturnType<typeof snapshot>>) {
  // Device heartbeat is expected to change every 30s; revocation still revalidates pending impact.
  if(state.kind==='device') return hash({kind:state.kind,status:state.status,pending:state.pending})
  return hash(state)
}
function confirmation(action:RecoveryAction,target:Target) { return `${action} ${target.targetId} oficina ${target.officeId}` }
export async function previewRecovery(raw:unknown) {
  const actor=await requirePlatformOwner(), target=targetSchema.parse(raw), state=await snapshot(prisma,target)
  await prisma.platformAudit.create({data:{actorUserId:actor.id,action:'recovery.preview',targetId:target.targetId,details:{...target,prior:json(state)}}})
  return { ...target,state,fingerprint:stateFingerprint(state),actions:recoveryActions.map(action=>({action,label:recoveryLabels[action],...recoveryDecision(action,state),confirmation:confirmation(action,target)})) }
}
async function grant(db:Db,actorId:string,action:RecoveryAction) {
  // Lock against concurrent grant revocation/role edits during the mutation.
  await db.$queryRaw`SELECT "userId" FROM platform_grants WHERE "userId" = ${actorId} FOR SHARE`
  const row=await db.platformGrant.findFirst({where:{userId:actorId,revokedAt:null,user:{isActive:true}},select:{role:true}})
  if(!row||!permits(row.role,`recovery.${action}`))throw new OperationsAccessError(403,'PLATFORM_ACCESS_DENIED')
}
export async function executeRecovery(raw:unknown, correlationId:string=randomUUID()) {
  const input=executeSchema.parse(raw), actor=await requireRecoveryOwner(input.action)
  const requestHash=hash({action:input.action,kind:input.kind,targetId:input.targetId,officeId:input.officeId,fingerprint:input.fingerprint})
  // Durable request precedes business execution. Commit uncertainty can be queried using this same key.
  const request=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`
    const old=await tx.operationsRecovery.findUnique({where:{idempotencyKey:input.idempotencyKey}})
    if(old){if(old.fingerprint!==requestHash)throw new OperationsAccessError(409,'IDEMPOTENCY_CONFLICT');await tx.platformAudit.create({data:{actorUserId:actor.id,action:'recovery.replayed',targetId:old.id,details:{correlationId}}});return old}
    const observed=await snapshot(tx,input)
    const row=await tx.operationsRecovery.create({data:{idempotencyKey:input.idempotencyKey,action:input.action,targetId:input.targetId,officeId:input.officeId,actorId:actor.id,reason:input.reason,correlationId,fingerprint:requestHash,before:json(observed)}})
    await tx.platformAudit.create({data:{actorUserId:actor.id,action:'recovery.requested',targetId:row.id,details:{...input,reason:input.reason,correlationId}}})
    return row
  })
  if(request.status!=='REQUESTED')return request
  try {
    return await prisma.$transaction(async tx=>{
      await lockSigningOffice(tx,input.officeId)
      await tx.$queryRaw`SELECT id FROM operations_recoveries WHERE id=${request.id} FOR UPDATE`
      const current=await tx.operationsRecovery.findUniqueOrThrow({where:{id:request.id}})
      if(current.status!=='REQUESTED')return current
      await grant(tx,actor.id,input.action)
      if(input.kind==='report') await tx.$queryRaw`SELECT id FROM report_jobs WHERE id=${input.targetId} AND "officeId"=${input.officeId} FOR UPDATE`
      const state=await snapshot(tx,input)
      const intentKey=hash({action:input.action,targetId:input.targetId,officeId:input.officeId,fingerprint:input.fingerprint})
      if(!['diagnostics','reconcile'].includes(input.action)) {
        const prior=await tx.operationsRecovery.findUnique({where:{intentKey}})
        if(prior) {
          await tx.operationsRecovery.update({where:{id:request.id},data:{status:'ACCEPTED',resultId:prior.id,safeCode:'DUPLICATE_INTENT',before:json(state)}})
          await tx.platformAudit.create({data:{actorUserId:actor.id,action:'recovery.deduplicated',targetId:request.id,details:{original:prior.id,correlationId}}})
          return prior
        }
        if(await tx.operationsRecovery.count({where:{targetId:input.targetId,officeId:input.officeId,action:input.action,status:'OUTCOME_UNKNOWN',id:{not:request.id}}}))throw new OperationsAccessError(409,'PRIOR_OUTCOME_UNKNOWN')
      }
      if(stateFingerprint(state)!==input.fingerprint)throw new OperationsAccessError(409,'TARGET_CHANGED')
      if(!recoveryDecision(input.action,state).eligible)throw new OperationsAccessError(409,'RECOVERY_INELIGIBLE')
      if(input.confirmation!==confirmation(input.action,input))throw new OperationsAccessError(400,'CONFIRMATION_REQUIRED')
      const context={officeId:input.officeId,userId:actor.id}
      const db={$transaction:async(fn:(tx:Db)=>Promise<unknown>)=>fn(tx)} as unknown as PrismaClient
      const queue=createSigningService(db,undefined,async(t,c,action)=>{if(c.userId!==actor.id||c.officeId!==input.officeId||action!==input.action)throw new OperationsAccessError(403,'CAPABILITY_MISMATCH');await grant(t,actor.id,action)})
      let resultId:string|null=null, status='ACCEPTED'
      await signingTrace.run(correlationId,async()=>{
        if(input.action==='signing.retry')await queue.retry(context,input.targetId,{attemptCount:state.attempts!,reviewed:true})
        if(input.action==='signing.cancel'){await queue.cancel(context,input.targetId,{attemptCount:0,beforeSigningOnly:true});status='SUCCEEDED'}
        if(input.action==='device.revoke'){await createDeviceService(db,{},async(t,c)=>{if(c.userId!==actor.id||c.officeId!==input.officeId)throw new OperationsAccessError(403,'CAPABILITY_MISMATCH');await grant(t,actor.id,'device.revoke')}).revoke(context,input.targetId);status='SUCCEEDED'}
        if(input.action==='report.retry'){const child=await retryReportJob({officeId:input.officeId,jobId:input.targetId,actorUserId:actor.id,idempotencyKey:`recovery:${request.id}`},{db:tx,deferred:true});resultId=child.id}
        if(input.action==='report.cancel'){await cancelReportJob({officeId:input.officeId,jobId:input.targetId,actorUserId:actor.id,queuedOnly:true,requestId:correlationId},tx);status='SUCCEEDED'}
        if(input.action==='reconcile')status='SUCCEEDED'
      })
      const confirmed = status==='SUCCEEDED' ? input.action==='reconcile'?state:await snapshot(tx,input) : undefined
      const updated=await tx.operationsRecovery.update({where:{id:request.id},data:{status,resultId,before:json(state),evidence:confirmed?json(confirmed):undefined,intentKey:['diagnostics','reconcile'].includes(input.action)?null:intentKey}})
      await tx.platformAudit.create({data:{actorUserId:actor.id,action:'recovery.accepted',targetId:request.id,details:{action:input.action,prior:json(state),status,resultId,reason:input.reason,correlationId,officeId:input.officeId}}})
      return updated
    },{timeout:30000,maxWait:10000})
  } catch(error) {
    const known=error instanceof OperationsAccessError||error instanceof SigningError||error instanceof DeviceError||error instanceof ApiError&&error.status<500
    // A lost commit response is not a confirmed rollback. Never overwrite a committed action.
    await prisma.$transaction(async tx=>{
      const changed=await tx.operationsRecovery.updateMany({where:{id:request.id,status:'REQUESTED'},data:{status:known?'FAILED':'OUTCOME_UNKNOWN',safeCode:known?error.code:'EXECUTION_OUTCOME_UNKNOWN'}})
      if(changed.count)await tx.platformAudit.create({data:{actorUserId:actor.id,action:'recovery.result',targetId:request.id,details:{status:known?'FAILED':'OUTCOME_UNKNOWN',code:known?error.code:'EXECUTION_OUTCOME_UNKNOWN',correlationId}}})
    }).catch(()=>undefined)
    if(known&&!(error instanceof OperationsAccessError))throw new OperationsAccessError(error instanceof SigningError?409:error.status,error.code)
    throw error
  }
}
/** Verification is read-only with respect to business data. It never retries or resolves incidents. */
export async function verifyRecovery(id:string) {
  const actor=await requirePlatformOwner()
  const row=await prisma.operationsRecovery.findUnique({where:{id}})
  if(!row)throw new OperationsAccessError(404,'NOT_FOUND')
  const before=row.before as {kind:RecoveryTarget;heartbeat?:string;attempts?:number}
  const target={kind:before.kind,targetId:row.action==='report.retry'&&row.resultId?row.resultId:row.targetId,officeId:row.officeId}
  if(row.safeCode==='DUPLICATE_INTENT') return { ...row, evidence:{originalAction:row.resultId} }
  const state=await snapshot(prisma,target)
  let status=row.status
  if(row.action==='diagnostics'&&['ACCEPTED','RUNNING','OUTCOME_UNKNOWN'].includes(status))status=state.kind==='device'&&state.heartbeat&&new Date(state.heartbeat)>row.createdAt?'SUCCEEDED':Date.now()-row.createdAt.getTime()>300000?'OUTCOME_UNKNOWN':'RUNNING'
  if(row.action==='signing.retry'&&['ACCEPTED','RUNNING','OUTCOME_UNKNOWN','PARTIAL'].includes(status))status=state.status==='COMPLETED'&&state.signature?'SUCCEEDED':state.status==='FAILED'?'FAILED':['CLAIMED','SIGNING'].includes(state.status)?'RUNNING':state.status==='WAITING_FOR_OPERATOR'?'PARTIAL':'ACCEPTED'
  if(row.action==='report.retry'&&row.resultId&&['ACCEPTED','RUNNING','OUTCOME_UNKNOWN'].includes(status))status=state.status==='SUCCEEDED'&&(state.version||state.code==='NO_ACTIVITY')?'SUCCEEDED':state.status==='FAILED'?'FAILED':state.status==='RUNNING'?'RUNNING':state.status==='CANCELLED'?'PARTIAL':'ACCEPTED'
  const evidence={...state,meaning:row.action==='reconcile'?'Conciliación de evidencia; no confirma reparación ni autoriza reintentos.':'Estado actual observado. Otros elementos pendientes se muestran por separado.'}
  await prisma.$transaction(async tx=>{
    const changed=await tx.operationsRecovery.updateMany({where:{id,status:row.status,updatedAt:row.updatedAt},data:{status,evidence:json(evidence)}})
    if(!changed.count)throw new OperationsAccessError(409,'VERIFICATION_CHANGED')
    if(changed.count)await tx.platformAudit.create({data:{actorUserId:actor.id,action:'recovery.verified',targetId:id,details:{previousStatus:row.status,status,evidence:json(evidence),correlationId:row.correlationId}}})
  })
  return {...row,status,evidence}
}
