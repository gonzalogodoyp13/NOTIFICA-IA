// EjecutadoForm component
// Section 1: Datos del Ejecutado
'use client'

import { UseFormRegister, UseFormWatch, FieldErrors, UseFormSetValue } from 'react-hook-form'
import RUTInput from './RUTInput'
import { useEffect, useState } from 'react'

interface Comuna {
  id: number
  nombre: string
}

interface EjecutadoFormData {
  nombre: string
  rut: string
  direccion?: string
  comunaId?: number
  rvm?: any
}

interface EjecutadoFormProps {
  register: UseFormRegister<any>
  watch: UseFormWatch<any>
  errors: FieldErrors<any>
  setValue: UseFormSetValue<any>
  onBlur?: () => void
}

export default function EjecutadoForm({
  register,
  watch,
  errors,
  setValue,
  onBlur,
}: EjecutadoFormProps) {
  const [comunas, setComunas] = useState<Comuna[]>([])
  const [loadingComunas, setLoadingComunas] = useState(true)

  const nombre = watch('nombre')
  const rut = watch('rut')
  const direccion = watch('direccion')
  const comunaId = watch('comunaId')

  useEffect(() => {
    // Fetch comunas
    const fetchComunas = async () => {
      try {
        const response = await fetch('/api/comunas')
        const result = await response.json()
        if (result.ok) {
          setComunas(result.data)
        }
      } catch (error) {
        console.error('Error fetching comunas:', error)
      } finally {
        setLoadingComunas(false)
      }
    }

    fetchComunas()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          1. Datos del Ejecutado
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Ingresa la información del ejecutado (demandado/aval)
        </p>
      </div>

      <div className="space-y-4">
        {/* Nombre */}
        <div>
          <label
            htmlFor="nombre"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Nombre completo <span className="text-red-500">*</span>
          </label>
          <input
            id="nombre"
            type="text"
            {...register('nombre', {
              required: 'El nombre es requerido',
              minLength: {
                value: 3,
                message: 'El nombre debe tener al menos 3 caracteres',
              },
            })}
            onBlur={onBlur}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.nombre
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-blue-500'
            }`}
            placeholder="Juan Pérez González"
          />
          {errors.nombre && (
            <p className="mt-1 text-sm text-red-600">
              {errors.nombre.message as string}
            </p>
          )}
        </div>

        {/* RUT */}
        <div>
          <label
            htmlFor="rut"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            RUT <span className="text-red-500">*</span>
          </label>
          <RUTInput
            onBlur={onBlur}
            error={errors.rut?.message as string}
            register={register('rut', {
              required: 'El RUT es requerido',
              validate: (value) => {
                if (!value) return 'El RUT es requerido'
                // Basic format validation
                const cleaned = value.replace(/[.\-]/g, '')
                if (cleaned.length < 8 || cleaned.length > 9) {
                  return 'RUT inválido'
                }
                return true
              },
            })}
          />
        </div>

        {/* Dirección */}
        <div>
          <label
            htmlFor="direccion"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Dirección
          </label>
          <input
            id="direccion"
            type="text"
            {...register('direccion')}
            onBlur={onBlur}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Calle Ejemplo 123"
          />
        </div>

        {/* Comuna */}
        <div>
          <label
            htmlFor="comunaId"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Comuna
          </label>
          <select
            id="comunaId"
            {...register('comunaId', {
              valueAsNumber: true,
            })}
            onBlur={onBlur}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.comunaId
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-blue-500'
            }`}
            disabled={loadingComunas}
          >
            <option value="">Selecciona una comuna (opcional)</option>
            {comunas.map((comuna) => (
              <option key={comuna.id} value={comuna.id}>
                {comuna.nombre}
              </option>
            ))}
          </select>
          {errors.comunaId && (
            <p className="mt-1 text-sm text-red-600">
              {errors.comunaId.message as string}
            </p>
          )}
        </div>

        {/* RVM (opcional, JSON) */}
        <div>
          <label
            htmlFor="rvm"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            RVM (Información del vehículo)
          </label>
          <textarea
            id="rvm"
            {...register('rvm')}
            onBlur={onBlur}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder='{"marca": "Toyota", "modelo": "Corolla", "año": 2020}'
          />
          <p className="mt-1 text-xs text-gray-500">
            Opcional: Información del vehículo en formato JSON
          </p>
        </div>
      </div>
    </div>
  )
}

