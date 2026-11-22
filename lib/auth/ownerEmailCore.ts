import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const emailCodeLifetimeMs = 5 * 60_000
export const emailSessionLifetimeMs = 12 * 60 * 60_000
export function ownerEmailBinding(input:{userId:string;authUserId:string;email:string;grantCreatedAt:Date;claims:Record<string,unknown>}, now=Date.now()) {
  const {claims}=input
  if(claims.sub!==input.authUserId || typeof claims.session_id!=='string' || !/^[a-f0-9-]{36}$/i.test(claims.session_id))throw new Error('PASSWORD_LOGIN_REQUIRED')
  const passwords=Array.isArray(claims.amr)?claims.amr.filter((a:unknown):a is {method:string;timestamp:number}=>!!a&&typeof a==='object'&&(a as {method?:unknown}).method==='password'&&typeof (a as {timestamp?:unknown}).timestamp==='number'):[]
  const at=Math.max(...passwords.map(p=>p.timestamp))
  if(!Number.isFinite(at)||at*1000>now)throw new Error('PASSWORD_LOGIN_REQUIRED')
  return createHash('sha256').update(JSON.stringify([input.userId,input.authUserId,input.email.toLowerCase(),input.grantCreatedAt.toISOString(),claims.session_id,at])).digest('hex')
}
export function codeDigest(secret:string,binding:string,code:string) {
  if(secret.length<32)throw new Error('EMAIL_VERIFICATION_NOT_CONFIGURED')
  return createHmac('sha256',secret).update(`${binding}:${code}`).digest('hex')
}
export function codeMatches(expected:string,actual:string) {
  return /^[a-f0-9]{64}$/.test(expected)&&/^[a-f0-9]{64}$/.test(actual)&&timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(actual,'hex'))
}
export function emailProofValid(row:{verifiedAt:Date|null;verifiedUntil:Date|null}|null,fresh=false,now=Date.now()) {
  return !!row?.verifiedAt&&!!row.verifiedUntil&&row.verifiedAt.getTime()<=now&&row.verifiedUntil.getTime()>now&&(!fresh||now-row.verifiedAt.getTime()<=10*60_000)
}
