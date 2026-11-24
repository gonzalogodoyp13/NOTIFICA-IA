import { z } from 'zod'
import { registrosPorPagina } from '@/lib/encargos/listados'

export type ParametrosListado = Record<string, string | string[] | undefined>

export function textoFiltro(params: ParametrosListado, key: string) {
  const value = params[key]
  return typeof value === 'string' ? value.trim().slice(0, 180) : ''
}

export function fechaFiltro(params: ParametrosListado, key: string) {
  const value = textoFiltro(params, key)
  return z.iso.date().safeParse(value).success && value >= '1900-01-01' && value <= '9998-12-31' ? value : ''
}

export function paginacion(params: ParametrosListado) {
  const value = Number(textoFiltro(params, 'pagina'))
  const pagina = Number.isInteger(value) && value >= 1 && value <= 100_000 ? value : 1
  return { pagina, skip: (pagina - 1) * registrosPorPagina, take: registrosPorPagina + 1 }
}

export function filtrosHref(path: string, filtros: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filtros)) {
    if (value) query.set(key, String(value))
  }
  return query.size ? `${path}?${query}` : path
}
