import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult } from '@tanstack/react-query'
import { z } from 'zod'
import { useOfficeCacheContext } from '@/lib/cache/officeCacheContext'

import {
  DiligenciaCreateSchema,
  NotaCreateSchema,
  ReciboGenerateSchema,
} from '@/lib/validations/rol-workspace'

const estadoRolEnum = z.enum(['pendiente', 'en_proceso', 'terminado', 'archivado'])
const estadoDiligenciaEnum = z.enum(['pendiente', 'completada', 'fallida'])
const notificationWorkflowStatusEnum = z.enum(['nueva', 'recibo_generado', 'ejecutada'])

const DiligenciaTipoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  descripcion: z.string().nullable().optional(),
})

const NotificacionItemSchema = z.object({
  id: z.string(),
  diligenciaId: z.string(),
  meta: z.unknown().nullable().optional(),
  ejecutadoId: z.string().nullable().optional(),
  bancoId: z.number().int().positive().nullable().optional(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  voidedAt: z.string().nullable().optional(),
  voidReason: z.string().nullable().optional(),
  voidedByUserId: z.string().nullable().optional(),
  workflowStatus: notificationWorkflowStatusEnum.default('nueva'),
  completeness: z
    .object({
      isComplete: z.boolean(),
      missingFields: z.array(z.string()),
    })
    .optional(),
  latestEstampo: z
    .object({
      documentoId: z.string(),
      slug: z.string().nullable(), // Legacy no tiene slug
      nombreVisible: z.string(),
    })
    .nullable()
    .optional(),
  step1Done: z.boolean().optional(),
  step2Done: z.boolean().optional(),
  step3Done: z.boolean().optional(),
  latestReciboId: z.string().nullable().optional(),
  latestEstampoId: z.string().nullable().optional(),
})

const NotificationProgressUpdateSchema = NotificacionItemSchema.pick({
  id: true,
  diligenciaId: true,
  meta: true,
  ejecutadoId: true,
  bancoId: true,
  createdAt: true,
  updatedAt: true,
  step1Done: true,
})

const EjecutadoItemSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  direccion: z.string(),
})

const DiligenciaItemSchema = z.object({
  id: z.string(),
  tipo: DiligenciaTipoSchema,
  estado: estadoDiligenciaEnum,
  fecha: z.string(),
  meta: z.unknown().nullable().optional(),
  createdAt: z.string(),
  ejecutados: z.array(EjecutadoItemSchema).default([]),
  notificaciones: z.array(NotificacionItemSchema).default([]),
})

const DocumentoItemSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  tipo: z.string(),
  version: z.number(),
  hasPdf: z.boolean().default(false),
  createdAt: z.string(),
  diligenciaId: z.string().nullable().optional(),
  notificacionId: z.string().nullable().optional(),
  voidedAt: z.string().nullable().optional(),
  voidReason: z.string().nullable().optional(),
  voidedByUserId: z.string().nullable().optional(),
  generatedByUserId: z.string().nullable().optional(),
  generatedAt: z.string().nullable().optional(),
  sourceTemplate: z.unknown().nullable().optional(),
  generationVariables: z.unknown().nullable().optional(),
  generationVersion: z.number().optional(),
  diligencia: z
    .object({
      id: z.string(),
      tipo: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  estampo: z
    .object({
      id: z.string(),
      nombre: z.string(),
      tipo: z.string(),
    })
    .nullable()
    .optional(),
  estampoBase: z
    .object({
      id: z.number(),
      nombreVisible: z.string(),
      categoria: z.string(),
    })
    .nullable()
    .optional(),
})

const NotaItemSchema = z.object({
  id: z.string(),
  contenido: z.string(),
  userId: z.string(),
  createdAt: z.string(),
})

const ReciboItemSchema = z.object({
  id: z.string(),
  notificacionId: z.string().nullable().optional(),
  documentoId: z.string().nullable().optional(),
  documentVersionId: z.string().nullable().optional(),
  bancoId: z.number().int().positive().nullable().optional(),
  numeroRecibo: z.string().nullable().optional(),
  monto: z.number(),
  medio: z.string(),
  ref: z.string().nullable().optional(),
  fechaEjecucion: z.string().nullable().optional(),
  fechaRecibo: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'CORRECTED', 'VOIDED']).optional(),
  supersedesReciboId: z.string().nullable().optional(),
  createdAt: z.string(),
})

const ReceiptWorkflowSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('CUSTOM'), estampoId: z.string() }),
  z.object({ kind: z.literal('WIZARD'), categoria: z.string(), estampoBaseId: z.number().optional() }),
])

const ReceiptWorkflowSchema = z.object({
  notification: NotificacionItemSchema,
  ejecutado: z.object({
    id: z.string(),
    nombre: z.string(),
    direccion: z.string().nullable(),
    comuna: z.object({ id: z.number(), nombre: z.string() }).nullable(),
  }),
  bankContext: z.object({
    selectedBankId: z.number().int().positive().nullable(),
    banks: z.array(z.object({ id: z.number().int().positive(), nombre: z.string() })),
  }),
  execution: z.object({ fecha: z.string().nullable(), hora: z.string().nullable() }),
  selectedEstampoTipo: ReceiptWorkflowSelectionSchema.nullable(),
  monto: z.number().nullable(),
  estampoOptions: z.array(
    z.object({
      selection: ReceiptWorkflowSelectionSchema,
      label: z.string(),
      contenido: z.string().nullable().optional(),
      count: z.number().optional(),
      aranceles: z.array(
        z.object({
          bancoId: z.number().int().positive(),
          monto: z.number(),
          source: z.enum(['abogado', 'banco']),
        })
      ),
    })
  ),
  receiptState: z
    .object({
      receiptId: z.string(),
      documentoId: z.string().nullable(),
      numeroRecibo: z.string(),
      generationFingerprint: z.string().nullable(),
    })
    .nullable(),
  historicalSelection: z
    .object({ selection: ReceiptWorkflowSelectionSchema, label: z.string(), active: z.literal(false) })
    .nullable(),
})

const ReceiptGenerationResponseSchema = z.object({
  operation: z.enum(['created', 'regenerated', 'corrected']),
  documento: DocumentoItemSchema,
  recibo: ReciboItemSchema,
  notificacion: NotificacionItemSchema,
  defaultArancelSaved: z.boolean().optional().default(false),
  cacheRevision: z.number().int().nonnegative().nullable().optional(),
})

export const StampGenerationResponseSchema = z.object({
  documento: DocumentoItemSchema,
  notificacion: NotificacionItemSchema.nullable(),
})

const RolSummarySchema = z.object({
  diligencias: z.array(DiligenciaItemSchema),
  documentos: z.array(DocumentoItemSchema),
  notas: z.array(NotaItemSchema),
  recibos: z.array(ReciboItemSchema),
})

const TribunalSchema = z
  .object({
    id: z.string(),
    nombre: z.string(),
    direccion: z.string().nullable().optional(),
    comuna: z.string().nullable().optional(),
  })
  .nullable()

const EjecutadoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  rut: z.string(),
  direccion: z.string().nullable().optional(),
  comuna: z
    .object({
      id: z.number(),
      nombre: z.string(),
    })
    .nullable()
    .optional(),
})

const DemandaSchema = z
  .object({
    id: z.string(),
    cuantia: z.number().nullable().optional(),
    caratula: z.string().nullable().optional(),
    materia: z
      .object({
        id: z.number(),
        nombre: z.string(),
      })
      .nullable()
      .optional(),
    ejecutados: z.array(EjecutadoSchema).optional(),
    procurador: z
      .object({
        id: z.number(),
        nombre: z.string(),
      })
      .nullable()
      .optional(),
  })
  .nullable()

const AbogadoSchema = z
  .object({
    id: z.number().nullable().optional(),
    nombre: z.string().nullable().optional(),
    rut: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    telefono: z.string().nullable().optional(),
    bancos: z
      .array(
        z.object({
          banco: z.object({
            id: z.number(),
            nombre: z.string(),
          }),
        })
      )
      .default([]),
  })
  .nullable()

const RolKpiSchema = z.object({
  diligenciasTotal: z.number(),
  diligenciasPendientes: z.number(),
  diligenciasCompletadas: z.number(),
  documentosTotal: z.number(),
  notasTotal: z.number(),
  recibosTotal: z.number(),
})

const RolHeaderDataSchema = z.object({
  rol: z.object({
    id: z.string(),
    numero: z.string(),
    estado: estadoRolEnum,
    createdAt: z.string(),
  }),
  tribunal: TribunalSchema,
})

