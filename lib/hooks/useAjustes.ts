'use client'

import { useQuery } from '@tanstack/react-query'

interface EstampoCatalogItem {
  id: string
  nombre: string
  tipo?: string | null
  contenido?: string | null
}

export function useEstampos() {
  return useQuery<EstampoCatalogItem[]>({
    queryKey: ['ajustes', 'estampos'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/estampos', {
          credentials: 'include',
        })

        if (!response.ok) {
          throw new Error('No se pudieron cargar los estampos')
        }

        const payload = await response.json().catch(() => null)
        if (payload && Array.isArray(payload.data)) {
          return payload.data.map((item: any) => ({
            id: String(item.id),
            nombre: item.nombre ?? 'Estampo sin nombre',
            tipo: item.tipo ?? null,
            contenido: item.contenido ?? null,
          }))
        }
      } catch (error) {
        console.warn('Fallo al cargar estampos desde API', error)
      }

      return [
        {
          id: 'mock-general',
          nombre: 'Estampo general',
          tipo: 'sello',
          contenido:
            'Se deja constancia que el proveedor hizo entrega de la documentación requerida el día __.',
        },
        {
          id: 'mock-urgente',
          nombre: 'Estampo urgente',
          tipo: 'firma',
          contenido:
            'Se certifica que la diligencia fue ejecutada con carácter de urgencia el __ a las __ hrs.',
        },
      ]
    },
  })
}

