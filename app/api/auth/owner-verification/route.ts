import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { resolveProvisionedUser, AuthResolutionError } from '@/lib/auth-server'
import { ownerEmailIdentity, ownerEmailService, OwnerEmailError } from '@/lib/auth/ownerEmail'
import { withRequestTiming } from '@/lib/api/requestTiming'
import { boundRequestBody, requireSameOrigin, RequestSecurityError } from '@/lib/security/request'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=60
const input=z.discriminatedUnion('action',[z.object({action:z.literal('start')}).strict(),z.object({action:z.literal('verify'),code:z.string().regex(/^\d{6}$/)}).strict()])
async function handle(request:NextRequest) {
  return withRequestTiming(request,'auth.owner-email',async()=>{
    try {
      if(request.method==='POST'){requireSameOrigin(request);await boundRequestBody(request,1024)}
      // Deliberately password-authenticated only: this is the narrow route that completes verification.
      const user=await resolveProvisionedUser()
      const grant=await prisma.platformGrant.findUnique({where:{userId:user.id}})
      const body=request.method==='POST'?input.parse(await request.json()):null
      if(!grant||grant.revokedAt||grant.role!=='OWNER'||grant.verificationMethod!=='EMAIL') {
        if(body?.action==='verify')throw new OwnerEmailError('PLATFORM_ACCESS_DENIED')
        return NextResponse.json({required:false},{headers:{'Cache-Control':'private, no-store'}})
      }
      const identity=await ownerEmailIdentity(user,grant)
      const result=body?.action==='start'?await ownerEmailService().start(identity):body?.action==='verify'?await ownerEmailService().verify(identity,body.code):{}
      const [name,domain]=identity.email.split('@')
      return NextResponse.json({required:true,destination:`${name.slice(0,2)}•••@${domain}`,...result},{headers:{'Cache-Control':'private, no-store'}})
    }catch(error){
      if(error instanceof OwnerEmailError||error instanceof AuthResolutionError||error instanceof RequestSecurityError)return NextResponse.json({error:{code:error.code}},{status:error.status,headers:{'Cache-Control':'private, no-store'}})
      if(error instanceof z.ZodError||error instanceof SyntaxError)return NextResponse.json({error:{code:'INVALID_INPUT'}},{status:400})
      // Never forward mailer details, code, recipient or challenge content to diagnostics.
      return NextResponse.json({error:{code:'EMAIL_VERIFICATION_UNAVAILABLE'}},{status:503,headers:{'Cache-Control':'private, no-store'}})
    }
  })
}
export const GET=handle
export const POST=handle
