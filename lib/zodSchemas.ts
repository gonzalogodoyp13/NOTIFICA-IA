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
  bancoIds: z.array(z.number().int().positive()).optional(),
  procuradorIds: z.array(z.number().int().positive()).optional(),
  newProcuradores: z.array(
    z.object({
      nombre: z.string().min(2, "Nombre requerido"),
      email: z.preprocess(
        (val) => val === "" ? null : val,
        z.string().email("Email invalido").optional().nullable()
      ),
      telefono: z.string().optional().nullable(),
      notas: z.string().optional().nullable(),
    })
  ).optional(),
});

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
    const hasEstampoId = !!data.estampoId
    const hasCategoria = !!data.estampoBaseCategoria
    return hasEstampoId !== hasCategoria
  },
  { message: "Debe proporcionar exactamente uno de: estampoId (legacy) o estampoBaseCategoria (wizard)" }
);

export function parseArancelMonto(input: string | number): number {
  if (typeof input === 'number') return Math.floor(input);
  return cleanCuantiaInput(input) ?? 0;
}

export const ProcuradorSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
  email: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().email("Email invalido").optional().nullable()
  ),
  telefono: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
  abogadoIds: z.array(z.number().int().positive()).optional(),
});

export const ProcuradorUpdateSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido").optional(),
  email: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().email("Email invalido").optional().nullable()
  ),
  telefono: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
  abogadoIds: z.array(z.number().int().positive()).optional(),
});

export const LinkBancoSchema = z.object({
  bancoId: z.number().int().positive(),
  alias: z.string().optional().nullable(),
});

export const ToggleActivoSchema = z.object({
  activo: z.boolean().optional(),
});
