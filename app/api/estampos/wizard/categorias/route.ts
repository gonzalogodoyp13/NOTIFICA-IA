import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Helper para generar label legible desde categoria
function categoriaToLabel(categoria: string): string {
  // Convertir SNAKE_CASE a título legible
  return categoria
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    // Obtener categorías únicas desde EstampoBase activos
    const estamposBase = await prisma.estampoBase.findMany({
      where: {
        isActive: true,
      },
      select: {
        categoria: true,
      },
      distinct: ['categoria'],
    })

    // Agrupar por categoría y contar templates activos
    const categoriaCounts = await prisma.estampoBase.groupBy({
      by: ['categoria'],
      where: {
        isActive: true,
      },
      _count: {
        id: true,
      },
    })

    // Crear mapa de conteos
    const countMap = new Map(
      categoriaCounts.map(item => [item.categoria, item._count.id])
    )

    // Formatear respuesta
    const categorias = estamposBase.map(eb => ({
      categoria: eb.categoria,
      label: `${categoriaToLabel(eb.categoria)} (Wizard)`,
      count: countMap.get(eb.categoria) ?? 0,
    }))

    // Ordenar alfabéticamente por label
    categorias.sort((a, b) => a.label.localeCompare(b.label))

    return NextResponse.json({
      ok: true,
      data: categorias,
    })
  } catch (error) {
    console.error('Error obteniendo categorías wizard:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener las categorías wizard' },
      { status: 500 }
    )
  }
}