const RolDataSchema = z.object({
  rol: z.object({
    id: z.string(),
    numero: z.string(),
    estado: estadoRolEnum,
    createdAt: z.string(),
  }),
  tribunal: TribunalSchema,
  demanda: DemandaSchema,
  abogado: AbogadoSchema,
  ultimaActividad: z.string().nullable(),
  kpis: RolKpiSchema,
  resumen: RolSummarySchema,
})

const TimelineItemSchema = z.object({
  id: z.string(),
  userEmail: z.string(),
  accion: z.string(),
  createdAt: z.string(),
})

async function fetcher<T extends z.ZodTypeAny>(
  url: string,
  dataSchema: T,
  init?: RequestInit
): Promise<z.infer<T>> {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
  })

  const contentType = response.headers.get('content-type')
  const isJson = contentType?.includes('application/json')
  const payload = isJson ? await response.json() : null

  if (!response.ok || payload?.ok !== true) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      (payload?.error && typeof payload.error.message === 'string' && payload.error.message) ||
      'Error al comunicarse con el servidor'
    throw new Error(message)
  }

  const parsed = dataSchema.safeParse(payload?.data)

  if (!parsed.success) {
    throw new Error('Respuesta del servidor inválida')
  }

  return parsed.data
}

const rolHeaderKey = (rolId: string) => ['rol', rolId, 'header'] as const
const rolQueryKey = (rolId: string) => ['rol', rolId] as const
const diligenciasKey = (rolId: string) => ['rol', rolId, 'diligencias'] as const
const documentosKey = (rolId: string) => ['rol', rolId, 'documentos'] as const
const notasKey = (rolId: string) => ['rol', rolId, 'notas'] as const
const timelineKey = (rolId: string) => ['rol', rolId, 'timeline'] as const
export const receiptWorkflowKey = (
  rolId: string,
  diligenciaId: string,
  notificacionId: string,
  includeEstampoContent = false,
  officeId?: number,
  cacheRevision?: number
) => [
  'rol', rolId, 'diligencias', diligenciaId, 'notificaciones', notificacionId, 'workflow',
  includeEstampoContent ? 'stamp-detail' : 'summary', officeId, cacheRevision,
] as const

export type RolWorkspaceData = z.infer<typeof RolDataSchema>
export type RolHeaderData = z.infer<typeof RolHeaderDataSchema>
export type DiligenciaItem = z.infer<typeof DiligenciaItemSchema>
export type DocumentoItem = z.infer<typeof DocumentoItemSchema>
export type NotaItem = z.infer<typeof NotaItemSchema>
export type TimelineItem = z.infer<typeof TimelineItemSchema>
export type NotificacionItem = z.infer<typeof NotificacionItemSchema>
export type ReceiptWorkflowData = z.infer<typeof ReceiptWorkflowSchema>
export type ReceiptGenerationResponse = z.infer<typeof ReceiptGenerationResponseSchema>
export type StampGenerationResponse = z.infer<typeof StampGenerationResponseSchema>

