// RUTInput component
// Formats and validates Chilean RUT (e.g., 12.345.678-9)
'use client'

import { forwardRef, useCallback } from 'react'
import { UseFormRegisterReturn } from 'react-hook-form'

interface RUTInputProps {
  value?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  error?: string
  register?: UseFormRegisterReturn
  disabled?: boolean
  name?: string
}

// Format RUT: 12345678-9 -> 12.345.678-9
const formatRUT = (value: string): string => {
  // Remove all non-digit characters except 'k' and 'K'
  const cleaned = value.replace(/[^\dkK]/gi, '')
  
  if (!cleaned) return ''
  
  // Extract digits and verification digit
  const match = cleaned.match(/^(\d{1,8})([0-9kK])?$/)
  if (!match) return cleaned
  
  const digits = match[1]
  const verifier = match[2] || ''
  
  // Format with dots
  let formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  
  // Add verification digit with dash
  if (verifier) {
    formatted += `-${verifier.toUpperCase()}`
  }
  
  return formatted
}

// Validate RUT format (basic format check)
export const validateRUTFormat = (rut: string): boolean => {
  if (!rut) return false
  
  // Remove dots and dash for validation
  const cleaned = rut.replace(/[.\-]/g, '')
  
  // Should be 8-9 characters (digits + optional k/K)
  if (cleaned.length < 8 || cleaned.length > 9) return false
  
  // Should match pattern: digits + optional k/K
  return /^\d{7,8}[0-9kK]$/i.test(cleaned)
}

const RUTInput = forwardRef<HTMLInputElement, RUTInputProps>(
  ({ value, onChange, onBlur, error, register, disabled, name }, ref) => {
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatRUT(e.target.value)
        
        // Update the input value directly for immediate visual feedback
        e.target.value = formatted
        
        if (register?.onChange) {
          // Create a synthetic event with formatted value for react-hook-form
          const syntheticEvent = {
            ...e,
            target: { ...e.target, value: formatted },
            currentTarget: { ...e.currentTarget, value: formatted },
          }
          register.onChange(syntheticEvent as any)
        } else if (onChange) {
          onChange(formatted)
        }
      },
      [onChange, register]
    )

    const handleBlur = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        if (register?.onBlur) {
          register.onBlur(e)
        }
        if (onBlur) {
          onBlur()
        }
      },
      [onBlur, register]
    )

    // If register is provided, use it with custom handlers
    if (register) {
      return (
        <div>
          <input
            ref={(e) => {
              register.ref(e)
              if (typeof ref === 'function') {
                ref(e)
              } else if (ref) {
                (ref as any).current = e
              }
            }}
            type="text"
            name={register.name}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder="12.345.678-9"
            maxLength={12}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              error
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-blue-500'
            } disabled:bg-gray-100 disabled:cursor-not-allowed`}
          />
          {error && (
            <p className="mt-1 text-sm text-red-600">{error}</p>
          )}
        </div>
      )
    }

    // Otherwise use controlled mode
    return (
      <div>
        <input
          ref={ref}
          type="text"
          name={name}
          value={value || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder="12.345.678-9"
          maxLength={12}
          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-blue-500'
          } disabled:bg-gray-100 disabled:cursor-not-allowed`}
        />
        {error && (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        )}
      </div>
    )
  }
)

RUTInput.displayName = 'RUTInput'

export default RUTInput

