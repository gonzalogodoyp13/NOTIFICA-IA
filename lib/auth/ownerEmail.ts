import 'server-only'
import { createHash, randomInt, randomUUID } from 'node:crypto'
import type { Prisma, PlatformGrant } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { createSystemMailAdapter } from '@/lib/email/system-mailer'
import type { AuthUser } from '@/lib/auth-core'
import { codeDigest, codeMatches, emailCodeLifetimeMs, emailProofValid, emailSessionLifetimeMs, ownerEmailBinding } from './ownerEmailCore'

export class OwnerEmailError extends Error {
  constructor(public code:string,public status=403){super(code)}
}
export async function ownerEmailIdentity(user:AuthUser, suppliedGrant?:PlatformGrant) {
  const grant=suppliedGrant??await prisma.platformGrant.findUnique({where:{userId:user.id}})
  if(!grant||grant.revokedAt||grant.role!=='OWNER'||grant.verificationMethod!=='EMAIL'||!grant.verificationEmail)throw new OwnerEmailError('PLATFORM_ACCESS_DENIED')
  const client=await createServerSupabaseClient()
  const [{data:identity,error:identityError},{data,error}]=await Promise.all([client.auth.getUser(),client.auth.getClaims()])
  const email=grant.verificationEmail.toLowerCase()
  if(identityError||error||!identity.user?.email_confirmed_at||identity.user.id!==user.authUserId||identity.user.email?.toLowerCase()!==email||user.email.toLowerCase()!==email||!data?.claims)throw new OwnerEmailError('VERIFIED_OWNER_EMAIL_REQUIRED')
  let binding:string
  try {binding=ownerEmailBinding({userId:user.id,authUserId:user.authUserId,email,grantCreatedAt:grant.createdAt,claims:data.claims})}
  catch {throw new OwnerEmailError('PASSWORD_LOGIN_REQUIRED')}
  return {userId:user.id,email,binding,grantCreatedAt:grant.createdAt}
}
type Identity=Awaited<ReturnType<typeof ownerEmailIdentity>>
type Tx=Prisma.TransactionClient
const audit=(tx:Tx,who:Identity,action:string)=>tx.platformAudit.create({data:{actorUserId:who.userId,action,targetId:who.userId,details:{method:'email-code',sessionReference:who.binding}}})
async function lockOwner(tx:Tx,who:Identity) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner-email:${who.userId}`}))`
  await tx.$queryRaw`SELECT "userId" FROM platform_grants WHERE "userId"=${who.userId} FOR SHARE`
  const grant=await tx.platformGrant.findFirst({where:{userId:who.userId,role:'OWNER',revokedAt:null,verificationMethod:'EMAIL',verificationEmail:who.email,createdAt:who.grantCreatedAt,user:{isActive:true,email:{equals:who.email,mode:'insensitive'}}}})
  if(!grant)throw new OwnerEmailError('PLATFORM_ACCESS_DENIED')
}
async function quota(tx:Tx,userId:string,kind:string,seconds:number,limit:number) {
  const key=createHash('sha256').update(`owner-email:${kind}:${userId}`).digest('hex')
  const rows=await tx.$queryRaw<Array<{count:number}>>`
    INSERT INTO device_rate_limits (key,"windowAt",count)
    VALUES (${key},to_timestamp(floor(extract(epoch from statement_timestamp())/${seconds}::int)*${seconds}::int),1)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN device_rate_limits."windowAt"=EXCLUDED."windowAt" THEN LEAST(device_rate_limits.count+1,1000000) ELSE 1 END,"windowAt"=EXCLUDED."windowAt" RETURNING count`
  return rows[0]?.count<=limit
}
export async function requireOwnerEmail(user:AuthUser,fresh=false,grant?:PlatformGrant) {
  const who=await ownerEmailIdentity(user,grant)
  const row=await prisma.ownerEmailSession.findUnique({where:{id:who.binding}})
  if(!emailProofValid(row,fresh))throw new OwnerEmailError(fresh?'RECENT_EMAIL_VERIFICATION_REQUIRED':'EMAIL_VERIFICATION_REQUIRED')
  return who
}
/** No browser identity, address, arbitrary mail content or redirect is accepted. */
export function ownerEmailService(db=prisma,sendCode=async(email:string,code:string,deliveryKey:string)=>{
  // Authentication must not fall back to a customer's mailbox or pretend dry-run delivery succeeded.
  if(process.env.SYSTEM_MAIL_PROVIDER!=='resend')throw new OwnerEmailError('EMAIL_VERIFICATION_NOT_CONFIGURED',503)
  const mailer=createSystemMailAdapter()
  await mailer.send({to:[email],subject:'Tu código de acceso a NOTIFICA IA',text:`Tu código de verificación de NOTIFICA IA es:\n\n${code}\n\nVence en 5 minutos y solo funciona una vez en el inicio de sesión que lo solicitó. No compartas este código con nadie. NOTIFICA IA nunca te lo pedirá por chat.\n\nSi no intentaste ingresar, no compartas el código y revisa la seguridad de tu cuenta.`,attachments:[],idempotencyKey:deliveryKey})
},secret=()=>process.env.OWNER_EMAIL_OTP_SECRET??'') {
  return {
    async start(who:Identity) {
      const code=String(randomInt(0,1_000_000)).padStart(6,'0'),digest=codeDigest(secret(),who.binding,code)
      const result=await db.$transaction(async tx=>{
        await lockOwner(tx,who)
        const now=new Date(),old=await tx.ownerEmailSession.findUnique({where:{id:who.binding}})
        if(old?.sentAt&&now.getTime()-old.sentAt.getTime()<60000)return {kind:'cooldown' as const}
        if(!await quota(tx,who.userId,'send',3600,3)){await audit(tx,who,'owner.email.send_limited');return {kind:'limited' as const}}
        const data={userId:who.userId,codeHash:digest,codeExpiresAt:new Date(now.getTime()+emailCodeLifetimeMs),attempts:0,sentAt:now}
        await tx.ownerEmailSession.upsert({where:{id:who.binding},create:{id:who.binding,...data},update:data})
        await audit(tx,who,'owner.email.requested')
        // Bound cleanup; never removes an active verification or business history.
        const expired=await tx.ownerEmailSession.findMany({where:{updatedAt:{lt:new Date(now.getTime()-30*86400000)}},select:{id:true},take:100})
        if(expired.length)await tx.ownerEmailSession.deleteMany({where:{id:{in:expired.map(x=>x.id)}}})
        return {kind:'send' as const}
      },{timeout:15000})
      if(result.kind==='limited')throw new OwnerEmailError('EMAIL_SEND_LIMITED',429)
      if(result.kind==='cooldown')return {sent:false,retryAfter:60}
      try {await sendCode(who.email,code,`owner-email-${randomUUID()}`)}
      catch {
        await db.$transaction(async tx=>{
          await tx.ownerEmailSession.updateMany({where:{id:who.binding,codeHash:digest},data:{codeHash:null,codeExpiresAt:null}})
          await audit(tx,who,'owner.email.delivery_failed')
        })
        throw new OwnerEmailError('EMAIL_DELIVERY_UNCONFIRMED',503)
      }
      return {sent:true,retryAfter:60}
    },
    async verify(who:Identity,code:string) {
      if(!/^\d{6}$/.test(code))throw new OwnerEmailError('INVALID_EMAIL_CODE',400)
      const digest=codeDigest(secret(),who.binding,code)
      const outcome=await db.$transaction(async tx=>{
        await lockOwner(tx,who)
        if(!await quota(tx,who.userId,'verify',900,20)){await audit(tx,who,'owner.email.verify_limited');return 'limited'}
        const row=await tx.ownerEmailSession.findUnique({where:{id:who.binding}}),now=new Date()
        if(!row?.codeHash||!row.codeExpiresAt||row.codeExpiresAt<=now||row.attempts>=5){await audit(tx,who,'owner.email.rejected');return 'invalid'}
        if(!codeMatches(row.codeHash,digest)) {
          await tx.ownerEmailSession.update({where:{id:who.binding},data:{attempts:{increment:1}}})
          await audit(tx,who,'owner.email.rejected');return 'invalid'
        }
        await tx.ownerEmailSession.update({where:{id:who.binding},data:{codeHash:null,codeExpiresAt:null,verifiedAt:now,verifiedUntil:new Date(now.getTime()+emailSessionLifetimeMs)}})
        await audit(tx,who,'owner.email.verified');return 'verified'
      },{timeout:15000})
      if(outcome!=='verified')throw new OwnerEmailError(outcome==='limited'?'EMAIL_VERIFY_LIMITED':'INVALID_EMAIL_CODE',outcome==='limited'?429:400)
      return {verified:true}
    },
  }
}
