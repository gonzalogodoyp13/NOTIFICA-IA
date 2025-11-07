// DemandFormStepper component
// Step navigation for multi-step form
'use client'

interface DemandFormStepperProps {
  currentStep: number
  onStepChange: (step: number) => void
  steps: { id: number; label: string; completed: boolean }[]
}

export default function DemandFormStepper({
  currentStep,
  onStepChange,
  steps,
}: DemandFormStepperProps) {
  return (
    <div className="mb-8">
      <nav aria-label="Progress">
        <ol className="flex items-center justify-center">
          {steps.map((step, index) => (
            <li key={step.id} className={`${index !== steps.length - 1 ? 'pr-8 sm:pr-12' : ''} relative`}>
              {/* Connector line */}
              {index !== steps.length - 1 && (
                <div
                  className={`absolute top-4 left-4 -ml-4 h-0.5 w-full ${
                    step.completed ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                  aria-hidden="true"
                />
              )}
              
              {/* Step button */}
              <button
                type="button"
                onClick={() => onStepChange(step.id)}
                className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                  currentStep === step.id
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : step.completed
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'
                }`}
                aria-current={currentStep === step.id ? 'step' : undefined}
              >
                {step.completed && currentStep !== step.id ? (
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <span className="text-xs font-medium">{step.id}</span>
                )}
                <span className="sr-only">{step.label}</span>
              </button>
              
              {/* Step label */}
              <div className="absolute top-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span
                  className={`text-xs font-medium ${
                    currentStep === step.id
                      ? 'text-blue-600'
                      : step.completed
                      ? 'text-gray-600'
                      : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  )
}


