'use client'

import { useState } from 'react'
import { cortesDeApelaciones, tribunalesDeCorte, tribunalesPorCorte } from '@/lib/encargos/tribunales'

const todosLosTribunales = [...new Set(Object.values(tribunalesPorCorte).flat())]

export default function JurisdiccionFields({ corteInicial, tribunalInicial, controlClassName }: {
  corteInicial: string; tribunalInicial: string; controlClassName: string
}) {
  const [corte, setCorte] = useState(corteInicial)
  const [tribunal, setTribunal] = useState(tribunalInicial)
  const tribunales = corte ? tribunalesDeCorte(corte) : todosLosTribunales

  return (
    <>
      <label className="min-w-0">
        <span className="sr-only">Corte de Apelaciones</span>
        <select name="corte" value={corte} className={controlClassName} onChange={event => {
          const siguiente = event.target.value
          setCorte(siguiente)
          if (siguiente && !tribunalesDeCorte(siguiente).includes(tribunal)) setTribunal('')
        }}>
          <option value="">Todas las cortes</option>
          {cortesDeApelaciones.map(item => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="min-w-0">
        <span className="sr-only">Tribunal de tu causa</span>
        <select name="tribunal" value={tribunal} className={controlClassName} onChange={event => setTribunal(event.target.value)}>
          <option value="">Todos los tribunales</option>
          {tribunales.map(item => <option key={item}>{item}</option>)}
        </select>
      </label>
    </>
  )
}
