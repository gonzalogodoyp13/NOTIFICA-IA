'use client'
import { useEffect, useState } from 'react'
import { reportBrowserError } from '@/lib/diagnostics/browser'
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  const [reference, setReference] = useState<string | null>(null)
  useEffect(() => { void reportBrowserError(error).then(setReference) }, [error])
  return <section className="ops-panel" role="alert"><h2>No se pudo consultar el Centro de Operaciones</h2><p>No se muestra un estado saludable porque faltan datos.</p>{reference && <p>Referencia: {reference}</p>}<button onClick={reset}>Reintentar</button></section>
}
