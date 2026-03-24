-- Crear enum BoletaEstado
CREATE TYPE "BoletaEstado" AS ENUM ('PAGADO', 'NO_PAGADO');

-- Agregar columna boletaEstado a tabla diligencias
ALTER TABLE "Diligencia"
ADD COLUMN "boletaEstado" "BoletaEstado" NOT NULL DEFAULT 'NO_PAGADO';