export function applyStampGenerationToCache(
  queryClient: QueryClient,
  params: { rolId: string; diligenciaId: string; notificacionId: string },
  generated: StampGenerationResponse
) {
  const { rolId, diligenciaId, notificacionId } = params
  queryClient.setQueryData(documentosKey(rolId), (current: DocumentoItem[] | undefined) => {
    const existing = current ?? []
    return [generated.documento, ...existing.filter(item => item.id !== generated.documento.id)]
  })
  queryClient.setQueryData(diligenciasKey(rolId), (current: DiligenciaItem[] | undefined) =>
    generated.notificacion
      ? patchDiligenciasList(current, items => items.map(item => item.id !== diligenciaId ? item : {
          ...item,
          notificaciones: item.notificaciones.map(notification => notification.id === notificacionId ? generated.notificacion! : notification),
        }))
      : current
  )
  queryClient.setQueryData(rolQueryKey(rolId), (current: RolWorkspaceData | undefined) => {
    if (!current) return current
    const existed = current.resumen.documentos.some(item => item.id === generated.documento.id)
    return {
      ...current,
      ultimaActividad: generated.documento.createdAt,
      kpis: { ...current.kpis, documentosTotal: current.kpis.documentosTotal + (existed ? 0 : 1) },
      resumen: {
        ...current.resumen,
        documentos: [generated.documento, ...current.resumen.documentos.filter(item => item.id !== generated.documento.id)],
        diligencias: generated.notificacion
          ? current.resumen.diligencias.map(item => item.id !== diligenciaId ? item : {
              ...item,
              notificaciones: item.notificaciones.map(notification => notification.id === notificacionId ? generated.notificacion! : notification),
            })
          : current.resumen.diligencias,
      },
    }
  })
  queryClient.setQueriesData<ReceiptWorkflowData>(
    { queryKey: ['rol', rolId, 'diligencias', diligenciaId, 'notificaciones', notificacionId, 'workflow'] },
    current => current && generated.notificacion ? { ...current, notification: generated.notificacion } : current
  )
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

function updateRolWorkspaceSummary(
  current: RolWorkspaceData | undefined,
  updater: (summary: RolWorkspaceData['resumen']) => RolWorkspaceData['resumen'],
  extra?: Partial<Pick<RolWorkspaceData, 'kpis' | 'ultimaActividad'>>
): RolWorkspaceData | undefined {
  if (!current) return current

  return {
    ...current,
    ...extra,
    resumen: updater(current.resumen),
  }
}

function patchDiligenciasList(
  current: DiligenciaItem[] | undefined,
  updater: (items: DiligenciaItem[]) => DiligenciaItem[]
): DiligenciaItem[] | undefined {
  if (!current) return current
  return updater(current)
}

function patchDocumentosList(
  current: DocumentoItem[] | undefined,
  updater: (items: DocumentoItem[]) => DocumentoItem[]
): DocumentoItem[] | undefined {
  if (!current) return current
  return updater(current)
}

export function useRolHeaderData(rolId: string) {
  return useQuery({
    queryKey: rolHeaderKey(rolId),
    queryFn: () => fetcher(`/api/roles/${rolId}/header`, RolHeaderDataSchema),
    enabled: !!rolId,
    retry: false,
  })
}

export function useRolData(rolId: string, enabled = true) {
  return useQuery({
    queryKey: rolQueryKey(rolId),
    queryFn: () => fetcher(`/api/roles/${rolId}/resumen`, RolDataSchema),
    enabled: !!rolId && enabled,
    retry: false,
    refetchInterval: 120000, // 2 minutes
  })
}

export function useDiligencias(rolId: string) {
  return useQuery({
    queryKey: diligenciasKey(rolId),
    queryFn: () => fetcher(`/api/roles/${rolId}/diligencias`, z.array(DiligenciaItemSchema)),
    enabled: !!rolId,
    retry: false,
  })
}

export function useReceiptWorkflow(
  rolId: string,
  diligenciaId: string,
  notificacionId: string,
  enabled = true,
  includeEstampoContent = false
) {
  const { officeId, cacheRevision } = useOfficeCacheContext()
  return useQuery({
    queryKey: receiptWorkflowKey(rolId, diligenciaId, notificacionId, includeEstampoContent, officeId, cacheRevision),
    queryFn: () =>
      fetcher(
        `/api/roles/${rolId}/diligencias/${diligenciaId}/notificaciones/${notificacionId}/workflow${includeEstampoContent ? '?detail=stamp' : ''}`,
        ReceiptWorkflowSchema
      ),
    enabled: enabled && !!rolId && !!diligenciaId && !!notificacionId,
    retry: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })
}

export function useDocumentos(rolId: string) {
  return useQuery({
    queryKey: documentosKey(rolId),
    queryFn: () => fetcher(`/api/roles/${rolId}/documentos`, z.array(DocumentoItemSchema)),
    enabled: !!rolId,
    retry: false,
  })
}

export function useNotas(rolId: string) {
  return useQuery({
    queryKey: notasKey(rolId),
    queryFn: () => fetcher(`/api/roles/${rolId}/notas`, z.array(NotaItemSchema)),
    enabled: !!rolId,
    retry: false,
  })
}

export function useTimeline(rolId: string) {
  return useQuery({
    queryKey: timelineKey(rolId),
    queryFn: () => fetcher(`/api/roles/${rolId}/timeline`, z.array(TimelineItemSchema)),
    enabled: !!rolId,
    retry: false,
  })
}

async function createNota(rolId: string, contenido: string) {
  const body = NotaCreateSchema.parse({ contenido })

  return fetcher(
    `/api/roles/${rolId}/notas`,
    NotaItemSchema,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )
}

export function useCreateNota(
  rolId: string
): UseMutationResult<z.infer<typeof NotaItemSchema>, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: contenido => createNota(rolId, contenido),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notasKey(rolId) })
      queryClient.invalidateQueries({ queryKey: rolQueryKey(rolId) })
    },
  })
}

