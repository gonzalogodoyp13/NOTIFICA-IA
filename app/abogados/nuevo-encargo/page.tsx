import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { getAbogadoAccount } from '@/lib/auth/abogadoAccount'
import { boletaParaNuevoEncargo } from '@/lib/encargos/ajustes'
import { datosEncargoSchema } from '@/lib/encargos/schema'
import { receptorPreseleccionado } from '@/lib/encargos/server'
import { cortesDeApelaciones, tribunalesDeCorte } from '@/lib/encargos/tribunales'
import { prisma } from '@/lib/prisma'
import EncargoForm from './EncargoForm'

export const metadata: Metadata = { title: 'Nuevo encargo | NOTIFICA IA' }

export default async function NuevoEncargoPage({ searchParams }: { searchParams: Promise<{
  borrador?: string | string[]; receptor?: string | string[]; corte?: string | string[]; tribunal?: string | string[]
}> }) {
  const [account, { borrador, receptor, corte, tribunal }] = await Promise.all([getAbogadoAccount(), searchParams])
  if (!account) redirect('/login')

  const props = { boletaInicial: boletaParaNuevoEncargo(account.contacto, account.boleta, account.email) }
  if (!borrador) {
    if (typeof receptor === 'string' && receptor.length <= 100 && typeof corte === 'string' && cortesDeApelaciones.includes(corte)) {
      const tribunalValido = typeof tribunal === 'string' && tribunalesDeCorte(corte).includes(tribunal) ? tribunal : ''
      const seleccionado = await receptorPreseleccionado(receptor, corte, tribunalValido)
      if (seleccionado) return <EncargoForm key={`receptor:${corte}:${tribunalValido}:${receptor}`} {...props}
        preseleccion={{ id: seleccionado.userId, nombre: seleccionado.nombre, corte, tribunal: tribunalValido }} />
    }
    return <EncargoForm key="nuevo" {...props} />
  }
  const id = z.uuid().safeParse(borrador)
  if (!id.success) notFound()
  const encargo = await prisma.abogadoEncargo.findFirst({
    where: { id: id.data, abogadoId: account.authUserId }, select: { id: true, datos: true, enviadoAt: true },
  })
  if (!encargo) notFound()
  if (encargo.enviadoAt) redirect('/abogados/mis-causas')
  const datos = datosEncargoSchema.safeParse(encargo.datos)
  if (!datos.success) notFound()
  return <EncargoForm key={encargo.id} {...props} borrador={{ id: encargo.id, datos: datos.data }} />
}
