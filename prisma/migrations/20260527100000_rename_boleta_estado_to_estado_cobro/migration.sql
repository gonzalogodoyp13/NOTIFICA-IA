ALTER TYPE "BoletaEstado" RENAME TO "EstadoCobro";

ALTER TABLE "Diligencia"
RENAME COLUMN "boletaEstado" TO "estadoCobro";
