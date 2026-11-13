"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onClick, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-2xl border border-slate-200 bg-white/95 px-4 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 focus-visible:border-blue-600 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
        onClick={event => {
          onClick?.(event)
          if (event.defaultPrevented || event.currentTarget.disabled || event.currentTarget.readOnly) return
          if (type === "date" || type === "datetime-local" || type === "month" || type === "week") {
            try {
              event.currentTarget.showPicker?.()
            } catch {
              // Keep manual entry available when the browser cannot open its picker.
            }
          }
        }}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

