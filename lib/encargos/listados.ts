import 'server-only'

import { Prisma } from '@prisma/client'
import { buildDashboardDateRange } from '@/lib/dashboard/time'
import { prisma } from '@/lib/prisma'
import { condicionesEstado, type FiltroEstado } from './estados'

export const registrosPorPagina = 24

type Ventana = { skip: number; take: number }

const encargoSelect = { id: true, rol: true, tribunal: true, corte: true } as const
const asignacionSelect = { encargo: { select: encargoSelect }, receptor: { select: { nombre: true } } } as const
const escaparPatron = (value: string) => value.replace(/[\\%_]/g, '\\$&')
const buscarTexto = (value: string) => ({ contains: escaparPatron(value), mode: 'insensitive' as const })

export function listarCausas(abogadoId: string, estado: FiltroEstado, rol: string, corte: string, ventana: Ventana) {
  return prisma.abogadoEncargo.findMany({
    where: { abogadoId, ...condicionesEstado[estado], ...(rol && { rol: buscarTexto(rol) }), ...(corte && { corte }) },
    select: { ...encargoSelect, enviadoAt: true, finalizadoAt: true, actualizadoAt: true, datos: true, receptores: {
      select: { receptorId: true, respuesta: true, receptor: { select: { nombre: true } }, _count: { select: { pagos: true } } },
    } },
    orderBy: [{ actualizadoAt: 'desc' }, { id: 'desc' }],
    ...ventana,
  })
}

export async function contarCausasInicio(abogadoId: string) {
  const estados = ['esperando-respuesta', 'por-pagar', 'en-curso', 'finalizadas'] as const
  return Promise.all(estados.map(estado => prisma.abogadoEncargo.count({ where: { abogadoId, ...condicionesEstado[estado] } })))
}

export function listarReceptores(nombre: string, corte: string, tribunal: string, ventana: Ventana) {
  const where: Prisma.ReceptorPortalWhereInput = {
    disponible: true, user: { isActive: true },
    ...(nombre && { nombre: buscarTexto(nombre) }),
    ...(corte && { cortes: { has: corte } }),
    ...(tribunal && { tribunales: { has: tribunal } }),
  }
  return Promise.all([
    prisma.receptorPortal.findMany({ where, select: { userId: true, nombre: true, cortes: true, tribunales: true },
      orderBy: [{ nombre: 'asc' }, { userId: 'asc' }], ...ventana }),
    prisma.receptorPortal.count({ where }),
  ])
}

export function listarEstampos(abogadoId: string, filtros: { rol: string; receptorId: string; desde: string; hasta: string }, ventana: Ventana) {
  const { from, toExclusive } = buildDashboardDateRange(filtros.desde, filtros.hasta)
  const where: Prisma.AbogadoEstampoWhereInput = {
    asignacion: { encargo: { abogadoId, ...(filtros.rol && { rol: buscarTexto(filtros.rol) }) } },
    ...(filtros.receptorId && { receptorId: filtros.receptorId }),
    ...(from || toExclusive ? { firmadoAt: { gte: from ?? undefined, lt: toExclusive ?? undefined } } : {}),
  }
  return Promise.all([
    prisma.abogadoEstampo.findMany({ where, select: { id: true, notificado: true, resultado: true, firmadoAt: true,
      asignacion: { select: asignacionSelect } }, orderBy: [{ firmadoAt: 'desc' }, { id: 'desc' }], ...ventana }),
    prisma.abogadoEstampo.count({ where }),
    prisma.receptorPortal.findMany({ where: { encargos: { some: { encargo: { abogadoId }, estampos: { some: {} } } } },
      select: { userId: true, nombre: true }, orderBy: [{ nombre: 'asc' }, { userId: 'asc' }] }),
  ])
}

export function listarBoletas(abogadoId: string, busqueda: string, ventana: Ventana) {
  const filtro = buscarTexto(busqueda)
  const where: Prisma.AbogadoBoletaWhereInput = {
    asignacion: { encargo: { abogadoId } },
    ...(busqueda && { OR: [
      { numero: filtro }, { numeroRecibo: filtro },
      { asignacion: { encargo: { OR: [{ rol: filtro }, { tribunal: filtro }] } } },
    ] }),
  }
  return Promise.all([
    prisma.abogadoBoleta.findMany({ where, select: { id: true, numero: true, numeroRecibo: true, montoClp: true, emitidoAt: true,
      asignacion: { select: asignacionSelect } }, orderBy: [{ emitidoAt: 'desc' }, { id: 'desc' }], ...ventana }),
    prisma.abogadoBoleta.count({ where }),
  ])
}

function filtroPagos(abogadoId: string, busqueda: string): Prisma.AbogadoPagoWhereInput {
  return { asignacion: { encargo: { abogadoId, ...(busqueda && { OR: [{ rol: buscarTexto(busqueda) }, { tribunal: buscarTexto(busqueda) }] }) } } }
}

export function totalPagos(abogadoId: string, busqueda: string) {
  return prisma.abogadoPago.aggregate({ where: filtroPagos(abogadoId, busqueda), _sum: { montoClp: true } })
}

export function listarPagos(abogadoId: string, busqueda: string, ventana: Ventana) {
  return prisma.abogadoPago.findMany({ where: filtroPagos(abogadoId, busqueda),
    select: { id: true, montoClp: true, medio: true, referencia: true, pagadoAt: true, asignacion: { select: asignacionSelect } },
    orderBy: [{ pagadoAt: 'desc' }, { id: 'desc' }], ...ventana })
}

export function listarGastosPorCausa(abogadoId: string, busqueda: string, ventana: Ventana) {
  const patron = `%${escaparPatron(busqueda)}%`
  return prisma.$queryRaw<{ rol: string; tribunal: string; corte: string; total: bigint; pagos: number; ultimo: Date }[]>`
    SELECT upper(e.rol) AS rol, e.tribunal, e.corte, SUM(p."montoClp") AS total,
      COUNT(*)::integer AS pagos, MAX(p."pagadoAt") AS ultimo
    FROM public.abogado_pagos p
    JOIN public.abogado_encargos e ON e.id = p."encargoId"
    WHERE e."abogadoId" = ${abogadoId}::uuid
      ${busqueda ? Prisma.sql`AND (e.rol ILIKE ${patron} OR e.tribunal ILIKE ${patron})` : Prisma.empty}
    GROUP BY upper(e.rol), e.tribunal, e.corte
    ORDER BY ultimo DESC, rol, e.tribunal, e.corte
    OFFSET ${ventana.skip} LIMIT ${ventana.take}
  `
}
