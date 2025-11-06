// SearchableSelect component
// Reusable select dropdown with search/filter functionality
'use client'

import { useState, useRef, useEffect } from 'react'

interface Option {
  value: number | string | null
  label: string
}

interface SearchableSelectProps {
  options: Option[]
  value: number | string | null | undefined
  onChange: (value: number | string | null) => void
  placeholder?: string
  label?: string
  required?: boolean
  error?: string
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Buscar...',
  label,
  required = false,
  error,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter options based on search term
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Get selected option label
  const selectedOption = options.find((opt) => opt.value === value)
  const displayValue = selectedOption ? selectedOption.label : ''

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        setSearchTerm('')
        setHighlightedIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
      } else if (e.key === 'Enter' && highlightedIndex >= 0) {
        e.preventDefault()
        handleSelect(filteredOptions[highlightedIndex].value)
      } else if (e.key === 'Escape') {
        setIsOpen(false)
        setSearchTerm('')
        setHighlightedIndex(-1)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredOptions, highlightedIndex])

  const handleSelect = (optionValue: number | string | null) => {
    onChange(optionValue)
    setIsOpen(false)
    setSearchTerm('')
    setHighlightedIndex(-1)
  }

  const handleInputFocus = () => {
    setIsOpen(true)
    inputRef.current?.select()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
    setIsOpen(true)
    setHighlightedIndex(-1)
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchTerm : displayValue || ''}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          className={`w-full px-3 py-2 border ${
            error ? 'border-red-300' : 'border-gray-300'
          } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
          {/* Empty option to clear selection */}
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className={`w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors ${
              value === null || value === undefined
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700'
            }`}
          >
            Sin seleccionar
          </button>

          {/* Filtered options */}
          {filteredOptions.length === 0 ? (
            <div className="px-4 py-2 text-gray-500 text-sm">
              No se encontraron resultados
            </div>
          ) : (
            filteredOptions.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors ${
                  value === option.value
                    ? 'bg-blue-50 text-blue-700'
                    : highlightedIndex === index
                    ? 'bg-gray-50 text-gray-900'
                    : 'text-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

