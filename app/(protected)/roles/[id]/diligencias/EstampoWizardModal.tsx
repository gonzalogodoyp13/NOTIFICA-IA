'use client'

import { useEffect, useMemo, useState } from 'react'

import type { VariableDef, WizardQuestion } from '@/lib/estampos/types'

interface EstampoWizardModalProps {
  rolId: string
  diligenciaId: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  categoria?: string // Opcional, default "BUSQUEDA_NEGATIVA" para compatibilidad
}

interface EstampoItem {
  id: number
  slug: string
  nombreVisible: string
  categoria: string
  descripcion: string | null
  textoTemplate: string
  variablesSchema: VariableDef[]
  wizardSchema: WizardQuestion[]
  hasCustomTemplate: boolean
}

interface WizardResponse {
  estampos: EstampoItem[]
  initialVariables: Record<string, string>
}

export default function EstampoWizardModal({
  rolId,
  diligenciaId,
  isOpen,
  onClose,
  onSuccess,
  categoria = 'BUSQUEDA_NEGATIVA', // Default para compatibilidad
}: EstampoWizardModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [estampos, setEstampos] = useState<EstampoItem[]>([])
  const [initialVariables, setInitialVariables] = useState<Record<string, string>>({})
  const [selectedEstampoId, setSelectedEstampoId] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showTextEditor, setShowTextEditor] = useState(false)
  const [textoEditado, setTextoEditado] = useState<string | null>(null)
  const [previewingText, setPreviewingText] = useState(false)

  // Load wizard data when modal opens
  useEffect(() => {
    if (!isOpen || !diligenciaId) return

    let active = true

    const fetchWizardData = async () => {
      setLoading(true)
      setError(null)

      try {
        const url = new URL(`/api/diligencias/${diligenciaId}/estampos/wizard`, window.location.origin)
        url.searchParams.set('categoria', categoria)
        const response = await fetch(url.toString(), {
          credentials: 'include',
          cache: 'no-store',
        })

        const payload = await response.json().catch(() => null)

        if (!response.ok || payload?.ok !== true) {
          throw new Error(payload?.error || 'Error al cargar estampos para el wizard')
        }

        const data = payload.data as WizardResponse

        if (active) {
          setEstampos(data.estampos)
          setInitialVariables(data.initialVariables)

          // Initialize answers with USUARIO required variables
          const initialAnswers: Record<string, string> = {}
          if (data.estampos.length > 0) {
            const firstEstampo = data.estampos[0]
            const wizardVars = new Set(firstEstampo.wizardSchema.map(q => q.variable))

            firstEstampo.variablesSchema.forEach(variable => {
              if (
                variable.source === 'USUARIO' &&
                variable.required &&
                !wizardVars.has(variable.name)
              ) {
                initialAnswers[variable.name] = data.initialVariables[variable.name] || ''
              }
            })

            // Pre-select first estampo
            setSelectedEstampoId(firstEstampo.id)
          }

          setAnswers(initialAnswers)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Error desconocido')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    fetchWizardData()

    return () => {
      active = false
    }
  }, [isOpen, diligenciaId, categoria])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setError(null)
      setEstampos([])
      setInitialVariables({})
      setSelectedEstampoId(null)
      setAnswers({})
      setSubmitting(false)
      setSubmitError(null)
      setShowTextEditor(false)
      setTextoEditado(null)
      setPreviewingText(false)
    }
  }, [isOpen])

  // Get selected estampo
  const selectedEstampo = useMemo(
    () => estampos.find(e => e.id === selectedEstampoId),
    [estampos, selectedEstampoId]
  )

  // Get wizard questions sorted by order
  const wizardQuestions = useMemo(() => {
    if (!selectedEstampo) return []
    return [...selectedEstampo.wizardSchema].sort((a, b) => a.order - b.order)
  }, [selectedEstampo])

  // Get extra user fields (not in wizardSchema)
  const extraUserFields = useMemo(() => {
    if (!selectedEstampo) return []
    const wizardVars = new Set(selectedEstampo.wizardSchema.map(q => q.variable))
    return selectedEstampo.variablesSchema.filter(
      v => v.source === 'USUARIO' && v.required && !wizardVars.has(v.name)
    )
  }, [selectedEstampo])

  // Handle answer change
  const handleAnswerChange = (variable: string, value: string) => {
    // MVP: Clear silently (no warning) to avoid blocking user flow
    setAnswers(prev => ({ ...prev, [variable]: value }))
    setTextoEditado(null)  // NEW: Clear edits when answers change (avoid mismatch)
    setSubmitError(null)
  }

  // Handle open text editor
  const handleOpenTextEditor = async () => {
    if (!selectedEstampoId) return

    // If textoEditado already exists (non-empty), just open editor with existing text
    if (textoEditado && textoEditado.trim() !== '') {
      setShowTextEditor(true)
      return
    }

    // Only fetch preview if textoEditado is null/empty (first open)
    setPreviewingText(true)
    try {
      const response = await fetch(`/api/diligencias/${diligenciaId}/estampos/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estampoBaseId: selectedEstampoId,
          wizardAnswers: answers,
        }),
        credentials: 'include',
      })

      const result = await response.json()
      if (result?.ok && result?.data?.renderedText) {
        setTextoEditado(result.data.renderedText)
        setShowTextEditor(true)
      } else {
        setSubmitError('Error al cargar vista previa')
      }
    } catch (err) {
      setSubmitError('Error al cargar vista previa')
    } finally {
      setPreviewingText(false)
    }
  }

  // Handle submit
  const handleSubmit = async () => {
    if (!selectedEstampoId) {
      setSubmitError('Selecciona un estampo para continuar.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const response = await fetch(`/api/diligencias/${diligenciaId}/estampos/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estampoBaseId: selectedEstampoId,
          wizardAnswers: answers,
          textoEditado: textoEditado || undefined, // NEW
        }),
        credentials: 'include',
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || result?.ok !== true) {
        const errorMsg = result?.error || 'Error al generar estampo'
        const missing = result?.missing as string[] | undefined
        throw new Error(
          missing && missing.length > 0
            ? `${errorMsg}: ${missing.join(', ')}`
            : errorMsg
        )
      }

      // Success
      onSuccess?.()
      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Generar estampo (nuevo engine)</h2>
            <p className="text-xs text-slate-500 mt-1">Wizard guiado para generar estampos</p>
          </div>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-700"
            onClick={onClose}
            disabled={submitting}
          >
            Cerrar
          </button>
        </header>

        {loading && (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-500">Cargando estampos...</p>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <p>{error}</p>
            <button
              type="button"
              className="mt-2 rounded bg-rose-600 px-3 py-1 text-xs text-white hover:bg-rose-500"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        )}

        {!loading && !error && estampos.length > 0 && (
          <div className="space-y-6 text-sm">
            {/* Section 1: Estampo selector */}
            <div>
              <label className="block font-medium text-slate-700 mb-2">
                Seleccionar tipo de estampo *
              </label>
              <div className="space-y-2">
                {estampos.map(estampo => (
                  <label
                    key={estampo.id}
                    className="flex items-start gap-3 p-3 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="estampo"
                      value={estampo.id}
                      checked={selectedEstampoId === estampo.id}
                      onChange={() => {
                        setSelectedEstampoId(estampo.id)
                        setTextoEditado(null)  // NEW: Clear edits when switching estampo
                        // Reset answers when changing estampo
                        const newAnswers: Record<string, string> = {}
                        const wizardVars = new Set(estampo.wizardSchema.map(q => q.variable))
                        estampo.variablesSchema.forEach(variable => {
                          if (
                            variable.source === 'USUARIO' &&
                            variable.required &&
                            !wizardVars.has(variable.name)
                          ) {
                            newAnswers[variable.name] = initialVariables[variable.name] || ''
                          }
                        })
                        setAnswers(newAnswers)
                        setSubmitError(null)
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-slate-800">{estampo.nombreVisible}</div>
                      {estampo.descripcion && (
                        <div className="text-xs text-slate-500 mt-1">{estampo.descripcion}</div>
                      )}
                      {estampo.hasCustomTemplate && (
                        <span className="inline-block mt-1 text-xs text-blue-600">
                          (Template personalizado)
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Section 2: Wizard questions */}
            {selectedEstampo && wizardQuestions.length > 0 && (
              <div>
                <label className="block font-medium text-slate-700 mb-2">
                  Preguntas del wizard
                </label>
                <div className="space-y-4">
                  {wizardQuestions.map(question => {
                    const value = answers[question.variable] || ''

                    if (question.inputType === 'RADIO' && question.options) {
                      return (
                        <div key={question.variable}>
                          <label className="block text-slate-700 mb-2">{question.text}</label>
                          <div className="space-y-2">
                            {question.options.map(option => (
                              <label
                                key={option.value}
                                className="flex items-center gap-2 p-2 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer"
                              >
                                <input
                                  type="radio"
                                  name={question.variable}
                                  value={option.value}
                                  checked={value === option.value}
                                  onChange={e => handleAnswerChange(question.variable, e.target.value)}
                                  className=""
                                />
                                <span className="text-sm">{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    }

                    if (question.inputType === 'TEXT') {
                      return (
                        <div key={question.variable}>
                          <label className="block text-slate-700 mb-1" htmlFor={question.variable}>
                            {question.text}
                          </label>
                          <input
                            id={question.variable}
                            type="text"
                            className="w-full rounded border border-slate-300 p-2"
                            value={value}
                            onChange={e => handleAnswerChange(question.variable, e.target.value)}
                          />
                        </div>
                      )
                    }

                    if (question.inputType === 'NUMBER') {
                      return (
                        <div key={question.variable}>
                          <label className="block text-slate-700 mb-1" htmlFor={question.variable}>
                            {question.text}
                          </label>
                          <input
                            id={question.variable}
                            type="number"
                            className="w-full rounded border border-slate-300 p-2"
                            value={value}
                            onChange={e => handleAnswerChange(question.variable, e.target.value)}
                          />
                        </div>
                      )
                    }

                    return null
                  })}
                </div>
              </div>
            )}

            {/* Section 3: Extra user fields */}
            {selectedEstampo && extraUserFields.length > 0 && (
              <div>
                <label className="block font-medium text-slate-700 mb-2">
                  Campos adicionales
                </label>
                <div className="space-y-4">
                  {extraUserFields.map(variable => (
                    <div key={variable.name}>
                      <label className="block text-slate-700 mb-1" htmlFor={variable.name}>
                        {variable.label || variable.name} *
                      </label>
                      <input
                        id={variable.name}
                        type="text"
                        className="w-full rounded border border-slate-300 p-2"
                        value={answers[variable.name] || ''}
                        onChange={e => handleAnswerChange(variable.name, e.target.value)}
                        placeholder={variable.description || ''}
                      />
                      {variable.description && (
                        <p className="mt-1 text-xs text-slate-500">{variable.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {submitError && (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {submitError}
          </div>
        )}

        <footer className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-purple-300"
            onClick={handleOpenTextEditor}
            disabled={!selectedEstampoId || submitting || previewingText}
          >
            {previewingText ? 'Cargando...' : 'Editar texto...'}
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
            onClick={handleSubmit}
            disabled={submitting || !selectedEstampoId}
          >
            {submitting ? 'Generando...' : 'Generar Estampo'}
          </button>
        </footer>
      </div>

      {/* Text Editor Modal */}
      {showTextEditor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-3xl rounded-lg bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Editar texto del estampo</h3>
            <p className="text-xs text-slate-500 mb-3">
              Puedes editar el texto libremente. Los cambios solo aplicarán a esta diligencia.
            </p>
            <textarea
              className="w-full h-96 border rounded p-3 font-mono text-sm"
              value={textoEditado || ''}
              onChange={e => setTextoEditado(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowTextEditor(false)
                  // Do NOT clear textoEditado on cancel - preserve user edits
                }}
                className="rounded bg-slate-200 px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              {textoEditado && (
                <button
                  type="button"
                  onClick={() => {
                    setTextoEditado(null)
                    setShowTextEditor(false)
                  }}
                  className="rounded bg-amber-600 px-4 py-2 text-sm text-white"
                >
                  Restablecer
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowTextEditor(false)}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

