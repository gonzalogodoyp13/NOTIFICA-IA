import { prisma } from '@/lib/prisma'
import type { EstampoBase, EstampoCustom } from '@prisma/client'
import type { VariableDef, WizardQuestion } from '@/lib/estampos/types'
import { buildInitialVariables, type DiligenciaWithRelations } from '@/lib/estampos/runtime'

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
  }

  return {
    dbUser,
    diligencia,
    ejecutadoFromNotificacion,
    notificacionMeta,
  }
}

export async function loadWizardEstampoTemplate(params: {
  estampoBaseId: number
  officeId: number
}) {
  const { estampoBaseId, officeId } = params

  const estampoBase = await prisma.estampoBase.findFirst({
    where: {
      id: estampoBaseId,
      isActive: true,
    },
  })

  if (!estampoBase) {
    return null
  }

  const estampoCustom = await prisma.estampoCustom.findFirst({
    where: {
      baseId: estampoBase.id,
      officeId,
      isActive: true,
    },
  })

  return {
    estampoBase,
    estampoCustom,
    textoTemplate: estampoCustom?.textoTemplate ?? estampoBase.textoTemplate,
  }
}

export async function loadWizardCatalog(params: {
  categoria: string
  officeId: number
}) {
  const { categoria, officeId } = params

  const estamposBase = await prisma.estampoBase.findMany({
    where: {
      categoria,
      isActive: true,
    },
    orderBy: {
      nombreVisible: 'asc',
    },
  })

  const baseIds = estamposBase.map(item => item.id)
  const estamposCustom =
    baseIds.length > 0
      ? await prisma.estampoCustom.findMany({
          where: {
            officeId,
            isActive: true,
            baseId: { in: baseIds },
          },
        })
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
}) {
  const {
    diligencia,
    rol,
    estampoBase,
    estampoCustom,
    dbUser,
    notificacionMeta,
    ejecutadoFromNotificacion,
  } = params

  const diligenciaMeta = isPlainObject(diligencia.meta)
    ? (diligencia.meta as Record<string, unknown>)
    : null

  const effectiveMeta =
    notificacionMeta && Object.keys(notificacionMeta).length > 0
      ? notificacionMeta
      : (diligenciaMeta ?? {})

  const diligenciaForVars = { ...diligencia, meta: effectiveMeta }

  return buildInitialVariables({
    diligencia: diligenciaForVars as DiligenciaWithRelations,
    rol,
    estampoBase,
    estampoCustom,
    dbUser,
    ejecutadoFromNotificacion,
  })
}
