'use client'

import { useEffect, useMemo, useState } from 'react'

import { DiligenciaCreateSchema } from '@/lib/validations/rol-workspace'
import { useCreateDiligencia } from '@/lib/hooks/useRolWorkspace'

interface DiligenciaTipo {
  id: string
  nombre: string
}

interface NuevaDiligenciaWizardProps {
  rolId: string
  onClose: () => void
  onCreated?: () => void
}

const FALLBACK_TIPOS: DiligenciaTipo[] = [
  { id: 'notificacion', nombre: 'Notificación' },
  { id: 'requerimiento', nombre: 'Requerimiento' },
  { id: 'embargo', nombre: 'Embargo' },
]

export default function NuevaDiligenciaWizard({ rolId, onClose, onCreated }: NuevaDiligenciaWizardProps) {
  const [step, setStep] = useState(1)
  const [tipos, setTipos] = useState<DiligenciaTipo[]>([])
  const [isLoadingTipos, setIsLoadingTipos] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [form, setForm] = useState({
    tipoId: '',
    fecha: '',
    observaciones: '',
  })

  const createDiligencia = useCreateDiligencia(rolId)

  useEffect(() => {
    let active = true

    const fetchTipos = async () => {
      setIsLoadingTipos(true)
      try {
        const response = await fetch('/api/diligencia-tipos', { credentials: 'include' })
        if (!response.ok) throw new Error('No se pudieron obtener los tipos de diligencia')
        const payload = await response.json()
        if (active && Array.isArray(payload?.data)) {
          setTipos(
            payload.data.map((item: any) => ({
              id: String(item.id),
              nombre: item.nombre ?? 'Tipo sin nombre',
            }))
          )
          return
        }
      } catch (error) {
        console.warn('Fallo al cargar tipos de diligencia, usando fallback', error)
      } finally {
        if (active) {
          setIsLoadingTipos(false)
        }
      }

      if (active) {
        setTipos(FALLBACK_TIPOS)
      }
    }

    fetchTipos()

    return () => {
      active = false
    }
  }, [])

  const selectedTipo = useMemo(
    () => tipos.find(tipo => tipo.id === form.tipoId),
    [tipos, form.tipoId]
  )

  const next = () => {
    if (step === 1 && !form.tipoId) {
      setErrorMsg('Selecciona un tipo de diligencia para continuar.')
      return
    }
    if (step === 2 && !form.fecha) {
      setErrorMsg('Ingresa la fecha de encargo para continuar.')
      return
    }
    setErrorMsg(null)
    setStep(step + 1)
  }

  const back = () => {
    setErrorMsg(null)
    setStep(step - 1)
  }

  const handleSave = () => {
    setErrorMsg(null)
    const validation = DiligenciaCreateSchema.safeParse({
      ...form,
      fecha: form.fecha,
    })

    if (!validation.success) {
      setErrorMsg(validation.error.issues[0]?.message ?? 'Datos inválidos.')
      return
    }

    createDiligencia.mutate(validation.data, {
      onSuccess: () => {
        onCreated?.()
        onClose()
      },
      onError: error => {
        setErrorMsg(error.message || 'No se pudo crear la diligencia.')
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {step === 1 && 'Tipo de diligencia'}
            {step === 2 && 'Datos de la diligencia'}
            {step === 3 && 'Confirmar diligencia'}
          </h2>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-700"
            onClick={onClose}
          >
            Cerrar
          </button>
        </header>

        <div className="mt-4 space-y-4">
          {step === 1 && (
            <>
              <p className="text-sm text-slate-600">
                Selecciona el tipo de diligencia que se ejecutará.
              </p>
              <select
                className="w-full rounded border border-slate-300 p-2 text-sm"
                value={form.tipoId}
                onChange={event => setForm(prev => ({ ...prev, tipoId: event.target.value }))}
                disabled={isLoadingTipos}
              >
                <option value="">Seleccione tipo...</option>
                {tipos.map(tipo => (
                  <option key={tipo.id} value={tipo.id}>
                    {tipo.nombre}
                  </option>
                ))}
              </select>
              {isLoadingTipos && (
                <p className="text-xs text-slate-400">Cargando tipos de diligencia...</p>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <label className="block text-sm font-medium text-slate-700" htmlFor="diligencia-fecha">
                Fecha de encargo
              </label>
              <input
                id="diligencia-fecha"
                type="date"
                className="w-full rounded border border-slate-300 p-2 text-sm"
                value={form.fecha}
                onChange={event => setForm(prev => ({ ...prev, fecha: event.target.value }))}
              />

              <label
                className="mt-4 block text-sm font-medium text-slate-700"
                htmlFor="diligencia-observaciones"
              >
                Observaciones
              </label>
              <textarea
                id="diligencia-observaciones"
                className="h-24 w-full rounded border border-slate-300 p-2 text-sm"
                placeholder="Notas internas sobre la diligencia..."
                value={form.observaciones}
                onChange={event =>
                  setForm(prev => ({ ...prev, observaciones: event.target.value }))
                }
              />
            </>
          )}

          {step === 3 && (
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                <span className="font-medium">Tipo:</span> {selectedTipo?.nombre ?? form.tipoId}
              </p>
              <p>
                <span className="font-medium">Fecha:</span>{' '}
                {form.fecha ? new Date(form.fecha).toLocaleDateString('es-CL') : '-'}
              </p>
              <p>
                <span className="font-medium">Observaciones:</span>{' '}
                {form.observaciones || 'Sin observaciones'}
              </p>
            </div>
          )}
        </div>

        {errorMsg && <p className="mt-4 text-sm text-rose-600">{errorMsg}</p>}

        <footer className="mt-6 flex justify-between">
          <button
            type="button"
            onClick={step === 1 ? onClose : back}
            className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
          >
            {step === 1 ? 'Cancelar' : 'Atrás'}
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={next}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={step === 1 ? !form.tipoId : step === 2 ? !form.fecha : false}
            >
              Siguiente
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
              disabled={createDiligencia.isPending}
            >
              {createDiligencia.isPending ? 'Guardando…' : 'Guardar diligencia'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