export function useRolStateBadge(estado?: RolWorkspaceData['rol']['estado']) {
  return useMemo(() => {
    switch (estado) {
      case 'pendiente':
        return 'bg-amber-100 text-amber-800 border border-amber-200'
      case 'en_proceso':
        return 'bg-blue-100 text-blue-800 border border-blue-200'
      case 'terminado':
        return 'bg-emerald-100 text-emerald-800 border border-emerald-200'
      case 'archivado':
        return 'bg-slate-200 text-slate-700 border border-slate-300'
      default:
        return 'bg-slate-100 text-slate-600 border border-slate-200'
    }
  }, [estado])
}

export function useChangeRolStatus(rolId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (newEstado: string) => {
      const response = await fetch(`/api/roles/${rolId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: newEstado }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          (payload && typeof payload.error === 'string' && payload.error) ||
            'Error al cambiar el estado del ROL'
        )
      }

      return payload.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolQueryKey(rolId) })
      queryClient.invalidateQueries({ queryKey: rolHeaderKey(rolId) })
    },
  })
}

export function useCreateDiligencia(
  rolId: string
): UseMutationResult<z.infer<typeof DiligenciaItemSchema>, Error, z.infer<typeof DiligenciaCreateSchema>> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: z.infer<typeof DiligenciaCreateSchema>) => {
      const body = DiligenciaCreateSchema.parse(payload)

      const response = await fetch(`/api/roles/${rolId}/diligencias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || result?.ok !== true) {
        throw new Error(
          (result && typeof result.error === 'string' && result.error) ||
            'Error al crear diligencia'
        )
      }

      return result.data as z.infer<typeof DiligenciaItemSchema>
    },
    onSuccess: (createdDiligencia) => {
      queryClient.setQueryData(
        diligenciasKey(rolId),
        (current: DiligenciaItem[] | undefined) =>
          current ? [createdDiligencia, ...current] : [createdDiligencia]
      )

      queryClient.setQueryData(
        rolQueryKey(rolId),
        (current: RolWorkspaceData | undefined) =>
          updateRolWorkspaceSummary(
            current,
            summary => ({
              ...summary,
              diligencias: [createdDiligencia, ...summary.diligencias],
            }),
            current
              ? {
                  kpis: {
                    ...current.kpis,
                    diligenciasTotal: current.kpis.diligenciasTotal + 1,
                    diligenciasPendientes: current.kpis.diligenciasPendientes + 1,
                  },
                  ultimaActividad: createdDiligencia.createdAt,
                }
              : undefined
          )
      )
    },
  })
}

async function createNotificacion(
  rolId: string,
  diligenciaId: string,
  ejecutadoId?: string | null
) {
  const body: { ejecutadoId?: string } = {}
  if (ejecutadoId) {
    body.ejecutadoId = ejecutadoId
  }

  const response = await fetch(
    `/api/roles/${rolId}/diligencias/${diligenciaId}/notificaciones`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    }
  )

  const result = await response.json().catch(() => null)

  if (!response.ok || result?.ok !== true) {
    throw new Error(
      (result && typeof result.error === 'string' && result.error) ||
        'Error al crear notificación'
    )
  }

  return result.data as z.infer<typeof NotificacionItemSchema>
}

export function useCreateNotificacion(
  rolId: string
): UseMutationResult<
  z.infer<typeof NotificacionItemSchema>,
  Error,
  { diligenciaId: string; ejecutadoId?: string | null }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ diligenciaId, ejecutadoId }: { diligenciaId: string; ejecutadoId?: string | null }) =>
      createNotificacion(rolId, diligenciaId, ejecutadoId),
    onSuccess: (createdNotificacion, variables) => {
      queryClient.setQueryData(
        diligenciasKey(rolId),
        (current: DiligenciaItem[] | undefined) =>
          patchDiligenciasList(current, items =>
            items.map(item =>
              item.id !== variables.diligenciaId
                ? item
                : {
                    ...item,
                    notificaciones: [...item.notificaciones, createdNotificacion],
                  }
            )
          )
      )
    },
  })
}

export function useGenerateRecibo(
  rolId: string,
  diligenciaId: string
): UseMutationResult<
  ReceiptGenerationResponse,
  ApiClientError,
  z.infer<typeof ReciboGenerateSchema>
