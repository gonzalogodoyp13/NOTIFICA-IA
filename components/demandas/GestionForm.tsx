// GestionForm component
// Section 2: Gestión Judicial
'use client'

import {
  UseFormRegister,
  UseFormWatch,
  FieldErrors,
  UseFormSetValue,
  UseFormTrigger,
} from 'react-hook-form'
import { useEffect, useState } from 'react'

interface Tribunal {
  id: number
  nombre: string
}

interface GestionFormData {
  rol: string
  tribunalId: number
  caratula: string
  cuantia: number
}

interface GestionFormProps {
  register: UseFormRegister<any>
  watch: UseFormWatch<any>
  errors: FieldErrors<any>
  setValue: UseFormSetValue<any>
  trigger: UseFormTrigger<any>
  onBlur?: () => void
}

export default function GestionForm({
  register,
  watch,
  errors,
  setValue,
  trigger,
  onBlur,
}: GestionFormProps) {
  const [tribunales, setTribunales] = useState<Tribunal[]>([])
  const [loadingTribunales, setLoadingTribunales] = useState(true)
  const [checkingRol, setCheckingRol] = useState(false)

  const rol = watch('rol')
  const tribunalId = watch('tribunalId')
  const caratula = watch('caratula')
  const cuantia = watch('cuantia')

  useEffect(() => {
    // Fetch tribunales
    const fetchTribunales = async () => {
      try {
        const response = await fetch('/api/tribunales')
        const result = await response.json()
        if (result.ok) {
          setTribunales(result.data)
        }
      } catch (error) {
        console.error('Error fetching tribunales:', error)
      } finally {
        setLoadingTribunales(false)
      }
    }

    fetchTribunales()
  }, [])

  // Check ROL uniqueness on blur
  const handleRolBlur = async () => {
    if (!rol || rol.length < 3) {
      onBlur?.()
      return
    }

    setCheckingRol(true)
    try {
      const response = await fetch(`/api/demandas/check-rol?rol=${encodeURIComponent(rol)}`)
      const result = await response.json()

      if (result.ok && !result.available) {
        // ROL already exists
        setValue('rol', rol, {
          shouldValidate: true,
          shouldTouch: true,
        })
        await trigger('rol')
      }
    } catch (error) {
      console.error('Error checking ROL:', error)
    } finally {
      setCheckingRol(false)
      onBlur?.()
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          2. Gestión Judicial
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Información del caso judicial
        </p>
      </div>

      <div className="space-y-4">
        {/* ROL */}
        <div>
          <label
            htmlFor="rol"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            ROL <span className="text-red-500">*</span>
            {checkingRol && (
              <span className="ml-2 text-xs text-gray-500">Verificando...</span>
            )}
          </label>
          <input
            id="rol"
            type="text"
            {...register('rol', {
              required: 'El ROL es requerido',
              minLength: {
                value: 3,
                message: 'El ROL debe tener al menos 3 caracteres',
              },
              maxLength: {
                value: 50,
                message: 'El ROL no puede exceder 50 caracteres',
              },
              validate: async (value) => {
                if (!value || value.length < 3) return true

                try {
                  const response = await fetch(
                    `/api/demandas/check-rol?rol=${encodeURIComponent(value)}`
                  )
                  const result = await response.json()

                  if (result.ok && !result.available) {
                    return result.message || 'El ROL ya existe'
                  }
                  return true
                } catch (error) {
                  console.error('Error validating ROL:', error)
                  return true // Don't block on network errors
                }
              },
            })}
            onBlur={handleRolBlur}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.rol
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-blue-500'
            }`}
            placeholder="C-1234-2024"
          />
          {errors.rol && (
            <p className="mt-1 text-sm text-red-600">
              {errors.rol.message as string}
            </p>
          )}
        </div>

        {/* Tribunal */}
        <div>
          <label
            htmlFor="tribunalId"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Tribunal <span className="text-red-500">*</span>
          </label>
          <select
            id="tribunalId"
            {...register('tribunalId', {
              required: 'El tribunal es requerido',
              valueAsNumber: true,
            })}
            onBlur={onBlur}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.tribunalId
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-blue-500'
            }`}
            disabled={loadingTribunales}
          >
            <option value="">Selecciona un tribunal</option>
            {tribunales.map((tribunal) => (
              <option key={tribunal.id} value={tribunal.id}>
                {tribunal.nombre}
              </option>
            ))}
          </select>
          {errors.tribunalId && (
            <p className="mt-1 text-sm text-red-600">
              {errors.tribunalId.message as string}
            </p>
          )}
        </div>

        {/* Carátula */}
        <div>
          <label
            htmlFor="caratula"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Carátula <span className="text-red-500">*</span>
          </label>
          <input
            id="caratula"
            type="text"
            {...register('caratula', {
              required: 'La carátula es requerida',
            })}
            onBlur={onBlur}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.caratula
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-blue-500'
            }`}
            placeholder="Ejecutivo contra Juan Pérez"
          />
          {errors.caratula && (
            <p className="mt-1 text-sm text-red-600">
              {errors.caratula.message as string}
            </p>
          )}
        </div>

        {/* Cuantía */}
        <div>
          <label
            htmlFor="cuantia"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Cuantía (CLP) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-gray-500">$</span>
            <input
              id="cuantia"
              type="number"
              step="0.01"
              min="0"
              {...register('cuantia', {
                required: 'La cuantía es requerida',
                valueAsNumber: true,
                min: {
                  value: 0,
                  message: 'La cuantía debe ser mayor o igual a 0',
                },
              })}
              onBlur={onBlur}
              className={`w-full pl-8 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.cuantia
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-blue-500'
              }`}
              placeholder="1000000"
            />
          </div>
          {errors.cuantia && (
            <p className="mt-1 text-sm text-red-600">
              {errors.cuantia.message as string}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}


