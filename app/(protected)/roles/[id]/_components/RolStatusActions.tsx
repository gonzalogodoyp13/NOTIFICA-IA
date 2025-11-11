'use client'

import { useEffect, useMemo, useState } from 'react'

import { useChangeRolStatus } from '@/lib/hooks/useRolWorkspace'

interface RolStatusActionsProps {
  rolId: string
  current: string
}

const TRANSITIONS: Record<string, string[]> = {
  pendiente: ['en_proceso', 'archivado'],
  en_proceso: ['terminado', 'archivado'],
  terminado: ['archivado'],
  archivado: [],
}

export default function RolStatusActions({ rolId, current }: RolStatusActionsProps) {
  const { mutate, isPending, reset } = useChangeRolStatus(rolId)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const options = useMemo(() => {
    const safeCurrent = current || 'pendiente'
    return TRANSITIONS[safeCurrent] ?? []
  }, [current])

  useEffect(() => {
    if (!isPending && !errorMsg && successMsg) {
      const timeout = setTimeout(() => setSuccessMsg(null), 3000)
      return () => clearTimeout(timeout)
    }
    return undefined
  }, [isPending, errorMsg, successMsg])

  const handleChange = (estado: string) => {
    setErrorMsg(null)
    setSuccessMsg(null)

    mutate(estado, {
      onSuccess: () => {
        setSuccessMsg(`Estado actualizado a ${estado.replace('_', ' ')}`)
      },
      onError: error => {
        setErrorMsg(error.message || 'No se pudo actualizar el estado.')
        reset()
      },
    })
  }

  if (options.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {options.map(option => (
          <button
            key={option}
            type="button"
            disabled={isPending}
            onClick={() => handleChange(option)}
            className="rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cambiar a {option.replace('_', ' ')}
          </button>
        ))}
      </div>
      {errorMsg && <p className="text-xs text-rose-600">{errorMsg}</p>}
      {successMsg && <p className="text-xs text-emerald-600">{successMsg}</p>}
    </div>
  )
}

