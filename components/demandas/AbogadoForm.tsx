// AbogadoForm component
// Section 3: Datos del Abogado
'use client'

import {
  UseFormRegister,
  UseFormWatch,
  FieldErrors,
  UseFormSetValue,
} from 'react-hook-form'
import { useEffect, useState } from 'react'

interface Abogado {
  id: number
  nombre?: string
  direccion?: string
}

interface AbogadoFormData {
  abogadoId: number
  direccion?: string
}

interface AbogadoFormProps {
  register: UseFormRegister<any>
  watch: UseFormWatch<any>
  errors: FieldErrors<any>
  setValue: UseFormSetValue<any>
  onBlur?: () => void
}

export default function AbogadoForm({
  register,
  watch,
  errors,
  setValue,
  onBlur,
}: AbogadoFormProps) {
  const [abogados, setAbogados] = useState<Abogado[]>([])
  const [loadingAbogados, setLoadingAbogados] = useState(true)

  const abogadoId = watch('abogadoId')
  const direccion = watch('direccion')

  useEffect(() => {
    // Fetch abogados
    const fetchAbogados = async () => {
      try {
        const response = await fetch('/api/abogados')
        const result = await response.json()
        if (result.ok) {
          setAbogados(result.data)
        }
      } catch (error) {
        console.error('Error fetching abogados:', error)
      } finally {
        setLoadingAbogados(false)
      }
    }

    fetchAbogados()
  }, [])

  // Prefill direccion when abogado is selected
  useEffect(() => {
    if (abogadoId && abogados.length > 0) {
      const selectedAbogado = abogados.find((a) => a.id === Number(abogadoId))
      if (selectedAbogado?.direccion && !direccion) {
        setValue('direccion', selectedAbogado.direccion)
      }
    }
  }, [abogadoId, abogados, direccion, setValue])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          3. Datos del Abogado
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Selecciona el abogado responsable del caso
        </p>
      </div>

      <div className="space-y-4">
        {/* Abogado */}
        <div>
          <label
            htmlFor="abogadoId"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Abogado <span className="text-red-500">*</span>
          </label>
          <select
            id="abogadoId"
            {...register('abogadoId', {
              required: 'El abogado es requerido',
              valueAsNumber: true,
            })}
            onBlur={onBlur}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.abogadoId
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-blue-500'
            }`}
            disabled={loadingAbogados}
          >
            <option value="">Selecciona un abogado</option>
            {abogados.map((abogado) => (
              <option key={abogado.id} value={abogado.id}>
                {abogado.nombre || `Abogado #${abogado.id}`}
              </option>
            ))}
          </select>
          {errors.abogadoId && (
            <p className="mt-1 text-sm text-red-600">
              {errors.abogadoId.message as string}
            </p>
          )}
        </div>

        {/* Dirección del Abogado */}
        <div>
          <label
            htmlFor="direccionAbogado"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Dirección del Abogado
          </label>
          <input
            id="direccionAbogado"
            type="text"
            {...register('direccion')}
            onBlur={onBlur}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Se completa automáticamente al seleccionar el abogado"
          />
          <p className="mt-1 text-xs text-gray-500">
            Opcional: Se puede editar si es diferente a la dirección del abogado
          </p>
        </div>
      </div>
    </div>
  )
}


