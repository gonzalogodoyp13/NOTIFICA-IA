import 'server-only'

import { prisma } from '@/lib/prisma'
import { parseEstampoTipo } from '@/lib/estampos/selection'
import { serializeNotification } from '@/lib/workflow/notificationView'
import type {
  ReceiptWorkflowArancel,
  ReceiptWorkflowData,
  ReceiptWorkflowEstampoOption,
  ReceiptWorkflowSelection,
} from '@/lib/workflow/receiptWorkflowTypes'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function categoryLabel(category: string) {
  return `${category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')} (Wizard)`
}

function selectionKey(selection: ReceiptWorkflowSelection) {
  return selection.kind === 'CUSTOM'
    ? `custom:${selection.estampoId}`
    : `wizard:${selection.categoria}`
}

function buildArancelMap(
  rows: Array<{
    bancoId: number
    abogadoId: number | null
    estampoId: string | null
    estampoBaseCategoria: string | null
    monto: number
  }>,
  abogadoId: number
) {
  const map = new Map<string, ReceiptWorkflowArancel>()
  const ordered = [...rows].sort((left, right) => {
    const leftSpecific = left.abogadoId === abogadoId ? 1 : 0
    const rightSpecific = right.abogadoId === abogadoId ? 1 : 0
    return leftSpecific - rightSpecific
  })

  for (const row of ordered) {
    const optionKey = row.estampoId
      ? `custom:${row.estampoId}`
      : row.estampoBaseCategoria
        ? `wizard:${row.estampoBaseCategoria}`
        : null
    if (!optionKey) continue
    map.set(`${optionKey}:bank:${row.bancoId}`, {
      bancoId: row.bancoId,
      monto: row.monto,
      source: row.abogadoId === abogadoId ? 'abogado' : 'banco',
    })
  }
  return map
}

function optionAranceles(
  selection: ReceiptWorkflowSelection,
  bankIds: number[],
  map: Map<string, ReceiptWorkflowArancel>
) {
  const key = selectionKey(selection)
  return bankIds
    .map(bankId => map.get(`${key}:bank:${bankId}`) ?? null)
    .filter((item): item is ReceiptWorkflowArancel => !!item)
}

