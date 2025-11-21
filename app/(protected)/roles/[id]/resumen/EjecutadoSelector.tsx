'use client'

import { useState } from 'react'
import { type RolWorkspaceData } from '@/lib/hooks/useRolWorkspace'

type Ejecutado = NonNullable<NonNullable<RolWorkspaceData['demanda']>['ejecutados']>[number]

interface EjecutadoSelectorProps {
  ejecutados: Ejecutado[]
}

export default function EjecutadoSelector({ ejecutados }: EjecutadoSelectorProps) {
  const [selected, setSelected] = useState<Ejecutado>(ejecutados[0])

  if (!ejecutados || ejecutados.length === 0) {
    return null
  }

  return (
    <div className="mt-6">
      <h4 className="text-sm font-semibold text-slate-600 mb-2">Ejecutados</h4>

      <div className="flex flex-wrap gap-2 mb-4">
        {ejecutados.map((e) => (
          <button
            key={e.id}
            onClick={() => setSelected(e)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              selected.id === e.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
            }`}
          >
            {e.nombre}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
        <p className="text-sm text-slate-700">
          <span className="font-medium">Nombre:</span> {selected.nombre}
        </p>
        <p className="text-sm text-slate-700 mt-1">
          <span className="font-medium">RUT:</span> {selected.rut}
        </p>
        {selected.direccion && (
          <p className="text-sm text-slate-700 mt-1">
            <span className="font-medium">Dirección:</span> {selected.direccion}
          </p>
        )}
        {selected.comuna && (
          <p className="text-sm text-slate-700 mt-1">
            <span className="font-medium">Comuna:</span> {selected.comuna.nombre}
          </p>
        )}
      </div>
    </div>
  )
}

