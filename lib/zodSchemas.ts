// Zod validation schemas for Ajustes de Oficina models
// Used for validating data in API routes and forms
import { z } from "zod";
import { cleanCuantiaInput } from '@/lib/utils/cuantia';

export const MateriaSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
});

export const BancoSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
});

export const AbogadoSchema = z.object({
  nombre: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email().optional(),
  bancoId: z.number().optional(),  // MANTENER para compatibilidad (opcional durante transición)
  bancoIds: z.array(z.number().int().positive()).optional(),  // NUEVO - array de IDs de bancos
}).refine(
  (data) => {
    // Al menos uno de bancoId o bancoIds debe estar presente si se proporciona alguno
    // O ambos pueden estar ausentes (abogado sin banco)
    return true; // Permitir ambos o ninguno durante transición
  },
  { message: "bancoId o bancoIds debe ser proporcionado" }
);

export const TribunalSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
});

export const DiligenciaTipoSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
});

export const ComunaSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
});

export const EstampoSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
  tipo: z.enum(["firma", "sello", "modelo"], { 
    errorMap: () => ({ message: "Tipo debe ser 'firma', 'sello' o 'modelo'" }) 
  }),
  contenido: z.string().optional(),
  fileUrl: z.string().optional(),
});

export const ArancelSchema = z.object({
  bancoId: z.number().int().positive(),
  abogadoId: z.number().int().positive().nullable().optional(),
  estampoId: z.string().min(1).optional(),
  estampoBaseCategoria: z.string().min(1).optional(),
  monto: z.number().int().min(0),
  activo: z.boolean().optional().default(true),
}).refine(
  (data) => {
    // Validar XOR: exactamente uno de estampoId o estampoBaseCategoria
    const hasEstampoId = !!data.estampoId
    const hasCategoria = !!data.estampoBaseCategoria
    return hasEstampoId !== hasCategoria  // XOR: uno u otro, no ambos ni ninguno
  },
  { message: "Debe proporcionar exactamente uno de: estampoId (legacy) o estampoBaseCategoria (wizard)" }
);

// Helper para parsear monto desde string chileno (usar antes de validar)
export function parseArancelMonto(input: string | number): number {
  if (typeof input === 'number') return Math.floor(input);
  return cleanCuantiaInput(input) ?? 0;
}

export const ProcuradorSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
  email: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().email("Email inválido").optional().nullable()
  ),
  telefono: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
  abogadoId: z.number().int().positive().nullable().optional(),
  bancoId: z.number().int().positive().optional(), // Para crear + link en POST
  alias: z.string().optional().nullable(), // Para alias en relación banco
});

export const ProcuradorUpdateSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido").optional(),
  email: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().email("Email inválido").optional().nullable()
  ),
  telefono: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
  abogadoId: z.number().int().positive().nullable().optional(),
});

export const LinkBancoSchema = z.object({
  bancoId: z.number().int().positive(),
  alias: z.string().optional().nullable(),
});

export const ToggleActivoSchema = z.object({
  activo: z.boolean().optional(), // Si no se envía, hace toggle
});

