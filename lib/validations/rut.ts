import { z } from 'zod'

export const rutChilenoOpcional = z.string().trim().max(20).refine(value =>
  !value || /^(?:\d{1,8}|\d{1,2}(?:\.\d{3}){1,2})-?[0-9Kk]$/.test(value), {
  message: 'Ingresa el RUT con su dígito verificador.',
})
