// Nueva Demanda page
// Multi-step form to create a new Demanda with autosave
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'
import DemandFormStepper from '@/components/demandas/DemandFormStepper'
import EjecutadoForm from '@/components/demandas/EjecutadoForm'
import GestionForm from '@/components/demandas/GestionForm'
import AbogadoForm from '@/components/demandas/AbogadoForm'
import AutoSaveBadge from '@/components/demandas/AutoSaveBadge'
import { ToastContainer } from '@/components/ui/Toast'
import { EjecutadoSchema, DemandaSchema } from '@/lib/zodSchemas'

// Form schema combining all sections
const NuevaDemandaFormSchema = z.object({
  // Ejecutado section
  nombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  rut: z.string().min(1, 'El RUT es requerido'),
  direccion: z.string().optional(),
  comunaId: z.union([z.number().int().positive(), z.literal('')]).optional().transform((val) => val === '' ? undefined : val),
  rvm: z.any().optional(),
  // Gestión Judicial section
  rol: z.string().min(3, 'El ROL debe tener al menos 3 caracteres').max(50, 'El ROL no puede exceder 50 caracteres'),
  tribunalId: z.number().int().positive('El tribunal es requerido'),
  caratula: z.string().min(1, 'La carátula es requerida'),
  cuantia: z.number().min(0, 'La cuantía debe ser mayor o igual a 0'),
  // Abogado section
  abogadoId: z.number().int().positive('El abogado es requerido'),
})

type NuevaDemandaFormData = z.infer<typeof NuevaDemandaFormSchema>

const STORAGE_KEY = 'demanda-draft'
const STEPS = [
  { id: 1, label: 'Ejecutado', completed: false },
  { id: 2, label: 'Gestión Judicial', completed: false },
  { id: 3, label: 'Abogado', completed: false },
]

