'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

let viewportLockCount = 0
let previousDocumentOverflow = ''

function lockViewportScroll() {
  if (viewportLockCount === 0) {
    previousDocumentOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
  }
  viewportLockCount += 1
}

function unlockViewportScroll() {
  viewportLockCount = Math.max(0, viewportLockCount - 1)
  if (viewportLockCount === 0) {
    document.documentElement.style.overflow = previousDocumentOverflow
  }
}

export function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted) return
    lockViewportScroll()
    return unlockViewportScroll
  }, [mounted])

  if (!mounted) return null
  return createPortal(
    <div
      data-modal-portal="viewport"
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        zIndex: 2147483647,
        isolation: 'isolate',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
