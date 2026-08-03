import { NextRequest, NextResponse } from 'next/server'

import { withApiUser } from '@/lib/api/server'
import { loadWizardCategoryCounts } from '@/lib/estampos/catalogCache'

export const dynamic = 'force-dynamic'

function categoriaToLabel(categoria: string) {
  return categoria.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
}

export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.estampos.wizard.categorias', async () => {
    try {
      const counts = await loadWizardCategoryCounts()
      const data = counts
        .map(item => ({ categoria: item.categoria, label: `${categoriaToLabel(item.categoria)} (Wizard)`, count: item._count.id }))
        .sort((left, right) => left.label.localeCompare(right.label))
      return NextResponse.json({ ok: true, data })
    } catch (error) {
      console.error('Error obteniendo categorias wizard:', error)
      return NextResponse.json({ ok: false, error: 'Error al obtener las categorias wizard' }, { status: 500 })
    }
  })
}