> {
  const queryClient = useQueryClient()
  const { advanceCacheRevision } = useOfficeCacheContext()

  return useMutation({
    mutationFn: async (input: z.infer<typeof ReciboGenerateSchema>) => {
      const body = ReciboGenerateSchema.parse(input)
      const idempotencyKey = `receipt-${crypto.randomUUID()}`

      const response = await fetch(`/api/diligencias/${diligenciaId}/recibo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(body),
        credentials: 'include',
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || result?.ok !== true) {
        throw new ApiClientError(
          (result?.error && typeof result.error.message === 'string' && result.error.message) ||
            'Error al generar recibo',
          typeof result?.error?.code === 'string' ? result.error.code : undefined,
          result?.error?.details && typeof result.error.details === 'object'
            ? result.error.details
            : undefined
        )
      }

      const parsed = ReceiptGenerationResponseSchema.safeParse(result.data)
      if (!parsed.success) throw new ApiClientError('Respuesta del servidor invalida')
      return parsed.data
    },
    onSuccess: (generated, variables) => {
      const workflowPrefix = ['rol', rolId, 'diligencias', diligenciaId, 'notificaciones', variables.notificacionId, 'workflow'] as const
      const priorWorkflow = queryClient.getQueriesData<ReceiptWorkflowData>({ queryKey: workflowPrefix }).find(([, value]) => !!value)?.[1]
      const priorDocumentoId =
        generated.operation === 'corrected' ? priorWorkflow?.receiptState?.documentoId : null

      queryClient.setQueryData(documentosKey(rolId), (current: DocumentoItem[] | undefined) => {
        const existing = current ?? []
        const withoutSuperseded = priorDocumentoId
          ? existing.filter(item => item.id !== priorDocumentoId)
          : existing
        const withoutCurrent = withoutSuperseded.filter(item => item.id !== generated.documento.id)
        return [generated.documento, ...withoutCurrent]
      })

      queryClient.setQueryData(diligenciasKey(rolId), (current: DiligenciaItem[] | undefined) =>
        patchDiligenciasList(current, items =>
          items.map(item =>
            item.id !== diligenciaId
              ? item
              : {
                  ...item,
                  notificaciones: item.notificaciones.map(notification =>
                    notification.id === generated.notificacion.id
                      ? generated.notificacion
                      : notification
                  ),
                }
          )
        )
      )

      queryClient.setQueryData(rolQueryKey(rolId), (current: RolWorkspaceData | undefined) => {
        if (!current) return current
        const nextDocuments = current.resumen.documentos
          .filter(item => item.id !== generated.documento.id && item.id !== priorDocumentoId)
        const nextReceipts = current.resumen.recibos.filter(
          item => item.id !== generated.recibo.id && item.id !== generated.recibo.supersedesReciboId
        )
        return {
          ...current,
          ultimaActividad: generated.documento.createdAt,
          kpis: {
            ...current.kpis,
            documentosTotal: current.kpis.documentosTotal + (generated.operation === 'created' ? 1 : 0),
            recibosTotal: current.kpis.recibosTotal + (generated.operation === 'created' ? 1 : 0),
          },
          resumen: {
            ...current.resumen,
            documentos: [generated.documento, ...nextDocuments],
            recibos: [generated.recibo, ...nextReceipts],
          },
        }
      })

      queryClient.setQueriesData<ReceiptWorkflowData>({ queryKey: workflowPrefix }, current =>
        current
          ? {
              ...current,
              notification: generated.notificacion,
              execution: variables.ejecucion,
              selectedEstampoTipo: variables.estampoTipo,
              monto: variables.monto,
              estampoOptions: generated.defaultArancelSaved
                ? current.estampoOptions.map(option => {
                    const matchesSelection = variables.estampoTipo.kind === 'CUSTOM'
                      ? option.selection.kind === 'CUSTOM' && option.selection.estampoId === variables.estampoTipo.estampoId
                      : option.selection.kind === 'WIZARD' && option.selection.categoria === variables.estampoTipo.categoria
                    if (!matchesSelection) return option
                    return {
                      ...option,
                      aranceles: [
                        ...option.aranceles.filter(arancel => arancel.bancoId !== variables.bancoId),
                        { bancoId: variables.bancoId, monto: variables.monto, source: 'abogado' as const },
                      ],
                    }
                  })
                : current.estampoOptions,
              bankContext: { ...current.bankContext, selectedBankId: variables.bancoId },
              receiptState: {
                receiptId: generated.recibo.id,
                documentoId: generated.documento.id,
                numeroRecibo: generated.recibo.numeroRecibo ?? '',
                generationFingerprint: null,
              },
            }
          : current
      )

      if (generated.defaultArancelSaved) {
        void queryClient.invalidateQueries({ queryKey: ['rol', rolId, 'diligencias'] })
      }
      if (typeof generated.cacheRevision === 'number') {
        advanceCacheRevision(generated.cacheRevision)
      }
    },
  })
}

async function patchNotificacionMeta(
  rolId: string,
  diligenciaId: string,
  notificacionId: string,
  input: { meta: Record<string, unknown>; bancoId?: number }
): Promise<z.infer<typeof NotificationProgressUpdateSchema>> {
  const response = await fetch(
    `/api/roles/${rolId}/diligencias/${diligenciaId}/notificaciones/${notificacionId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      credentials: 'include',
    }
  )

  const result = await response.json().catch(() => null)
  if (!response.ok || result?.ok !== true) {
    throw new Error(
      (result && typeof result.error === 'string' && result.error) ||
        (result?.error && typeof result.error.message === 'string' && result.error.message) ||
        'Error al actualizar notificación'
    )
  }

  const parsed = NotificationProgressUpdateSchema.safeParse(result.data)
  if (!parsed.success) {
    throw new Error('Respuesta del servidor inválida')
  }

  return parsed.data
}

export function useUpdateNotificacionMeta(
  rolId: string,
  diligenciaId: string,
  notificacionId: string
): UseMutationResult<
  z.infer<typeof NotificationProgressUpdateSchema>,
  Error,
  { meta: Record<string, unknown>; bancoId?: number }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: input => patchNotificacionMeta(rolId, diligenciaId, notificacionId, input),
    onSuccess: updatedNotificacion => {
      queryClient.setQueryData(
        diligenciasKey(rolId),
        (current: DiligenciaItem[] | undefined) =>
          patchDiligenciasList(current, items =>
            items.map(item =>
              item.id !== diligenciaId
                ? item
                : {
                    ...item,
                    notificaciones: item.notificaciones.map(notificacion =>
                      notificacion.id === updatedNotificacion.id
                        ? { ...notificacion, ...updatedNotificacion }
                        : notificacion
                    ),
                  }
            )
          )
      )
    },
  })
}

