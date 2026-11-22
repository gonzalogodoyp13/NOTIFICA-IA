import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const args = process.argv.slice(2)
const value = key => args[args.indexOf(key) + 1]
const userId = value('--user-id'), operator = value('--operator'), reason = value('--reason')
const verificationMethod=args.includes('--verification')?value('--verification').toUpperCase():'TOTP'
const verificationEmail=args.includes('--confirm-email')?value('--confirm-email').trim().toLowerCase():null
if(!['TOTP','EMAIL'].includes(verificationMethod)||verificationMethod==='EMAIL'&&!verificationEmail){console.error('Email verification requires --verification email --confirm-email EXACT_ACCOUNT_EMAIL');process.exit(1)}
if (!args.includes('--user-id') || !args.includes('--operator') || !args.includes('--reason') || value('--confirm-owner') !== userId || !operator || !reason || reason.length < 10) {
  console.error('Usage: node scripts/bootstrap-platform-owner.mjs --user-id ID --operator OPERATOR --reason "Authorization reference" --confirm-owner ID')
  process.exit(1)
}
try {
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(78231462)`
    if (await tx.platformGrant.count()) throw new Error('Bootstrap already used. No additional grants are supported by this command.')
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true, email:true } })
    if (!user?.isActive) throw new Error('An active provisioned user must be selected explicitly.')
    if(verificationMethod==='EMAIL'&&user.email.toLowerCase()!==verificationEmail)throw new Error('The explicitly confirmed email must match the canonical account.')
    await tx.platformGrant.create({ data: { userId, role: 'OWNER',verificationMethod,verificationEmail:verificationMethod==='EMAIL'?verificationEmail:null } })
    await tx.platformAudit.create({ data: { actorUserId: null, action: 'owner.bootstrap', targetId: userId,
      details: { operator: operator.slice(0, 160), reason: reason.slice(0, 1000), method: 'privileged-cli', role: 'OWNER',verificationMethod } } })
  })
  console.log(`Owner grant created and audited with ${verificationMethod} verification. Sign in and complete /mfa. Password-only access was not granted.`)
} catch (error) { console.error(error instanceof Error ? error.message : 'Bootstrap failed'); process.exitCode = 1 }
finally { await db.$disconnect() }
