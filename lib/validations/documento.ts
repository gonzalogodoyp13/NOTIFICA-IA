// Zod validation schema for Documento (ROL Phase 4)
import { z } from "zod";

export const zDocumento = z.object({
  rolId: z.string().min(1, "rolId es requerido"),
  diligenciaId: z.string().optional(),
  estampoId: z.string().optional(),
  nombre: z.string().min(3, "Nombre debe tener al menos 3 caracteres"),
  tipo: z.string().min(2, "Tipo es requerido"),
  pdfId: z.string().optional(),
  version: z.number().int().positive().default(1),
});

export const zDocumentoUpdate = z.object({
  nombre: z.string().min(3).optional(),
  tipo: z.string().min(2).optional(),
  pdfId: z.string().optional(),
  version: z.number().int().positive().optional(),
});