async function deleteNotificacion(
  rolId: string,
  diligenciaId: string,
  notificacionId: string,
  reason?: string
): Promise<void> {
  const body = reason ? { reason } : undefined

  const response = await fetch(
    `/api/roles/${rolId}/diligencias/${diligenciaId}/notificaciones/${notificacionId}`,
    {
      method: 'DELETE',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    }
  )

  const result = await response.json().catch(() => null)

  if (!response.ok || result?.ok !== true) {
    const message =
      (result && typeof result.error === 'string' && result.error) ||
      'Error al anular notificación'
    throw new Error(message)
  }
}

export function useDeleteNotificacion(
  rolId: string
): UseMutationResult<void, Error, { diligenciaId: string; notificacionId: string; reason?: string }> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ diligenciaId, notificacionId, reason }: { diligenciaId: string; notificacionId: string; reason?: string }) =>
      deleteNotificacion(rolId, diligenciaId, notificacionId, reason),
    onSuccess: (_, variables) => {
      queryClient.setQueryData(
        diligenciasKey(rolId),
        (current: DiligenciaItem[] | undefined) =>
          patchDiligenciasList(current, items =>
            items.map(item =>
              item.id !== variables.diligenciaId
                ? item
                : {
                    ...item,
                    notificaciones: item.notificaciones.filter(
                      notificacion => notificacion.id !== variables.notificacionId
                    ),
                  }
            )
          )
      )

      queryClient.setQueryData(
        documentosKey(rolId),
        (current: DocumentoItem[] | undefined) =>
          patchDocumentosList(current, items =>
            items.filter(item => item.notificacionId !== variables.notificacionId)
          )
      )

      queryClient.setQueryData(
        rolQueryKey(rolId),
        (current: RolWorkspaceData | undefined) =>
          updateRolWorkspaceSummary(current, summary => ({
            ...summary,
            documentos: summary.documentos.filter(
              item => item.notificacionId !== variables.notificacionId
            ),
            recibos: summary.recibos.filter(
              item => item.notificacionId !== variables.notificacionId
            ),
          }))
      )
    },
  })
}