export default function NuevaDemandaPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([])

  const {
    register,
    watch,
    handleSubmit,
    formState: { errors },
    setValue,
    trigger,
    reset,
  } = useForm<NuevaDemandaFormData>({
    resolver: zodResolver(NuevaDemandaFormSchema),
    mode: 'onBlur',
    defaultValues: {
      nombre: '',
      rut: '',
      direccion: '',
      comunaId: undefined,
      rvm: undefined,
      rol: '',
      tribunalId: undefined,
      caratula: '',
      cuantia: 0,
      abogadoId: undefined,
    },
  })

  const formValues = watch()

  // Load draft from localStorage on mount (only if not saved)
  useEffect(() => {
    if (isSaved) return
    
    try {
      const draft = localStorage.getItem(STORAGE_KEY)
      if (draft) {
        const parsed = JSON.parse(draft)
        // Restore form values
        Object.keys(parsed).forEach((key) => {
          if (parsed[key] !== undefined && parsed[key] !== null && key !== '_lastSaved') {
            setValue(key as keyof NuevaDemandaFormData, parsed[key], {
              shouldValidate: false,
            })
          }
        })
        setLastSaved(new Date(parsed._lastSaved || Date.now()))
      }
    } catch (error) {
      console.error('Error loading draft:', error)
    }
  }, [setValue, isSaved])

  // Autosave function
  const autosave = useCallback(async () => {
    try {
      setIsSaving(true)
      const dataToSave = { ...formValues, _lastSaved: new Date().toISOString() }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))
      setLastSaved(new Date())
    } catch (error) {
      console.error('Error autosaving:', error)
    } finally {
      setIsSaving(false)
    }
  }, [formValues])

  // Autosave on form changes (debounced) - skip if saved
  useEffect(() => {
    if (isSaved) return
    
    const timer = setTimeout(() => {
      if (Object.keys(formValues).length > 0) {
        autosave()
      }
    }, 1000) // Debounce 1 second

    return () => clearTimeout(timer)
  }, [formValues, autosave, isSaved])

  // Handle field blur for autosave (skip if saved)
  const handleFieldBlur = useCallback(() => {
    if (!isSaved) {
      autosave()
    }
  }, [autosave, isSaved])

  // Update step completion status
  const updateStepCompletion = useCallback(() => {
    const steps = STEPS.map((step) => {
      let completed = false
      switch (step.id) {
        case 1:
          completed = !!(
            formValues.nombre &&
            formValues.rut
          )
          break
        case 2:
          completed = !!(
            formValues.rol &&
            formValues.tribunalId &&
            formValues.caratula &&
            formValues.cuantia !== undefined
          )
          break
        case 3:
          completed = !!formValues.abogadoId
          break
      }
      return { ...step, completed }
    })
    return steps
  }, [formValues])

  const steps = updateStepCompletion()

  // Handle step navigation
  const handleStepChange = async (step: number) => {
    // Validate current step before moving
    if (step > currentStep) {
      let isValid = false
      switch (currentStep) {
        case 1:
          isValid = await trigger(['nombre', 'rut'])
          break
        case 2:
          isValid = await trigger(['rol', 'tribunalId', 'caratula', 'cuantia'])
          break
        case 3:
          isValid = await trigger(['abogadoId'])
          break
      }

      if (!isValid) {
        addToast('Por favor completa todos los campos requeridos', 'error')
        return
      }
    }

    setCurrentStep(step)
  }

  // Handle form submission
  const onSubmit = async (data: NuevaDemandaFormData) => {
    console.log('onSubmit called with data:', data)
    
    try {
      setIsSaving(true)

      // Validate all required fields are present
      if (!data.nombre || !data.rut || !data.rol || !data.tribunalId || !data.caratula || data.cuantia === undefined || !data.abogadoId) {
        addToast('Por favor completa todos los campos requeridos', 'error')
        setIsSaving(false)
        return
      }

      // Parse RVM if provided
      let rvmParsed = undefined
      if (data.rvm && typeof data.rvm === 'string' && data.rvm.trim()) {
        try {
          rvmParsed = JSON.parse(data.rvm)
        } catch {
          // If not valid JSON, ignore
        }
      }

      // Prepare ejecutado data
      const ejecutado = {
        nombre: data.nombre,
        rut: data.rut,
        direccion: data.direccion || undefined,
        comunaId: data.comunaId || undefined,
        rvm: rvmParsed,
      }

      // Prepare demanda data
      const demandaData = {
        rol: data.rol,
        tribunalId: data.tribunalId,
        caratula: data.caratula,
        cuantia: data.cuantia,
        abogadoId: data.abogadoId,
        ejecutados: [ejecutado],
      }

      console.log('Submitting demanda data:', demandaData)

      // Submit to API
      console.log('Sending POST request to /api/demandas with data:', demandaData)
      
      const response = await fetch('/api/demandas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(demandaData),
      })

      console.log('API response status:', response.status, response.statusText)

      let result
      try {
        result = await response.json()
        console.log('API response body:', result)
      } catch (parseError) {
        console.error('Error parsing API response:', parseError)
        const text = await response.text()
        console.error('Response text:', text)
        throw new Error('Error al procesar la respuesta del servidor')
      }

      if (!response.ok) {
        const errorMessage = result?.error || `Error del servidor: ${response.status} ${response.statusText}`
        console.error('API error:', errorMessage)
        throw new Error(errorMessage)
      }

      if (!result.ok) {
        const errorMessage = result?.error || (Array.isArray(result.error) ? result.error.join(', ') : 'Error al guardar la demanda')
        console.error('API returned ok:false:', errorMessage)
        throw new Error(errorMessage)
      }

      console.log('Demanda created successfully:', result.data?.id)

      // Success: clear draft, show toast, show confirmation screen
      localStorage.removeItem(STORAGE_KEY)
      addToast('Demanda guardada correctamente', 'success')
      setIsSaved(true)
      setIsSaving(false)
    } catch (error: any) {
      console.error('Error submitting form:', error)
      addToast(error.message || 'Error al guardar la demanda', 'error')
      setIsSaving(false)
    }
  }

  const addToast = (message: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substring(7)
    setToasts((prev) => [...prev, { id, message, type }])
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  // Handle "Agregar nueva Demanda" button
  const handleNuevaDemanda = () => {
    // Clear localStorage
    localStorage.removeItem(STORAGE_KEY)
    
    // Reset form
    reset({
      nombre: '',
      rut: '',
      direccion: '',
      comunaId: undefined,
      rvm: undefined,
      rol: '',
      tribunalId: undefined,
      caratula: '',
      cuantia: 0,
      abogadoId: undefined,
    })
    
    // Reset state
    setIsSaved(false)
    setCurrentStep(1)
    setLastSaved(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Topbar />
      <main className="pt-20 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-semibold text-gray-900 mb-2">
                  Agregar Demanda
                </h1>
                <p className="text-gray-600">
                  {isSaved 
                    ? 'Demanda creada exitosamente' 
                    : 'Completa el formulario para crear una nueva demanda'}
                </p>
              </div>
              {!isSaved && <AutoSaveBadge isSaving={isSaving} lastSaved={lastSaved} />}
            </div>
          </div>

          {/* Success Confirmation Screen */}
          {isSaved ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                <div className="text-6xl mb-4">✅</div>
                <div className="text-3xl font-semibold text-green-600">
                  Demanda guardada correctamente
                </div>
                <p className="text-gray-600 text-lg">
                  La demanda ha sido creada exitosamente en el sistema.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 mt-8">
                  <button
                    onClick={handleNuevaDemanda}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                  >
                    Agregar nueva Demanda
                  </button>
                  <button
                    onClick={() => router.push('/roles')}
                    className="bg-gray-200 text-gray-800 px-6 py-3 rounded-lg hover:bg-gray-300 transition-colors font-medium shadow-sm"
                  >
                    Ir a Gestionar Demandas
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Stepper */}
              <div className="mb-8">
                <DemandFormStepper
                  currentStep={currentStep}
                  onStepChange={handleStepChange}
                  steps={steps}
                />
              </div>

              {/* Form */}
              <form 
                onSubmit={handleSubmit(onSubmit, (errors) => {
                  console.log('Form validation errors:', errors)
                  addToast('Por favor completa todos los campos requeridos', 'error')
                })} 
                className="space-y-6"
                noValidate
              >
                <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
                  {/* Step 1: Ejecutado */}
                  {currentStep === 1 && (
                    <EjecutadoForm
                      register={register}
                      watch={watch}
                      errors={errors}
                      setValue={setValue}
                      onBlur={handleFieldBlur}
                    />
                  )}

                  {/* Step 2: Gestión Judicial */}
                  {currentStep === 2 && (
                    <GestionForm
                      register={register}
                      watch={watch}
                      errors={errors}
                      setValue={setValue}
                      trigger={trigger}
                      onBlur={handleFieldBlur}
                    />
                  )}

                  {/* Step 3: Abogado */}
                  {currentStep === 3 && (
                    <AbogadoForm
                      register={register}
                      watch={watch}
                      errors={errors}
                      setValue={setValue}
                      onBlur={handleFieldBlur}
                    />
                  )}
                </div>

                {/* Navigation buttons */}
                <div className="flex justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => handleStepChange(currentStep - 1)}
                    disabled={currentStep === 1}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>

                  <div className="flex gap-4">
                    {currentStep < 3 ? (
                      <button
                        type="button"
                        onClick={() => handleStepChange(currentStep + 1)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        Siguiente
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={async (e) => {
                          e.preventDefault()
                          console.log('Guardar button clicked, current step:', currentStep)
                          
                          // Validate all fields using React Hook Form
                          const isValid = await trigger()
                          console.log('Form validation result:', isValid)
                          
                          if (!isValid) {
                            console.log('Form validation failed')
                            addToast('Por favor completa todos los campos requeridos', 'error')
                            
                            // Scroll to first error
                            const formErrors = Object.keys(errors)
                            if (formErrors.length > 0) {
                              const firstError = formErrors[0]
                              const element = document.querySelector(`[name="${firstError}"]`)
                              if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                              }
                            }
                            return
                          }
                          
                          // Get form values and submit
                          const formData = watch()
                          console.log('Form is valid, submitting with data:', formData)
                          await onSubmit(formData)
                        }}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? 'Guardando...' : 'Guardar Demanda'}
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </>
          )}
        </div>
      </main>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}

