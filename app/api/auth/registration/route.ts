import { ipAddress } from '@vercel/functions'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { abogadoSignupProof, abogadoTerms, correoSchema, nombreSchema } from '@/lib/auth/abogadoAccount'
import { prisma } from '@/lib/prisma'
import { consumeFixedWindowQuota } from '@/lib/security/rateLimit'
import { boundRequestBody, requireSameOrigin, RequestSecurityError } from '@/lib/security/request'
import { createServerSupabaseClient } from '@/lib/supabaseServer'

const registration = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('abogado'),
    nombre: nombreSchema,
    apellidos: nombreSchema,
    email: correoSchema,
    password: z.string().min(12).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
    acceptedTerms: z.literal(true),
    termsVersion: z.string().min(1).max(150),
  }).strict(),
  z.object({
    type: z.literal('receptor'),
    nombre: nombreSchema,
    email: correoSchema,
    celular: z.string().trim().max(30).regex(/^\+?[\d\s().-]+$/)
      .transform(value => value.replace(/[\s().-]/g, ''))
      .pipe(z.string().regex(/^\+?\d{8,15}$/)),
  }).strict(),
])

const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request)
    await boundRequestBody(request, 4096)
    const parsed = registration.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      const invalidPassword = parsed.error.issues.some(issue => issue.path[0] === 'password')
      return NextResponse.json({ error: invalidPassword
        ? 'Usa al menos 12 caracteres y un máximo de 72 bytes para la contraseña.'
        : 'Revisa los datos del formulario y vuelve a intentarlo.' }, { status: 400, headers })
    }

    const input = parsed.data
    const terms = input.type === 'abogado' ? abogadoTerms() : null
    if (input.type === 'abogado' && (!terms || input.termsVersion !== terms.version)) {
      return NextResponse.json({ error: terms
        ? 'Los términos han cambiado. Recarga la página para leer la versión vigente.'
        : 'La creación de cuentas estará disponible cuando se publiquen los términos.' },
      { status: terms ? 409 : 503, headers })
    }

    const quota = `registration:${input.type}:`
    const [globalAllowed, ipAllowed] = await Promise.all([
      consumeFixedWindowQuota(`${quota}global`, 900, 100),
      consumeFixedWindowQuota(`${quota}ip:${ipAddress(request) || 'unknown'}`, 900, 15),
    ])
    if (!globalAllowed || !ipAllowed || !await consumeFixedWindowQuota(`${quota}email:${input.email}`, 900, 4)) {
      throw new RequestSecurityError('RATE_LIMITED', 429, 900)
    }

    if (input.type === 'receptor') {
      const { nombre, email, celular } = input
      await prisma.receptorConsultation.createMany({ data: [{ nombre, email, celular }], skipDuplicates: true })
      return NextResponse.json({ status: 'consultation_requested' }, { status: 202, headers })
    }

    const { email, password, nombre, apellidos, termsVersion } = input
    const proof = abogadoSignupProof({ email, nombre, apellidos, termsVersion, acceptedAt: new Date().toISOString() })
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: new URL('/auth/confirm-abogado', request.headers.get('origin')!).href,
        data: { abogado_signup: proof },
      },
    })
    if (error && error.code !== 'user_already_exists' && error.code !== 'email_exists') {
      const message = error.code === 'weak_password'
        ? 'Elige una contraseña más difícil de adivinar.'
        : 'No pudimos crear la cuenta. Intenta nuevamente en unos minutos.'
      const status = error.code === 'weak_password' ? 400 : error.status === 429 ? 429 : 503
      return NextResponse.json({ error: message }, { status, headers })
    }

    return NextResponse.json({ status: data.session ? 'authenticated' : 'check_email' }, { status: 202, headers })
  } catch (error) {
    if (error instanceof RequestSecurityError) {
      const message = error.status === 429 ? 'Demasiados intentos. Espera 15 minutos y vuelve a intentarlo.' : 'No se pudo procesar la solicitud.'
      return NextResponse.json({ error: message }, { status: error.status,
        headers: { ...headers, ...(error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}) } })
    }
    console.error('PUBLIC_REGISTRATION_UNAVAILABLE')
    return NextResponse.json({ error: 'No pudimos procesar la solicitud. Intenta nuevamente en unos minutos.' }, { status: 503, headers })
  }
}
