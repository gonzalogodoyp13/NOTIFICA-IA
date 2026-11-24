import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

export const controlClassName = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-500'

function Label({ id, label, required }: { id: string; label: string; required?: boolean }) {
  return <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-800">{label}{required && <span aria-hidden="true" className="ml-0.5 text-rose-700">*</span>}</label>
}

export function InputField({ label, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string }) {
  return (
    <div className="min-w-0">
      <Label id={id} label={label} required={props.required} />
      <input {...props} id={id} className={controlClassName} />
    </div>
  )
}

export function SelectField({ label, id, placeholder, options, ...props }: SelectHTMLAttributes<HTMLSelectElement> & {
  id: string; label: string; placeholder: string; options: readonly string[]
}) {
  return (
    <div className="min-w-0">
      <Label id={id} label={label} required={props.required} />
      <select {...props} id={id} className={`${controlClassName} pr-8`}>
        <option value="" disabled>{placeholder}</option>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  )
}

export function Choices({ legend, name, value, options, onChange }: {
  legend: string; name: string; value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold text-slate-800">{legend}<span aria-hidden="true" className="ml-0.5 text-rose-700">*</span></legend>
      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
        {options.map(option => (
          <label key={option.value} className="cursor-pointer">
            <input type="radio" name={name} value={option.value} checked={value === option.value} required
              onChange={() => onChange(option.value)} className="peer sr-only" />
            <span className="inline-flex min-h-9 items-center rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-blue-50 peer-checked:bg-blue-800 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-focus-visible:ring-offset-2">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function Panel({ title, optional, children }: { title: string; optional?: boolean; children: ReactNode }) {
  if (optional) {
    return (
      <details open className="app-panel group overflow-hidden">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 px-4 py-4 focus-visible:outline-blue-600 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="font-bold text-slate-950">{title}</span>
          <span className="text-sm text-slate-600">Opcional</span>
          <ChevronDown className="ml-auto size-4 text-slate-600 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="p-4 sm:p-6">{children}</div>
      </details>
    )
  }

  return (
    <section className="app-panel overflow-hidden">
      <h2 className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-4 text-lg font-bold text-slate-950 sm:px-6">
        <span className="h-5 w-1 rounded-full bg-blue-700" aria-hidden="true" />{title}
      </h2>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  )
}
