'use client'
import { useEffect, useState } from 'react'
import { reportBrowserError } from '@/lib/diagnostics/browser'
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reference, setReference] = useState<string | null>(null)
  useEffect(() => { void reportBrowserError(error).then(setReference) }, [error])
  return <html lang="es"><body><h1>No se pudo completar la operación</h1><p>Intenta nuevamente.</p>{reference && <p>Referencia de soporte: {reference}</p>}<button onClick={reset}>Reintentar</button></body></html>
}
