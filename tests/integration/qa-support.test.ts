import { describe, expect, it } from 'vitest'

import { buildWizardAnswers, isQaRol, qaName, qaRol } from '../../scripts/qa-support'

describe('QA seed helpers', () => {
  it('builds stable QA names and role tags', () => {
    expect(qaName('Tribunal')).toBe('QA-P9 Tribunal')
    expect(qaRol('EXPORT')).toBe('QA-P9-EXPORT')
    expect(isQaRol('QA-P9-EXPORT')).toBe(true)
    expect(isQaRol('REAL-CASE')).toBe(false)
  })

  it('builds deterministic wizard answers from options and text steps', () => {
    const answers = buildWizardAnswers([
      {
        variable: 'sexo_demandado',
        inputType: 'RADIO',
        options: [
          { value: 'MASCULINO', label: 'Masculino' },
          { value: 'FEMENINO', label: 'Femenino' },
        ],
      },
      {
        variable: 'numero_casa',
        inputType: 'TEXT',
      },
    ])

    expect(answers).toEqual({
      sexo_demandado: 'MASCULINO',
      numero_casa: 'QA-P9 numero_casa',
    })
  })
})

