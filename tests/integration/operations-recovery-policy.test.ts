import { expect, it } from 'vitest'
import { recentMfa, recoveryDecision, recoveryActions } from '@/lib/operations/recovery-policy'
import { permits } from '@/lib/operations/policy'
const now=Date.now()
it('requires a recent verified second factor, not JWT refresh or client metadata',()=>{
  expect(recentMfa({aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(now/1000)}]},now)).toBe(true)
  for(const claims of [{aal:'aal1',amr:[{method:'totp',timestamp:now/1000}]},{aal:'aal2',amr:[{method:'token_refresh',timestamp:now/1000}]},{aal:'aal2',amr:[{method:'totp',timestamp:(now-601000)/1000}]},{aal:'aal2',amr:[{method:'totp',timestamp:(now+1000)/1000}]},{aal:'aal2',user_metadata:{recentMfa:true}}])expect(recentMfa(claims,now)).toBe(false)
})
it('denies every capability to office admins and unprovisioned future roles',()=>{
  for(const action of recoveryActions)for(const role of [null,'ADMIN','SUPPORT','OPERATOR'])expect(permits(role,`recovery.${action}`)).toBe(false)
  for(const action of recoveryActions)expect(permits('OWNER',`recovery.${action}`)).toBe(true)
})
it('blocks uncertain, partially stored, exhausted and unhealthy signing retries',()=>{
  const state={kind:'signing' as const,status:'FAILED',attempts:1,maxAttempts:4,code:'PIN_REQUIRED',ready:true}
  expect(recoveryDecision('signing.retry',state).eligible).toBe(true)
  for(const patch of [{code:'OUTCOME_UNKNOWN'},{code:'AGENT_UPDATE_REQUIRED'},{code:'TOKEN_MISSING'},{code:'DRIVER_ERROR'},{code:'NETWORK'},{code:'STORAGE'},{signature:true},{artifact:true},{attempts:4},{ready:false},{status:'SIGNING'}])expect(recoveryDecision('signing.retry',{...state,...patch}).eligible).toBe(false)
})
it('restricts cancellation to never-started queues and report retries without publication or delivery',()=>{
  expect(recoveryDecision('signing.cancel',{kind:'signing',status:'QUEUED',attempts:0}).eligible).toBe(true)
  expect(recoveryDecision('signing.cancel',{kind:'signing',status:'QUEUED',attempts:1}).eligible).toBe(false)
  expect(recoveryDecision('report.cancel',{kind:'report',status:'RUNNING',attempts:1}).eligible).toBe(false)
  expect(recoveryDecision('report.retry',{kind:'report',status:'FAILED',unsafePayload:false,reportExists:false,child:false}).eligible).toBe(true)
  for(const patch of [{unsafePayload:true},{reportExists:true},{child:true}])expect(recoveryDecision('report.retry',{kind:'report',status:'FAILED',...patch}).eligible).toBe(false)
})
it('offers evidence reconciliation, not resend or arbitrary account mutation',()=>{
  expect(recoveryDecision('reconcile',{kind:'email',status:'failed'}).eligible).toBe(true)
  expect(recoveryDecision('report.retry',{kind:'email',status:'FAILED'}).eligible).toBe(false)
  expect(recoveryActions.some(x=>(x as string).includes('user'))).toBe(false)
})
