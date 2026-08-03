import 'server-only'

import { officeCacheKey, officeCatalogCache } from '@/lib/cache/officeCache'
import { prisma } from '@/lib/prisma'

export async function loadActiveLegacyEstampos(params: {
  officeId: number
  officeCacheRevision: number
  includeContent?: boolean
}) {
  const key = officeCacheKey('legacy-estampos', params.officeId, params.officeCacheRevision, params.includeContent ? 'content' : 'summary')
  return officeCatalogCache.getOrLoad(key, () => prisma.estampo.findMany({
    where: { officeId: params.officeId, activo: true },
    select: { id: true, nombre: true, contenido: params.includeContent === true },
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
  })) as ReturnType<typeof prisma.estampo.findMany>
}

export async function loadWizardCategoryCounts(): Promise<Array<{ categoria: string; _count: { id: number } }>> {
  return officeCatalogCache.getOrLoad('wizard-categories:global', () => prisma.estampoBase.groupBy({
    by: ['categoria'],
    where: { isActive: true },
    _count: { id: true },
    orderBy: { categoria: 'asc' },
  })) as Promise<Array<{ categoria: string; _count: { id: number } }>>
}

export async function loadActiveArancelRows(params: {
  officeId: number
  officeCacheRevision: number
  attorneyId: number
  bankIds: number[]
}) {
  const bankIds = Array.from(new Set(params.bankIds)).sort((a, b) => a - b)
  if (!bankIds.length) return []
  const key = officeCacheKey('aranceles', params.officeId, params.officeCacheRevision, params.attorneyId, bankIds.join(','))
  return officeCatalogCache.getOrLoad(key, () => prisma.arancel.findMany({
    where: {
      officeId: params.officeId,
      bancoId: { in: bankIds },
      activo: true,
      OR: [{ abogadoId: params.attorneyId }, { abogadoId: null }],
    },
    select: {
      bancoId: true,
      abogadoId: true,
      estampoId: true,
      estampoBaseCategoria: true,
      monto: true,
    },
  })) as ReturnType<typeof prisma.arancel.findMany>
}

export async function loadActiveWizardBases(category?: string) {
  const key = `wizard-bases:global:${category ?? 'all'}`
  return officeCatalogCache.getOrLoad(key, () => prisma.estampoBase.findMany({
    where: { isActive: true, ...(category ? { categoria: category } : {}) },
    orderBy: { nombreVisible: 'asc' },
  })) as ReturnType<typeof prisma.estampoBase.findMany>
}

export async function loadOfficeWizardCustoms(params: {
  officeId: number
  officeCacheRevision: number
  category?: string
  baseIds?: number[]
}) {
  const baseIds = params.baseIds ? [...params.baseIds].sort((a, b) => a - b) : undefined
  const key = officeCacheKey('wizard-customs', params.officeId, params.officeCacheRevision, params.category ?? 'all', baseIds?.join(',') ?? 'all')
  return officeCatalogCache.getOrLoad(key, () => prisma.estampoCustom.findMany({
    where: {
      officeId: params.officeId,
      isActive: true,
      ...(baseIds ? { baseId: { in: baseIds } } : {}),
      ...(params.category ? { base: { categoria: params.category } } : {}),
    },
  })) as ReturnType<typeof prisma.estampoCustom.findMany>
}
