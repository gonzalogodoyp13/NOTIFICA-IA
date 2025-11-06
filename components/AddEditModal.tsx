// AddEditModal component
// Reusable modal for creating/editing records with react-hook-form + zod validation
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import SearchableSelect from './SearchableSelect'

interface SelectOption {
  value: number | string | null
  label: string
}

interface AddEditModalProps<T extends z.ZodType> {
  isOpen: boolean
  onClose: () => void
  title: string
  schema: T
  defaultValues?: Partial<z.infer<T>>
  onSubmit: (data: z.infer<T>) => Promise<void> | void
  submitLabel?: string
  isLoading?: boolean
  selectOptions?: Record<string, SelectOption[]>
}

export default function AddEditModal<T extends z.ZodType>({
  isOpen,
  onClose,
  title,
  schema,
  defaultValues,
  onSubmit,
  submitLabel = 'Guardar',
  isLoading = false,
  selectOptions,
}: AddEditModalProps<T>) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<z.infer<T>>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as z.infer<T>,
  })

  // Reset form when modal opens/closes or defaultValues change
  useEffect(() => {
    if (isOpen) {
      reset(defaultValues as z.infer<T>)
    } else {
      reset()
    }
  }, [isOpen, defaultValues, reset])

  if (!isOpen) return null

  const handleFormSubmit = async (data: z.infer<T>) => {
    try {
      await onSubmit(data)
      onClose()
    } catch (error) {
      // Error handling is done in the onSubmit function
      console.error('Error submitting form:', error)
    }
  }

  // Get schema shape to render fields dynamically
  const schemaShape =
    schema instanceof z.ZodObject ? schema.shape : undefined

  if (!schemaShape) {
    return null
  }

  const fields = Object.keys(schemaShape)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            {fields.map((fieldName) => {
              const fieldSchema = schemaShape[fieldName]
              
              // Check if field is optional
              const isOptional =
                fieldSchema instanceof z.ZodOptional ||
                fieldSchema instanceof z.ZodDefault ||
                (fieldSchema instanceof z.ZodNullable && 
                 (fieldSchema._def.innerType instanceof z.ZodOptional ||
                  fieldSchema._def.innerType instanceof z.ZodDefault))
              
              // Get inner type for optional/nullable fields
              const innerType = 
                fieldSchema instanceof z.ZodOptional
                  ? fieldSchema._def.innerType
                  : fieldSchema instanceof z.ZodNullable
                  ? fieldSchema._def.innerType
                  : fieldSchema instanceof z.ZodDefault
                  ? fieldSchema._def.innerType
                  : fieldSchema

              // Determine if it's a textarea (for description fields)
              const isTextarea = fieldName.toLowerCase().includes('descripcion')
              
              // Determine input type
              const isNumber = innerType instanceof z.ZodNumber
              const isString = innerType instanceof z.ZodString

              // Check if this field has select options
              const hasSelectOptions = selectOptions && selectOptions[fieldName]
              const fieldValue = watch(fieldName as keyof z.infer<T>)

              return (
                <div key={fieldName}>
                  {hasSelectOptions ? (
                    <SearchableSelect
                      options={selectOptions[fieldName]}
                      value={
                        fieldValue !== undefined && fieldValue !== null
                          ? (fieldValue as number | string)
                          : null
                      }
                      onChange={(value) => {
                        setValue(fieldName as any, value as any, {
                          shouldValidate: true,
                        })
                      }}
                      placeholder={`Buscar ${fieldName}...`}
                      label={fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}
                      required={!isOptional}
                      error={
                        errors[fieldName as keyof typeof errors]
                          ? String(errors[fieldName as keyof typeof errors]?.message)
                          : undefined
                      }
                    />
                  ) : (
                    <>
                      <label
                        htmlFor={fieldName}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        {fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}
                        {!isOptional && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </label>
                      {isTextarea && isString ? (
                        <textarea
                          {...register(fieldName as any)}
                          id={fieldName}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      ) : (
                        <input
                          {...register(fieldName as any)}
                          id={fieldName}
                          type={isNumber ? 'number' : 'text'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      )}
                      {errors[fieldName as keyof typeof errors] && (
                        <p className="mt-1 text-sm text-red-600">
                          {String(errors[fieldName as keyof typeof errors]?.message)}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )
            })}

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Guardando...' : submitLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

