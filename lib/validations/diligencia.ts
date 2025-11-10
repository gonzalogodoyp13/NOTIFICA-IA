// Zod validation schema for Diligencia (ROL Phase 4)
import { z } from "zod";

export const zDiligencia = z.object({
  rolId: z.string().min(1, "rolId es requerido"),
  tipoId: z.string().min(1, "tipoId es requerido"),
  fecha: z.coerce.date().max(new Date(), "Fecha no puede ser futura"),
  estado: z.enum(["pendiente", "completada", "fallida"]).default("pendiente"),
  meta: z.record(z.any()).optional(),
});

export const zDiligenciaUpdate = z.object({
  estado: z.enum(["pendiente", "completada", "fallida"]).optional(),
  meta: z.record(z.any()).optional(),
});

