import { expect, it } from 'vitest'
import { codeDigest, codeMatches, emailProofValid, ownerEmailBinding } from '@/lib/auth/ownerEmailCore'
const now=Date.now(),secret='isolated-test-secret-not-a-real-key'.repeat(2)
const identity={userId:'local',authUserId:'auth',email:'owner@example.invalid',grantCreatedAt:new Date(0),claims:{sub:'auth',session_id:'12345678-1234-1234-1234-123456789abc',amr:[{method:'password',timestamp:Math.floor(now/1000)}]}}
it('binds proof to canonical identity, grant, email, password authentication and individual login session',()=>{
  const binding=ownerEmailBinding(identity,now)
  expect(binding).not.toBe(ownerEmailBinding({...identity,email:'other@example.invalid'},now))
  expect(binding).not.toBe(ownerEmailBinding({...identity,grantCreatedAt:new Date(1)},now))
  expect(binding).not.toBe(ownerEmailBinding({...identity,claims:{...identity.claims,session_id:'22345678-1234-1234-1234-123456789abc'}},now))
  for(const claims of [{...identity.claims,sub:'attacker'},{...identity.claims,session_id:undefined},{...identity.claims,amr:[{method:'otp',timestamp:now/1000}]},{...identity.claims,amr:[{method:'password',timestamp:now/1000+60}]}])expect(()=>ownerEmailBinding({...identity,claims},now)).toThrow()
})
it('uses keyed code hashes and does not allow one session code to verify another',()=>{
  const digest=codeDigest(secret,'session-one','012345')
  expect(digest).not.toContain('012345')
  expect(codeMatches(digest,codeDigest(secret,'session-one','012345'))).toBe(true)
  expect(codeMatches(digest,codeDigest(secret,'session-two','012345'))).toBe(false)
  expect(codeMatches(digest,codeDigest(secret,'session-one','012346'))).toBe(false)
  expect(()=>codeDigest('weak','session-one','012345')).toThrow()
})
it('expires login proof and requires recent verification for sensitive actions',()=>{
  const proof={verifiedAt:new Date(now-11*60000),verifiedUntil:new Date(now+60000)}
  expect(emailProofValid(proof,false,now)).toBe(true)
  expect(emailProofValid(proof,true,now)).toBe(false)
  expect(emailProofValid({...proof,verifiedUntil:new Date(now)},false,now)).toBe(false)
  expect(emailProofValid({...proof,verifiedAt:new Date(now+1)},false,now)).toBe(false)
  expect(emailProofValid(null,false,now)).toBe(false)
})
