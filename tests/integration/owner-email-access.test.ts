import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only',()=>({}))
const s=vi.hoisted(()=>({grant:true,active:true,confirmed:true,email:'owner@example.invalid',sub:'auth-owner',proof:null as any,method:'EMAIL',claims:{sub:'auth-owner',session_id:'12345678-1234-1234-1234-123456789abc',aal:'aal1',amr:[{method:'password',timestamp:1}]},read:vi.fn()}))
vi.mock('@/lib/prisma',()=>({prisma:{user:{findUnique:async()=>({id:'owner',authUserId:'auth-owner',email:'owner@example.invalid',officeId:12,officeName:'Test',isOfficeAdmin:true,isActive:s.active,office:{cacheRevision:1}})},platformGrant:{findUnique:async()=>s.grant?{userId:'owner',role:'OWNER',revokedAt:null,verificationMethod:s.method,verificationEmail:'owner@example.invalid',createdAt:new Date(0)}:null},ownerEmailSession:{findUnique:async(args:unknown)=>{s.read(args);return s.proof}}}}))
vi.mock('@/lib/supabaseServer',()=>({createServerSupabaseClient:async()=>({auth:{getUser:async()=>({data:{user:{id:s.sub,email:s.email,email_confirmed_at:s.confirmed?'2026-01-01':null}},error:null}),getClaims:async()=>({data:{claims:s.claims},error:null}),mfa:{listFactors:async()=>({data:{all:[]},error:null})}}})}))
import { resolveAuthenticatedUser } from '@/lib/auth-server'
import { requirePlatformOwner, requireRecoveryOwner } from '@/lib/operations/auth'
beforeEach(()=>{s.grant=true;s.active=true;s.confirmed=true;s.email='owner@example.invalid';s.sub='auth-owner';s.proof=null;s.method='EMAIL';s.claims={sub:'auth-owner',session_id:'12345678-1234-1234-1234-123456789abc',aal:'aal1',amr:[{method:'password',timestamp:1}]};s.read.mockClear()})
it('blocks password-only access to ordinary protected APIs as well as platform endpoints',async()=>{
  await expect(resolveAuthenticatedUser()).rejects.toMatchObject({code:'EMAIL_VERIFICATION_REQUIRED'})
  await expect(requirePlatformOwner()).rejects.toMatchObject({code:'MFA_REQUIRED'})
})
it('requires server-stored email proof without falsely upgrading Supabase AAL',async()=>{
  s.proof={verifiedAt:new Date(),verifiedUntil:new Date(Date.now()+3600000)}
  await expect(resolveAuthenticatedUser()).resolves.toMatchObject({id:'owner'})
  await expect(requirePlatformOwner()).resolves.toMatchObject({id:'owner'})
  expect(s.claims.aal).toBe('aal1')
  expect(s.read).toHaveBeenCalledWith({where:{id:expect.stringMatching(/^[a-f0-9]{64}$/)}})
})
it('requires a recent code for recovery mutations',async()=>{
  s.proof={verifiedAt:new Date(Date.now()-11*60000),verifiedUntil:new Date(Date.now()+3600000)}
  await expect(requireRecoveryOwner('report.cancel')).rejects.toMatchObject({code:'RECENT_MFA_REQUIRED'})
  await expect(requireRecoveryOwner('reconcile')).resolves.toMatchObject({id:'owner'})
})
it('does not accept unverified or changed email, OTP-only login or disabled accounts',async()=>{
  s.proof={verifiedAt:new Date(),verifiedUntil:new Date(Date.now()+3600000)}
  s.confirmed=false;await expect(requirePlatformOwner()).rejects.toThrow()
  s.confirmed=true;s.email='changed@example.invalid';await expect(requirePlatformOwner()).rejects.toThrow()
  s.email='owner@example.invalid';s.claims.amr=[{method:'otp',timestamp:1}];await expect(requirePlatformOwner()).rejects.toThrow()
  s.active=false;await expect(resolveAuthenticatedUser()).rejects.toMatchObject({code:'ACCOUNT_DISABLED'})
})
it('does not turn email proof into a platform grant or change ordinary user sign-in',async()=>{
  s.grant=false;s.proof={verifiedAt:new Date(),verifiedUntil:new Date(Date.now()+3600000)}
  await expect(resolveAuthenticatedUser()).resolves.toMatchObject({id:'owner'})
  await expect(requirePlatformOwner()).rejects.toMatchObject({code:'PLATFORM_ACCESS_DENIED'})
  expect(s.read).not.toHaveBeenCalled()
})
it('retains native TOTP enforcement for owners not explicitly provisioned for email',async()=>{
  s.method='TOTP';s.proof={verifiedAt:new Date(),verifiedUntil:new Date(Date.now()+3600000)}
  await expect(requirePlatformOwner()).rejects.toMatchObject({code:'MFA_REQUIRED'})
})
