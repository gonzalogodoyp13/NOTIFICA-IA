import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { z } from 'zod'

import {
  BoletaGenerateSchema,
  DiligenciaCreateSchema,
  EstampoGenerateSchema,
  NotaCreateSchema,
} from '@/lib/validations/rol-workspace'

const estadoRolEnum = z.enum(['pendiente', 'en_proceso', 'terminado', 'archivado'])
const estadoDiligenciaEnum = z.enum(['pendiente', 'completada', 'fallida'])

const DiligenciaTipoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  descripcion: z.string().nullable().optional(),
})

const DiligenciaItemSchema = z.object({
  id: z.string(),
  tipo: DiligenciaTipoSchema,
  estado: estadoDiligenciaEnum,
  fecha: z.string(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
})

const DocumentoItemSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  tipo: z.string(),
  version: z.number(),
  pdfId: z.string().nullable().optional(),
  createdAt: z.string(),
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
})

const NotaItemSchema = z.object({
  id: z.string(),
  contenido: z.string(),
  userId: z.string(),
  createdAt: z.string(),
})

const ReciboItemSchema = z.object({
  id: z.string(),
  monto: z.number(),
  medio: z.string(),
  ref: z.string().nullable().optional(),
  createdAt: z.string(),
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

const DemandaSchema = z
  .object({
    id: z.string(),
    cuantia: z.number().nullable().optional(),
    caratula: z.string().nullable().optional(),
  })
  .nullable()

const AbogadoSchema = z
  .object({
    id: z.number().nullable().optional(),
    nombre: z.string().nullable().optional(),
    rut: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    telefono: z.string().nullable().optional(),
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
      'Error al comunicarse con el servidor'
    throw new Error(message)
  }

  const parsed = dataSchema.safeParse(payload?.data)

  if (!parsed.success) {
    throw new Error('Respuesta del servidor inválida')
  }

  return parsed.data
}

const rolQueryKey = (rolId: string) => ['rol', rolId] as const
const diligenciasKey = (rolId: string) => ['rol', rolId, 'diligencias'] as const
const documentosKey = (rolId: string) => ['rol', rolId, 'documentos'] as const
const notasKey = (rolId: string) => ['rol', rolId, 'notas'] as const
const timelineKey = (rolId: string) => ['rol', rolId, 'timeline'] as const

export type RolWorkspaceData = z.infer<typeof RolDataSchema>
export type DiligenciaItem = z.infer<typeof DiligenciaItemSchema>
export type DocumentoItem = z.infer<typeof DocumentoItemSchema>
export type NotaItem = z.infer<typeof NotaItemSchema>
export type TimelineItem = z.infer<typeof TimelineItemSchema>

export function useRolData(rolId: string) {
  return useQuery({
    queryKey: rolQueryKey(rolId),
    queryFn: () => fetcher(`/api/roles/${rolId}`, RolDataSchema),
    enabled: !!rolId,
    retry: false,
    refetchInterval: 5000,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: diligenciasKey(rolId) })
      queryClient.invalidateQueries({ queryKey: rolQueryKey(rolId) })
    },
  })
}

export function useGenerateBoleta(
  rolId: string,
  diligenciaId: string
): UseMutationResult<unknown, Error, z.infer<typeof BoletaGenerateSchema>> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: z.infer<typeof BoletaGenerateSchema>) => {
      const body = BoletaGenerateSchema.parse(input)

      const response = await fetch(`/api/diligencias/${diligenciaId}/boleta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || result?.ok !== true) {
        throw new Error(
          (result && typeof result.error === 'string' && result.error) ||
            'Error al generar boleta'
        )
      }

      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentosKey(rolId) })
      queryClient.invalidateQueries({ queryKey: rolQueryKey(rolId) })
    },
  })
}

export function useGenerateEstampo(
  rolId: string,
  diligenciaId: string
): UseMutationResult<unknown, Error, z.infer<typeof EstampoGenerateSchema>> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: z.infer<typeof EstampoGenerateSchema>) => {
      const body = EstampoGenerateSchema.parse(input)

      const response = await fetch(`/api/diligencias/${diligenciaId}/estampo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || result?.ok !== true) {
        throw new Error(
          (result && typeof result.error === 'string' && result.error) ||
            'Error al generar estampo'
        )
      }

      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentosKey(rolId) })
      queryClient.invalidateQueries({ queryKey: rolQueryKey(rolId) })
    },
  })
}

