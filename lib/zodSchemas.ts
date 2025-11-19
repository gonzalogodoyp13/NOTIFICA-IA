// Zod validation schemas for Ajustes de Oficina models
// Used for validating data in API routes and forms
import { z } from "zod";

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
  bancoId: z.number().optional(),
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

