import { prisma } from '@/lib/prisma'
import type { EstampoBase, EstampoCustom } from '@prisma/client'
import type { VariableDef, WizardQuestion } from '@/lib/estampos/types'
import { buildInitialVariables, type DiligenciaWithRelations } from '@/lib/estampos/runtime'
import { loadActiveWizardBases, loadOfficeWizardCustoms } from '@/lib/estampos/catalogCache'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const diligenciaInclude = {
  rol: {
    include: {
      tribunal: {
        select: {
          id: true,
          nombre: true,
        },
      },
      demanda: {
        include: {
          abogados: {
            include: {
              bancos: {
                include: {
                  banco: true,
                },
              },
            },
          },
          ejecutados: {
            include: {
              comunas: true,
            },
          },
        },
      },
    },
  },
} as const

export async function loadWizardDiligenciaContext(params: {
  diligenciaId: string
  officeId: number
  userId: string
  notificacionId?: string | null
}) {
  const { diligenciaId, officeId, userId, notificacionId } = params

  const [dbUser, diligencia] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { officeName: true },
    }),
    prisma.diligencia.findFirst({
      where: {
        id: diligenciaId,
        rol: {
          officeId,
        },
      },
      include: diligenciaInclude,
    }),
  ])

  if (!diligencia) {
    return null
  }

  let ejecutadoFromNotificacion: any = undefined
  let notificacionMeta: Record<string, unknown> | null = null
  let activeReceiptAmount: number | null = null

  if (notificacionId) {
    const notificacion = await prisma.notificacion.findFirst({
      where: { id: notificacionId, diligenciaId: diligencia.id },
      select: {
        id: true,
        meta: true,
        ejecutadoId: true,
        ejecutado: {
          include: {
            comunas: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
      } as any,
    })

    if (!notificacion) {
      return { error: 'Notificación no encontrada' as const }
    }

    if (!(notificacion as any).ejecutadoId || !(notificacion as any).ejecutado) {
      return {
        error: 'Esta notificación requiere seleccionar un ejecutado antes de generar documentos.' as const,
      }
    }

    ejecutadoFromNotificacion = (notificacion as any).ejecutado
    notificacionMeta = isPlainObject(notificacion.meta)
      ? (notificacion.meta as Record<string, unknown>)
      : null
    const activeReceipt = await prisma.recibo.findFirst({
      where: { notificacionId: String((notificacion as any).id), status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { monto: true },
    })
    activeReceiptAmount = activeReceipt ? Number(activeReceipt.monto) : null
  }

  return {
    dbUser,
    diligencia,
    ejecutadoFromNotificacion,
    notificacionMeta,
    activeReceiptAmount,
  }
}

export async function loadWizardEstampoTemplate(params: {
  estampoBaseId: number
  officeId: number
  officeCacheRevision: number
}) {
  const { estampoBaseId, officeId, officeCacheRevision } = params

  const estampoBase = (await loadActiveWizardBases()).find(item => item.id === estampoBaseId) ?? null

  if (!estampoBase) {
    return null
  }

  const estampoCustom = (await loadOfficeWizardCustoms({ officeId, officeCacheRevision, baseIds: [estampoBase.id] }))[0] ?? null

  return {
    estampoBase,
    estampoCustom,
    textoTemplate: estampoCustom?.textoTemplate ?? estampoBase.textoTemplate,
  }
}

export async function loadWizardCatalog(params: {
  categoria: string
  officeId: number
  officeCacheRevision: number
}) {
  const { categoria, officeId, officeCacheRevision } = params

  const estamposBase = await loadActiveWizardBases(categoria)

  const baseIds = estamposBase.map(item => item.id)
  const estamposCustom =
    baseIds.length > 0
      ? await loadOfficeWizardCustoms({ officeId, officeCacheRevision, category: categoria, baseIds })
      : []

  const customMap = new Map<number, EstampoCustom>()
  for (const custom of estamposCustom) {
    customMap.set(custom.baseId, custom)
  }

  return estamposBase.map(estampoBase => {
    const estampoCustom = customMap.get(estampoBase.id) ?? null

    return {
      id: estampoBase.id,
      slug: estampoBase.slug,
      nombreVisible: estampoBase.nombreVisible,
      categoria: estampoBase.categoria,
      descripcion: estampoBase.descripcion,
      textoTemplate: estampoCustom?.textoTemplate ?? estampoBase.textoTemplate,
      variablesSchema: estampoBase.variablesSchema as unknown as VariableDef[],
      wizardSchema: estampoBase.wizardSchema as unknown as WizardQuestion[],
      hasCustomTemplate: !!estampoCustom,
      estampoBase,
      estampoCustom,
    }
  })
}

export function buildWizardInitialVariables(params: {
  diligencia: DiligenciaWithRelations
  rol: DiligenciaWithRelations['rol']
  estampoBase: EstampoBase
  estampoCustom?: EstampoCustom | null
  dbUser: { officeName: string } | null
  notificacionMeta?: Record<string, unknown> | null
  ejecutadoFromNotificacion?: any
  activeReceiptAmount?: number | null
}) {
  const {
    diligencia,
    rol,
    estampoBase,
    estampoCustom,
    dbUser,
    notificacionMeta,
    ejecutadoFromNotificacion,
    activeReceiptAmount,
  } = params

  const diligenciaMeta = isPlainObject(diligencia.meta)
    ? (diligencia.meta as Record<string, unknown>)
    : null

  const effectiveMeta = {
    ...(diligenciaMeta ?? {}),
    ...(notificacionMeta ?? {}),
  }

  const diligenciaForVars = { ...diligencia, meta: effectiveMeta }

  return buildInitialVariables({
    diligencia: diligenciaForVars as DiligenciaWithRelations,
    rol,
    estampoBase,
    estampoCustom,
    dbUser,
    ejecutadoFromNotificacion,
    chargedAmount: activeReceiptAmount,
  })
}