export async function loadReceiptWorkflow(params: {
  rolId: string
  diligenciaId: string
  notificacionId: string
  officeId: number
  includeEstampoContent?: boolean
}): Promise<ReceiptWorkflowData | null> {
  const notification = await prisma.notificacion.findFirst({
    where: {
      id: params.notificacionId,
      diligenciaId: params.diligenciaId,
      diligencia: {
        rolId: params.rolId,
        rol: { officeId: params.officeId },
      },
    },
    include: {
      ejecutado: { include: { comunas: { select: { id: true, nombre: true } } } },
      banco: { select: { id: true, nombre: true } },
      diligencia: {
        include: {
          tipo: true,
          rol: {
            include: {
              demanda: {
                include: {
                  abogados: {
                    include: {
                      bancos: {
                        include: { banco: { select: { id: true, nombre: true } } },
                        orderBy: { bancoId: 'asc' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      documentos: {
        where: {
          tipo: { in: ['Recibo', 'Estampo'] },
          voidedAt: null,
          OR: [{ pdfId: { not: null } }, { currentVersion: { is: { deletedAt: null } } }],
        },
        orderBy: { createdAt: 'desc' },
        include: {
          currentVersion: true,
          estampo: { select: { id: true, nombre: true } },
          estampoBase: { select: { id: true, slug: true, nombreVisible: true } },
        },
      },
    },
  })

  if (!notification?.ejecutadoId || !notification.ejecutado) return null
  const attorney = notification.diligencia.rol.demanda?.abogados ?? null
  if (!attorney) return null

  const banks = attorney.bancos.map(item => item.banco)
  const bankIds = banks.map(bank => bank.id)
  const meta = isPlainObject(notification.meta) ? notification.meta : {}
  const execution = isPlainObject(meta.ejecucion) ? meta.ejecucion : {}
  const selectedEstampoTipo = parseEstampoTipo(meta)
  const selectedBankId = notification.bancoId ?? (banks.length === 1 ? banks[0].id : null)

  const [customEstampos, wizardCategories, arancelRows, activeReceipt] = await Promise.all([
    prisma.estampo.findMany({
      where: { officeId: params.officeId, activo: true },
      select: { id: true, nombre: true, contenido: params.includeEstampoContent === true },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    }),
    prisma.estampoBase.groupBy({
      by: ['categoria'],
      where: { isActive: true },
      _count: { id: true },
      orderBy: { categoria: 'asc' },
    }),
    bankIds.length
      ? prisma.arancel.findMany({
          where: {
            officeId: params.officeId,
            bancoId: { in: bankIds },
            activo: true,
            OR: [{ abogadoId: attorney.id }, { abogadoId: null }],
          },
          select: {
            bancoId: true,
            abogadoId: true,
            estampoId: true,
            estampoBaseCategoria: true,
            monto: true,
          },
        })
      : [],
    prisma.recibo.findFirst({
      where: { notificacionId: notification.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        documentoId: true,
        numeroRecibo: true,
        generationFingerprint: true,
      },
    }),
  ])

  const arancelMap = buildArancelMap(arancelRows, attorney.id)
  const customOptions: ReceiptWorkflowEstampoOption[] = customEstampos.map(item => {
    const selection = { kind: 'CUSTOM' as const, estampoId: item.id }
    return {
      selection,
      label: item.nombre,
      ...(params.includeEstampoContent === true && 'contenido' in item
        ? { contenido: item.contenido }
        : {}),
      aranceles: optionAranceles(selection, bankIds, arancelMap),
    }
  })
  const wizardOptions: ReceiptWorkflowEstampoOption[] = wizardCategories.map(item => {
    const selection = { kind: 'WIZARD' as const, categoria: item.categoria }
    return {
      selection,
      label: categoryLabel(item.categoria),
      count: item._count.id,
      aranceles: optionAranceles(selection, bankIds, arancelMap),
    }
  })
  const estampoOptions = [...wizardOptions, ...customOptions]
  const activeKeys = new Set(estampoOptions.map(item => selectionKey(item.selection)))

  let historicalSelection: ReceiptWorkflowData['historicalSelection'] = null
  if (selectedEstampoTipo && !activeKeys.has(selectionKey(selectedEstampoTipo))) {
    if (selectedEstampoTipo.kind === 'CUSTOM') {
      const historical = await prisma.estampo.findFirst({
        where: { id: selectedEstampoTipo.estampoId, officeId: params.officeId },
        select: { nombre: true },
      })
      if (historical) {
        historicalSelection = { selection: selectedEstampoTipo, label: historical.nombre, active: false }
      }
    } else {
      historicalSelection = {
        selection: selectedEstampoTipo,
        label: categoryLabel(selectedEstampoTipo.categoria),
        active: false,
      }
    }
  }

  return {
    notification: serializeNotification(notification, notification.diligencia),
    ejecutado: {
      id: notification.ejecutado.id,
      nombre: notification.ejecutado.nombre,
      direccion: notification.ejecutado.direccion ?? null,
      comuna: notification.ejecutado.comunas
        ? { id: notification.ejecutado.comunas.id, nombre: notification.ejecutado.comunas.nombre }
        : null,
    },
    bankContext: { selectedBankId, banks },
    execution: {
      fecha:
        typeof execution.fecha === 'string'
          ? execution.fecha
          : typeof meta.fechaEjecucion === 'string'
            ? meta.fechaEjecucion.slice(0, 10)
            : null,
      hora:
        typeof execution.hora === 'string'
          ? execution.hora
          : typeof meta.horaEjecucion === 'string'
            ? meta.horaEjecucion
            : null,
    },
    selectedEstampoTipo,
    monto: typeof meta.monto === 'number' ? meta.monto : null,
    estampoOptions,
    receiptState:
      activeReceipt?.numeroRecibo
        ? {
            receiptId: activeReceipt.id,
            documentoId: activeReceipt.documentoId,
            numeroRecibo: activeReceipt.numeroRecibo,
            generationFingerprint: activeReceipt.generationFingerprint,
          }
        : null,
    historicalSelection,
  }
}
