import 'server-only'

import { createHmac } from 'node:crypto'
import { cache } from 'react'
import { z } from 'zod'
import { boletaAbogadoSchema, boletaVacia, contactoAbogadoSchema } from '@/lib/encargos/ajustes'
import { prisma } from '@/lib/prisma'
import { isSecretAuthorized } from '@/lib/security/secret'
import { createServerSupabaseClient } from '@/lib/supabaseServer'

export const nombreSchema = z.string().trim().min(1).max(100)
export const correoSchema = z.string().trim().max(254).email().toLowerCase()

const acceptanceSchema = z.object({
  email: correoSchema,
  nombre: nombreSchema,
  apellidos: nombreSchema,
  termsVersion: z.string().min(1).max(150),
  acceptedAt: z.iso.datetime(),
})

export function abogadoTerms() {
  const version = process.env.ABOGADO_TERMS_VERSION?.trim()
  const termsUrl = process.env.ABOGADO_TERMS_URL?.trim()
  if (!version || version.length > 150 || !termsUrl) return null
  try {
    const url = new URL(termsUrl)
    const localPreview = process.env.NODE_ENV === 'development' && url.protocol === 'http:' &&
      url.hostname === 'localhost' && url.origin === process.env.APP_ORIGIN &&
      url.origin === process.env.NEXT_PUBLIC_SUPABASE_URL
    return (url.protocol === 'https:' || localPreview) && !url.username && !url.password
      ? { url: url.href, version }
      : null
  } catch {
    return null
  }
}

type Acceptance = z.infer<typeof acceptanceSchema>

function acceptanceSignature(value: Acceptance) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!secret) throw new Error('ABOGADO_SIGNUP_SECRET_UNAVAILABLE')
  return createHmac('sha256', secret).update(JSON.stringify([
    'notifica:abogado-registration:v1', value.email, value.nombre, value.apellidos,
    value.termsVersion, value.acceptedAt,
  ])).digest('hex')
}

export function abogadoSignupProof(value: Acceptance) {
  return { ...value, signature: acceptanceSignature(value) }
}

const profileFields = { nombre: true, apellidos: true, datosContacto: true, datosBoleta: true, desactivadoAt: true } as const

export const getAbogadoProfile = cache(async function getAbogadoProfile() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getUser()
  const user = data.user
  if (error || !user?.email || !user.email_confirmed_at) return null

  const where = { authUserId: user.id }
  const officeUser = await prisma.user.findUnique({ where, select: { id: true } })
  if (officeUser) return null

  let account = await prisma.abogadoAccount.findUnique({ where, select: profileFields })
  if (!account) {
    // Only the signed signup proof for this confirmed address can provision a profile.
    const raw = user.user_metadata?.abogado_signup
    const proof = acceptanceSchema.extend({ signature: z.string().length(64) }).safeParse(raw)
    if (!proof.success || proof.data.email !== user.email.toLowerCase() ||
        !isSecretAuthorized(acceptanceSignature(proof.data), proof.data.signature)) return null

    const { email, nombre, apellidos, termsVersion, acceptedAt } = proof.data
    await prisma.abogadoAccount.createMany({
      data: [{ authUserId: user.id, email, nombre, apellidos, termsVersion, termsAcceptedAt: new Date(acceptedAt) }],
      skipDuplicates: true,
    })
    account = await prisma.abogadoAccount.findUniqueOrThrow({ where, select: profileFields })
  }

  const contacto = contactoAbogadoSchema.safeParse(account.datosContacto)
  const boleta = boletaAbogadoSchema.safeParse(account.datosBoleta)
  return {
    authUserId: user.id,
    email: user.email,
    desactivadoAt: account.desactivadoAt,
    contacto: contacto.data ?? { nombre: `${account.nombre} ${account.apellidos}`, rut: '', correo: user.email, telefono: '', comuna: '', direccion: '' },
    boleta: boleta.data ?? boletaVacia,
  }
})

export async function getAbogadoAccount() {
  const profile = await getAbogadoProfile()
  return profile && !profile.desactivadoAt ? profile : null
}
