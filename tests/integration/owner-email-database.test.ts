import { expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
vi.mock('server-only',()=>({}))
vi.mock('@/lib/email/system-mailer',()=>({createSystemMailAdapter:()=>{throw new Error('LIVE_EMAIL_FORBIDDEN')}}))
import { ownerEmailService } from '@/lib/auth/ownerEmail'
import { emailProofValid } from '@/lib/auth/ownerEmailCore'
import { createSigningTestDatabase } from './signing-test-database'
import { signingFixture } from './signing-support'
it.skipIf(process.env.TEST_OWNER_EMAIL_DATABASE!=='true')('isolates and races email verification, commits failed attempts, blocks replay, expires codes and fails closed on mail/audit errors',async()=>{
  const fixture=await createSigningTestDatabase(['platform_grants','platform_audit','owner_email_sessions'])
  try {
    const a=await signingFixture(fixture.db)
    const grant=await fixture.db.platformGrant.create({data:{userId:a.user.id,verificationMethod:'EMAIL',verificationEmail:a.user.email}})
    const who={userId:a.user.id,email:a.user.email,binding:randomUUID(),grantCreatedAt:grant.createdAt}
    const sent:string[]=[]
    const service=ownerEmailService(fixture.db,async(_email,code)=>{sent.push(code)},()=> 'synthetic-key-for-isolated-tests-only'.repeat(2))
    const sends=await Promise.all([service.start(who),service.start(who)])
    expect(sends.filter(x=>x.sent)).toHaveLength(1);expect(sent).toHaveLength(1)
    const pending=await fixture.db.ownerEmailSession.findUniqueOrThrow({where:{id:who.binding}})
    expect(pending.codeHash).not.toBe(sent[0]);expect(emailProofValid(pending)).toBe(false)
    const guesses=await Promise.allSettled([service.verify(who,sent[0]),service.verify(who,sent[0])])
    expect(guesses.filter(x=>x.status==='fulfilled')).toHaveLength(1)
    expect(emailProofValid(await fixture.db.ownerEmailSession.findUnique({where:{id:who.binding}}))).toBe(true)
    expect(await fixture.db.platformAudit.count({where:{action:'owner.email.verified'}})).toBe(1)
    const another={...who,binding:randomUUID()}
    expect(emailProofValid(await fixture.db.ownerEmailSession.findUnique({where:{id:another.binding}}))).toBe(false)
    await service.start(another)
    const wrong=sent[1]==='000000'?'111111':'000000'
    for(let n=0;n<5;n++)await expect(service.verify(another,wrong)).rejects.toThrow('INVALID_EMAIL_CODE')
    expect((await fixture.db.ownerEmailSession.findUniqueOrThrow({where:{id:another.binding}})).attempts).toBe(5)
    await expect(service.verify(another,sent[1])).rejects.toThrow('INVALID_EMAIL_CODE')
    const expired={...who,binding:randomUUID()}
    await service.start(expired)
    await fixture.db.ownerEmailSession.update({where:{id:expired.binding},data:{codeExpiresAt:new Date(0)}})
    await expect(service.verify(expired,sent[2])).rejects.toThrow('INVALID_EMAIL_CODE')
    await expect(service.start({...who,binding:randomUUID()})).rejects.toThrow('EMAIL_SEND_LIMITED')
    const b=await signingFixture(fixture.db),bg=await fixture.db.platformGrant.create({data:{userId:b.user.id,verificationMethod:'EMAIL',verificationEmail:b.user.email}})
    const bWho={userId:b.user.id,email:b.user.email,binding:randomUUID(),grantCreatedAt:bg.createdAt}
    const failing=ownerEmailService(fixture.db,async()=>{throw new Error('secret-provider-response')},()=> 'synthetic-key-for-isolated-tests-only'.repeat(2))
    await expect(failing.start(bWho)).rejects.toThrow('EMAIL_DELIVERY_UNCONFIRMED')
    expect((await fixture.db.ownerEmailSession.findUniqueOrThrow({where:{id:bWho.binding}})).codeHash).toBeNull()
    const verifyWho={...bWho,binding:randomUUID()}
    await service.start(verifyWho)
    await fixture.db.$executeRawUnsafe(`CREATE FUNCTION "${fixture.schema}".reject_email_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'owner.email.verified' THEN RAISE EXCEPTION 'synthetic audit outage'; END IF; RETURN NEW; END $$`)
    await fixture.db.$executeRawUnsafe(`CREATE TRIGGER reject_email_audit BEFORE INSERT ON "${fixture.schema}".platform_audit FOR EACH ROW EXECUTE FUNCTION "${fixture.schema}".reject_email_audit()`)
    await expect(service.verify(verifyWho,sent.at(-1)!)).rejects.toThrow()
    expect(emailProofValid(await fixture.db.ownerEmailSession.findUnique({where:{id:verifyWho.binding}}))).toBe(false)
    const history=JSON.stringify(await fixture.db.platformAudit.findMany())
    expect(history).not.toContain('secret-provider-response')
    expect(history).not.toContain('codeHash')
  } finally {await fixture.dispose()}
},180000)
