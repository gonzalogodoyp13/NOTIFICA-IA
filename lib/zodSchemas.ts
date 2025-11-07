// Zod validation schemas for Ajustes de Oficina models
// Used for validating data in API routes and forms
import { z } from "zod";

export const MateriaSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
});

export const BancoSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
  cuenta: z.string().optional(),
});

export const AbogadoSchema = z.object({
  nombre: z.string().optional(),
  rut: z.string().optional(),
  direccion: z.string().optional(),
  comuna: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email().optional(),
  bancoId: z.number().optional(),
});

export const TribunalSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
  direccion: z.string().optional(),
  comuna: z.string().optional(),
});

export const DiligenciaTipoSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
  descripcion: z.string().optional(),
});

export const ComunaSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
  region: z.string().optional(),
});

export const EjecutadoSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido"),
  rut: z.string().min(1, "RUT requerido"),
  direccion: z.string().optional(),
  comunaId: z.number().optional(),
  rvm: z.any().optional(), // JSON field
});

export const DemandaSchema = z.object({
  rol: z.string().min(1, "ROL requerido"),
  tribunalId: z.number().int().positive("Tribunal ID inválido"),
  caratula: z.string().min(1, "Carátula requerida"),
  cuantia: z.number().nonnegative("Cuantía debe ser un número positivo"),
  abogadoId: z.number().int().positive("Abogado ID inválido"),
  ejecutados: z.array(EjecutadoSchema).optional(),
});

