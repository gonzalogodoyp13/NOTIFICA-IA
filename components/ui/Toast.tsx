// Toast component for notifications
'use client'

import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info'

interface ToastProps {
  message: string
  type: ToastType
  duration?: number
  onClose: () => void
}

export default function Toast({
  message,
  type,
  duration = 5000,
  onClose,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 300) // Wait for fade out animation
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const bgColor =
    type === 'success'
      ? 'bg-green-50 border-green-200 text-green-800'
      : type === 'error'
      ? 'bg-red-50 border-red-200 text-red-800'
      : 'bg-blue-50 border-blue-200 text-blue-800'

  const icon =
    type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️'

  return (
    <div
      className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
      } ${bgColor}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="font-medium">{message}</span>
      </div>
    </div>
  )
}

// Toast container component
interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: ToastType }>
  onRemove: (id: string) => void
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </>
  )
}


