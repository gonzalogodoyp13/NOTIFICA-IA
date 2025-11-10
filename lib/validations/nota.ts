// Zod validation schema for Nota (ROL Phase 4)
import { z } from "zod";

export const zNota = z.object({
  rolId: z.string().min(1, "rolId es requerido"),
  contenido: z.string().min(3, "Contenido debe tener al menos 3 caracteres"),
});

