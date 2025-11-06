// Toaster component wrapper
// Client component for react-hot-toast
'use client'

import { Toaster as HotToaster } from 'react-hot-toast'

export default function Toaster() {
  return <HotToaster position="top-right" />
}

