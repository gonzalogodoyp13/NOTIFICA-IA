'use client'

import { useEffect, useState } from 'react'

import { BoletaGenerateSchema } from '@/lib/validations/rol-workspace'
import { useGenerateBoleta } from '@/lib/hooks/useRolWorkspace'

interface BoletaModalProps {
  rolId: string
  diligenciaId: string
  onClose: () => void
  onGenerated?: () => void
}

export default function BoletaModal({ rolId, diligenciaId, onClose, onGenerated }: BoletaModalProps) {
  const [monto, setMonto] = useState('')
  const [medio, setMedio] = useState('')
  const [referencia, setReferencia] = useState('')
  const [variables, setVariables] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const generateBoleta = useGenerateBoleta(rolId, diligenciaId)

  useEffect(() => {
    if (generateBoleta.isSuccess) {
      setSuccessMsg('Documento generado correctamente.')
      onGenerated?.()
      const timeout = setTimeout(() => {
        onClose()
      }, 1500)
      return () => clearTimeout(timeout)
    }
    return undefined
  }, [generateBoleta.isSuccess, onClose, onGenerated])

  const handleSubmit = () => {
    setErrorMsg(null)

    let parsedVariables: Record<string, string> | undefined
    if (variables.trim().length > 0) {
      try {
        const parsed = JSON.parse(variables)
        if (parsed && typeof parsed === 'object') {
          parsedVariables = Object.fromEntries(
            Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')])
          )
        }
      } catch (error) {
        setErrorMsg('Variables inválidas. Usa un JSON válido.')
        return
      }
    }

    const validation = BoletaGenerateSchema.safeParse({
      monto: Number(monto),
      medio,
      referencia,
      variables: parsedVariables,
    })

    if (!validation.success) {
      setErrorMsg(validation.error.issues[0]?.message ?? 'Datos inválidos.')
      return
    }

    generateBoleta.mutate(validation.data, {
      onError: error => {
        setErrorMsg(error.message || 'No se pudo generar la boleta.')
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Generar Boleta</h2>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-700"
            onClick={onClose}
          >
            Cerrar
          </button>
        </header>

        <div className="mt-4 space-y-3 text-sm">
          <div>
            <label className="block font-medium text-slate-700" htmlFor="boleta-monto">
              Monto
            </label>
            <input
              id="boleta-monto"
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded border border-slate-300 p-2"
              value={monto}
              onChange={event => setMonto(event.target.value)}
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700" htmlFor="boleta-medio">
              Medio de pago
            </label>
            <input
              id="boleta-medio"
              type="text"
              className="mt-1 w-full rounded border border-slate-300 p-2"
              placeholder="Transferencia, efectivo, etc."
              value={medio}
              onChange={event => setMedio(event.target.value)}
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700" htmlFor="boleta-ref">
              Referencia
            </label>
            <input
              id="boleta-ref"
              type="text"
              className="mt-1 w-full rounded border border-slate-300 p-2"
              placeholder="N° operación, voucher..."
              value={referencia}
              onChange={event => setReferencia(event.target.value)}
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700" htmlFor="boleta-variables">
              Variables (JSON opcional)
            </label>
            <textarea
              id="boleta-variables"
              className="mt-1 h-24 w-full rounded border border-slate-300 p-2 font-mono text-xs"
              placeholder='{"nombre_ejecutado":"Juan Pérez"}'
              value={variables}
              onChange={event => setVariables(event.target.value)}
            />
          </div>
        </div>

        {errorMsg && <p className="mt-3 text-sm text-rose-600">{errorMsg}</p>}
        {successMsg && <p className="mt-3 text-sm text-emerald-600">{successMsg}</p>}

        <footer className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
            onClick={onClose}
            disabled={generateBoleta.isPending}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
            onClick={handleSubmit}
            disabled={generateBoleta.isPending}
          >
            {generateBoleta.isPending ? 'Generando…' : 'Generar Boleta'}
          </button>
        </footer>
      </div>
    </div>
  )
}

