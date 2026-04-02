type BancoRecord = {
  bancoId: number
  banco: {
    id: number
    nombre: string
  }
}

type AbogadoRecord = {
  abogadoId: number
  abogado: {
    id: number
    nombre: string | null
    bancos: BancoRecord[]
  }
}

export function deriveBancosFromAbogados(abogados: AbogadoRecord[]) {
  const bancoMap = new Map<number, { bancoId: number; banco: { id: number; nombre: string } }>()

  for (const abogadoLink of abogados) {
    for (const bancoLink of abogadoLink.abogado.bancos) {
      bancoMap.set(bancoLink.bancoId, {
        bancoId: bancoLink.banco.id,
        banco: {
          id: bancoLink.banco.id,
          nombre: bancoLink.banco.nombre,
        },
      })
    }
  }

  return Array.from(bancoMap.values()).sort((a, b) => a.banco.nombre.localeCompare(b.banco.nombre))
}

export function mapProcuradorListItem(procurador: {
  id: number
  nombre: string
  email: string | null
  telefono: string | null
  notas: string | null
  activo: boolean
  createdAt: Date
  updatedAt: Date
  abogados: AbogadoRecord[]
}) {
  const abogados = procurador.abogados
    .map((item) => ({
      id: item.abogado.id,
      nombre: item.abogado.nombre,
    }))
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))

  return {
    id: procurador.id,
    nombre: procurador.nombre,
    email: procurador.email,
    telefono: procurador.telefono,
    notas: procurador.notas,
    activo: procurador.activo,
    abogados,
    abogadoIds: abogados.map((abogado) => abogado.id),
    bancos: deriveBancosFromAbogados(procurador.abogados),
    createdAt: procurador.createdAt.toISOString(),
    updatedAt: procurador.updatedAt.toISOString(),
  }
}
