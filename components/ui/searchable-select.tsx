'use client'

import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

type Option = { value: string; label: string; disabled?: boolean; group?: string }
type Props = {
  id?: string
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
  className?: string
  disabled?: boolean
  required?: boolean
  'aria-label'?: string
}

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
function textOf(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : String(child)).join('')
}
function readOptions(children: ReactNode, group?: string): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean; label?: string }>(child)) return []
    if (child.type === 'option') return [{ value: String(child.props.value ?? ''), label: textOf(child.props.children), disabled: child.props.disabled, group }]
    return readOptions(child.props.children, child.props.label ?? group)
  })
}

export function SearchableSelect({ id, value, onValueChange, children, className, disabled, required, 'aria-label': ariaLabel }: Props) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listId = `${inputId}-options`
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const options = readOptions(children)
  const selected = options.find(option => option.value === value)
  const filtered = options.filter(option => normalize(option.label).includes(normalize(query)))
  const expanded = open && !disabled

  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !value ? 'Selecciona una opción de la lista.' : '')
  }, [required, value])

  const close = () => { setOpen(false); setQuery(''); setActive(-1) }
  const choose = (option: Option) => {
    if (option.disabled) return
    onValueChange(option.value)
    close()
  }

  return (
    <div className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close() }}>
      <div className="relative">
        <input
          ref={inputRef} id={inputId} role="combobox" autoComplete="off"
          aria-label={ariaLabel} aria-expanded={expanded} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 && filtered[active] ? `${listId}-${active}` : undefined}
          required={required} disabled={disabled}
          className={`${className ?? 'w-full rounded-lg border border-gray-300 px-3 py-2'} pr-9`}
          value={expanded ? query : value ? selected?.label ?? '' : ''}
          placeholder={expanded ? 'Escribe para filtrar…' : options.find(option => option.value === '')?.label}
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true) }}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); close() }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setOpen(true)
              const direction = event.key === 'ArrowDown' ? 1 : -1
              let next = active < 0 ? (direction === 1 ? 0 : filtered.length - 1) : active + direction
              while (next >= 0 && next < filtered.length && filtered[next].disabled) next += direction
              if (next >= 0 && next < filtered.length) {
                setActive(next)
                requestAnimationFrame(() => document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' }))
              }
            }
            if (event.key === 'Enter' && expanded) {
              event.preventDefault()
              const option = filtered[active] ?? filtered.find(item => !item.disabled && item.value !== '')
              if (option) choose(option)
            }
          }}
        />
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </div>
      {expanded && (
        <div id={listId} role="listbox" aria-label={ariaLabel ?? 'Opciones'} className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 && <div className="px-3 py-3 text-sm text-slate-500" role="status">Sin resultados</div>}
          {filtered.map((option, index) => (
            <div key={option.value}>
              {option.group && option.group !== filtered[index - 1]?.group && <div className="px-3 py-2 text-xs font-semibold text-slate-500">{option.group}</div>}
              <div id={`${listId}-${index}`} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
                className={`px-3 py-2 text-sm ${option.disabled ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-800 hover:bg-sky-50'} ${active === index || option.value === value ? 'bg-sky-50' : ''}`}
                onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
                {option.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
