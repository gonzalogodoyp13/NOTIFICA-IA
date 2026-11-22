import { redirect } from 'next/navigation'
import { requireOwnerEnrollment, OperationsAccessError } from '@/lib/operations/auth'
import { AuthResolutionError } from '@/lib/auth-server'
import MfaClient from './mfa-client'
import EmailVerificationClient from './email-verification-client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export default async function MfaPage() {
  let method='TOTP'
  try { const user=await requireOwnerEnrollment();method=(await prisma.platformGrant.findUnique({where:{userId:user.id},select:{verificationMethod:true}}))?.verificationMethod??'TOTP' } catch (error) {
    if (error instanceof OperationsAccessError) redirect('/dashboard?notice=acceso-restringido')
    if (error instanceof AuthResolutionError && error.status < 500) redirect('/login')
    throw error
  }
  return <main className="mx-auto max-w-lg px-6 py-16"><p className="text-sm font-semibold uppercase tracking-widest text-primary">Notifica IA · acceso de plataforma</p><h1 className="mt-3 text-3xl font-semibold">Verifica tu identidad</h1><p className="my-5 text-slate-600">{method==='EMAIL'?'Ingresa el código de seis dígitos enviado a tu correo. Solo funciona en este inicio de sesión.':'El Centro de Operaciones exige una segunda verificación con tu aplicación autenticadora.'}</p>{method==='EMAIL'?<EmailVerificationClient/>:<MfaClient />}</main>
}
