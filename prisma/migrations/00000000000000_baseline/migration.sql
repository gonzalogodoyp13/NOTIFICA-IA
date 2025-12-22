BEGIN;
SET search_path TO public;

-- =========================
-- SEQUENCES (required for nextval(..._seq))
-- =========================

CREATE SEQUENCE IF NOT EXISTS public.abogado_bancos_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.abogados_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.aranceles_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.audit_logs_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.bancos_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.comunas_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.diligencia_tipos_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.estampo_bases_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.estampo_customs_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.materias_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.offices_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.tribunales_id_seq;

-- =========================
-- ENUMS
-- =========================
CREATE TYPE "EstadoDiligencia" AS ENUM ('pendiente', 'completada', 'fallida');
CREATE TYPE "EstadoRol" AS ENUM ('pendiente', 'en_proceso', 'terminado', 'archivado');

-- =========================
-- TABLES
-- =========================

-- TABLE: Diligencia
CREATE TABLE "Diligencia" (
  "id" text NOT NULL,
  "rolId" text NOT NULL,
  "tipoId" text NOT NULL,
  "estado" "EstadoDiligencia" NOT NULL DEFAULT 'pendiente'::"EstadoDiligencia",
  "fecha" timestamp(3) without time zone NOT NULL,
  "meta" jsonb,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Diligencia_pkey" PRIMARY KEY ("id")
);

-- TABLE: DiligenciaTipo
CREATE TABLE "DiligenciaTipo" (
  "id" text NOT NULL,
  "officeId" integer NOT NULL,
  "nombre" text NOT NULL,
  "descripcion" text,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiligenciaTipo_pkey" PRIMARY KEY ("id")
);

-- TABLE: Documento
CREATE TABLE "Documento" (
  "id" text NOT NULL,
  "rolId" text NOT NULL,
  "diligenciaId" text,
  "estampoId" text,
  "nombre" text NOT NULL,
  "tipo" text NOT NULL,
  "pdfId" text,
  "version" integer NOT NULL DEFAULT 1,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "textoEditado" text,
  "estampoBaseId" integer,
  "notificacionId" text,
  "voidReason" text,
  "voidedAt" timestamp(3) without time zone,
  "voidedByUserId" text,
  CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- TABLE: Estampo
CREATE TABLE "Estampo" (
  "id" text NOT NULL,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activo" boolean NOT NULL DEFAULT true,
  "fileUrl" text NOT NULL,
  "nombre" text NOT NULL,
  "officeId" integer NOT NULL,
  "tipo" text NOT NULL,
  "contenido" text,
  CONSTRAINT "Estampo_pkey" PRIMARY KEY ("id")
);

-- TABLE: Nota
CREATE TABLE "Nota" (
  "id" text NOT NULL,
  "rolId" text NOT NULL,
  "userId" text NOT NULL,
  "contenido" text NOT NULL,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Nota_pkey" PRIMARY KEY ("id")
);

-- TABLE: Recibo
CREATE TABLE "Recibo" (
  "id" text NOT NULL,
  "rolId" text NOT NULL,
  "monto" double precision NOT NULL,
  "medio" text NOT NULL,
  "ref" text,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Recibo_pkey" PRIMARY KEY ("id")
);

-- TABLE: RolCausa
CREATE TABLE "RolCausa" (
  "id" text NOT NULL,
  "demandaId" text,
  "officeId" integer NOT NULL,
  "rol" text NOT NULL,
  "tribunalId" text NOT NULL,
  "estado" "EstadoRol" NOT NULL DEFAULT 'pendiente'::"EstadoRol",
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RolCausa_pkey" PRIMARY KEY ("id")
);

-- TABLE: Tribunal
CREATE TABLE "Tribunal" (
  "id" text NOT NULL,
  "officeId" integer NOT NULL,
  "nombre" text NOT NULL,
  "direccion" text,
  "comuna" text,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tribunal_pkey" PRIMARY KEY ("id")
);

-- TABLE: abogado_bancos
CREATE TABLE "abogado_bancos" (
  "id" integer NOT NULL DEFAULT nextval('abogado_bancos_id_seq'::regclass),
  "officeId" integer NOT NULL,
  "abogadoId" integer NOT NULL,
  "bancoId" integer NOT NULL,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) without time zone NOT NULL,
  CONSTRAINT "abogado_bancos_pkey" PRIMARY KEY ("id")
);

-- TABLE: abogados
CREATE TABLE "abogados" (
  "id" integer NOT NULL DEFAULT nextval('abogados_id_seq'::regclass),
  "officeId" integer NOT NULL,
  "nombre" text,
  "rut" text,
  "direccion" text,
  "comuna" text,
  "telefono" text,
  "email" text,
  "bancoId" integer,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "abogados_pkey" PRIMARY KEY ("id")
);

-- TABLE: aranceles
CREATE TABLE "aranceles" (
  "id" integer NOT NULL DEFAULT nextval('aranceles_id_seq'::regclass),
  "officeId" integer NOT NULL,
  "bancoId" integer NOT NULL,
  "abogadoId" integer,
  "estampoId" text NOT NULL,
  "monto" integer NOT NULL,
  "activo" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) without time zone NOT NULL,
  CONSTRAINT "aranceles_pkey" PRIMARY KEY ("id")
);

-- TABLE: audit_logs
CREATE TABLE "audit_logs" (
  "id" integer NOT NULL DEFAULT nextval('audit_logs_id_seq'::regclass),
  "userId" text NOT NULL,
  "officeId" integer NOT NULL,
  "tabla" text NOT NULL,
  "accion" text NOT NULL,
  "diff" jsonb,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- TABLE: bancos
CREATE TABLE "bancos" (
  "id" integer NOT NULL DEFAULT nextval('bancos_id_seq'::regclass),
  "officeId" integer NOT NULL,
  "nombre" text NOT NULL,
  "cuenta" text,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bancos_pkey" PRIMARY KEY ("id")
);

-- TABLE: comunas
CREATE TABLE "comunas" (
  "id" integer NOT NULL DEFAULT nextval('comunas_id_seq'::regclass),
  "officeId" integer NOT NULL,
  "nombre" text NOT NULL,
  "region" text,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comunas_pkey" PRIMARY KEY ("id")
);

-- TABLE: demandas
CREATE TABLE "demandas" (
  "id" text NOT NULL,
  "rol" text NOT NULL,
  "tribunalId" integer NOT NULL,
  "caratula" text NOT NULL,
  "cuantia" double precision NOT NULL,
  "abogadoId" integer NOT NULL,
  "officeId" integer NOT NULL,
  "userId" text NOT NULL,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "materiaId" integer,
  CONSTRAINT "demandas_pkey" PRIMARY KEY ("id")
);

-- TABLE: diligencia_tipos
CREATE TABLE "diligencia_tipos" (
  "id" integer NOT NULL DEFAULT nextval('diligencia_tipos_id_seq'::regclass),
  "nombre" text NOT NULL,
  "descripcion" text,
  "officeId" integer NOT NULL,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "diligencia_tipos_pkey" PRIMARY KEY ("id")
);

-- TABLE: ejecutados
CREATE TABLE "ejecutados" (
  "id" text NOT NULL,
  "demandaId" text NOT NULL,
  "nombre" text NOT NULL,
  "rut" text NOT NULL,
  "direccion" text,
  "comunaId" integer,
  "rvm" jsonb,
  CONSTRAINT "ejecutados_pkey" PRIMARY KEY ("id")
);

-- TABLE: estampo_bases
CREATE TABLE "estampo_bases" (
  "id" integer NOT NULL DEFAULT nextval('estampo_bases_id_seq'::regclass),
  "slug" text NOT NULL,
  "nombreVisible" text NOT NULL,
  "categoria" text NOT NULL,
  "descripcion" text,
  "textoTemplate" text NOT NULL,
  "variablesSchema" jsonb NOT NULL,
  "wizardSchema" jsonb NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) without time zone NOT NULL,
  CONSTRAINT "estampo_bases_pkey" PRIMARY KEY ("id")
);

-- TABLE: estampo_customs
CREATE TABLE "estampo_customs" (
  "id" integer NOT NULL DEFAULT nextval('estampo_customs_id_seq'::regclass),
  "baseId" integer NOT NULL,
  "officeId" integer NOT NULL,
  "nombreOverride" text,
  "textoTemplate" text NOT NULL,
  "isDefaultForOffice" boolean NOT NULL DEFAULT true,
  "isActive" boolean NOT NULL DEFAULT true,
  "version" integer NOT NULL DEFAULT 1,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) without time zone NOT NULL,
  CONSTRAINT "estampo_customs_pkey" PRIMARY KEY ("id")
);

-- TABLE: materias
CREATE TABLE "materias" (
  "id" integer NOT NULL DEFAULT nextval('materias_id_seq'::regclass),
  "officeId" integer NOT NULL,
  "nombre" text NOT NULL,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "materias_pkey" PRIMARY KEY ("id")
);
-- TABLE: notificaciones
CREATE TABLE "notificaciones" (
  "id" text NOT NULL,
  "diligenciaId" text NOT NULL,
  "meta" jsonb,
  "createdAt" timestamp(3) without time zone,
  "updatedAt" timestamp(3) without time zone,
  "voidReason" text,
  "voidedAt" timestamp(3) without time zone,
  "voidedByUserId" text,
  CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- TABLE: offices
CREATE TABLE "offices" (
  "id" integer NOT NULL DEFAULT nextval('offices_id_seq'::regclass),
  "nombre" text NOT NULL,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- TABLE: tribunales
CREATE TABLE "tribunales" (
  "id" integer NOT NULL DEFAULT nextval('tribunales_id_seq'::regclass),
  "officeId" integer NOT NULL,
  "nombre" text NOT NULL,
  "direccion" text,
  "comuna" text,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tribunales_pkey" PRIMARY KEY ("id")
);

-- TABLE: users
CREATE TABLE "users" (
  "id" text NOT NULL,
  "email" text NOT NULL,
  "officeName" text NOT NULL,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- =========================
-- CONSTRAINTS
-- =========================
-- CONSTRAINTS for: Diligencia
ALTER TABLE "Diligencia" ADD CONSTRAINT "Diligencia_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "RolCausa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "Diligencia" ADD CONSTRAINT "Diligencia_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "DiligenciaTipo"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- CONSTRAINTS for: DiligenciaTipo

-- CONSTRAINTS for: Documento
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "RolCausa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_diligenciaId_fkey" FOREIGN KEY ("diligenciaId") REFERENCES "Diligencia"(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_estampoBaseId_fkey" FOREIGN KEY ("estampoBaseId") REFERENCES estampo_bases(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_estampoId_fkey" FOREIGN KEY ("estampoId") REFERENCES "Estampo"(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_notificacionId_fkey" FOREIGN KEY ("notificacionId") REFERENCES notificaciones(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- CONSTRAINTS for: Estampo
ALTER TABLE "Estampo" ADD CONSTRAINT "Estampo_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES offices(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- CONSTRAINTS for: Nota
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "RolCausa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          

-- CONSTRAINTS for: Recibo
ALTER TABLE "Recibo" ADD CONSTRAINT "Recibo_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "RolCausa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                

-- CONSTRAINTS for: RolCausa
ALTER TABLE "RolCausa" ADD CONSTRAINT "RolCausa_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES demandas(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "RolCausa" ADD CONSTRAINT "RolCausa_tribunalId_fkey" FOREIGN KEY ("tribunalId") REFERENCES "Tribunal"(id) ON UPDATE CASCADE ON DELETE RESTRICT;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    

-- CONSTRAINTS for: Tribunal

-- CONSTRAINTS for: abogado_bancos
ALTER TABLE "abogado_bancos" ADD CONSTRAINT "abogado_bancos_abogadoId_fkey" FOREIGN KEY ("abogadoId") REFERENCES abogados(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "abogado_bancos" ADD CONSTRAINT "abogado_bancos_bancoId_fkey" FOREIGN KEY ("bancoId") REFERENCES bancos(id) ON UPDATE CASCADE ON DELETE CASCADE;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      

-- CONSTRAINTS for: abogados
ALTER TABLE "abogados" ADD CONSTRAINT "abogados_bancoId_fkey" FOREIGN KEY ("bancoId") REFERENCES bancos(id) ON UPDATE CASCADE ON DELETE SET NULL;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      

-- CONSTRAINTS for: aranceles
ALTER TABLE "aranceles" ADD CONSTRAINT "aranceles_bancoId_fkey" FOREIGN KEY ("bancoId") REFERENCES bancos(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "aranceles" ADD CONSTRAINT "aranceles_abogadoId_fkey" FOREIGN KEY ("abogadoId") REFERENCES abogados(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "aranceles" ADD CONSTRAINT "aranceles_estampoId_fkey" FOREIGN KEY ("estampoId") REFERENCES "Estampo"(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- CONSTRAINTS for: audit_logs
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES offices(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      

-- CONSTRAINTS for: bancos

-- CONSTRAINTS for: comunas

-- CONSTRAINTS for: demandas
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_abogadoId_fkey" FOREIGN KEY ("abogadoId") REFERENCES abogados(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_tribunalId_fkey" FOREIGN KEY ("tribunalId") REFERENCES tribunales(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES offices(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES materias(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- CONSTRAINTS for: diligencia_tipos

-- CONSTRAINTS for: ejecutados
ALTER TABLE "ejecutados" ADD CONSTRAINT "ejecutados_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES demandas(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "ejecutados" ADD CONSTRAINT "ejecutados_comunaId_fkey" FOREIGN KEY ("comunaId") REFERENCES comunas(id) ON UPDATE CASCADE ON DELETE SET NULL;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             

-- CONSTRAINTS for: estampo_bases

-- CONSTRAINTS for: estampo_customs
ALTER TABLE "estampo_customs" ADD CONSTRAINT "estampo_customs_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES estampo_bases(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "estampo_customs" ADD CONSTRAINT "estampo_customs_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES offices(id) ON UPDATE CASCADE ON DELETE CASCADE;                                                                                                                                                                                                                                                                                                                                                                                                                                                                             

-- CONSTRAINTS for: materias

-- CONSTRAINTS for: notificaciones
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_diligenciaId_fkey" FOREIGN KEY ("diligenciaId") REFERENCES "Diligencia"(id) ON UPDATE CASCADE ON DELETE RESTRICT;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        

-- CONSTRAINTS for: offices

-- CONSTRAINTS for: tribunales

-- CONSTRAINTS for: users

-- =========================
-- INDEXES
-- =========================
-- INDEXES for: Diligencia
CREATE INDEX "Diligencia_rolId_createdAt_idx" ON public."Diligencia" USING btree ("rolId", "createdAt");

-- INDEXES for: DiligenciaTipo

-- INDEXES for: Documento
CREATE INDEX "Documento_rolId_createdAt_idx" ON public."Documento" USING btree ("rolId", "createdAt");

-- INDEXES for: Estampo

-- INDEXES for: Nota
CREATE INDEX "Nota_rolId_createdAt_idx" ON public."Nota" USING btree ("rolId", "createdAt");

-- INDEXES for: Recibo
CREATE INDEX "Recibo_rolId_createdAt_idx" ON public."Recibo" USING btree ("rolId", "createdAt");

-- INDEXES for: RolCausa
CREATE INDEX "RolCausa_officeId_createdAt_idx" ON public."RolCausa" USING btree ("officeId", "createdAt");
CREATE INDEX "RolCausa_rol_idx" ON public."RolCausa" USING btree (rol);
CREATE UNIQUE INDEX "RolCausa_demandaId_key" ON public."RolCausa" USING btree ("demandaId");

-- INDEXES for: Tribunal

-- INDEXES for: abogado_bancos
CREATE INDEX "abogado_bancos_abogadoId_idx" ON public.abogado_bancos USING btree ("abogadoId");
CREATE UNIQUE INDEX "abogado_bancos_officeId_abogadoId_bancoId_key" ON public.abogado_bancos USING btree ("officeId", "abogadoId", "bancoId");
CREATE INDEX "abogado_bancos_officeId_idx" ON public.abogado_bancos USING btree ("officeId");
CREATE INDEX "abogado_bancos_bancoId_idx" ON public.abogado_bancos USING btree ("bancoId");

-- INDEXES for: abogados
CREATE INDEX "abogados_officeId_idx" ON public.abogados USING btree ("officeId");
CREATE INDEX "abogados_bancoId_idx" ON public.abogados USING btree ("bancoId");

-- INDEXES for: aranceles
CREATE UNIQUE INDEX "aranceles_officeId_bancoId_abogadoId_estampoId_key" ON public.aranceles USING btree ("officeId", "bancoId", "abogadoId", "estampoId");
CREATE INDEX "aranceles_officeId_bancoId_estampoId_idx" ON public.aranceles USING btree ("officeId", "bancoId", "estampoId");
CREATE INDEX "aranceles_officeId_abogadoId_estampoId_idx" ON public.aranceles USING btree ("officeId", "abogadoId", "estampoId");
CREATE INDEX "aranceles_officeId_bancoId_idx" ON public.aranceles USING btree ("officeId", "bancoId");
CREATE INDEX "aranceles_estampoId_idx" ON public.aranceles USING btree ("estampoId"); 

-- INDEXES for: audit_logs

-- INDEXES for: bancos
CREATE INDEX "bancos_officeId_idx" ON public.bancos USING btree ("officeId");

-- INDEXES for: comunas
CREATE INDEX "comunas_officeId_idx" ON public.comunas USING btree ("officeId");

-- INDEXES for: demandas
CREATE UNIQUE INDEX demandas_rol_key ON public.demandas USING btree (rol);

-- INDEXES for: diligencia_tipos
CREATE INDEX "diligencia_tipos_officeId_idx" ON public.diligencia_tipos USING btree ("officeId");

-- INDEXES for: ejecutados

-- INDEXES for: estampo_bases
CREATE INDEX "estampo_bases_categoria_isActive_idx" ON public.estampo_bases USING btree (categoria, "isActive");
CREATE INDEX estampo_bases_slug_idx ON public.estampo_bases USING btree (slug);
CREATE UNIQUE INDEX estampo_bases_slug_key ON public.estampo_bases USING btree (slug);

-- INDEXES for: estampo_customs
CREATE UNIQUE INDEX "estampo_customs_baseId_officeId_key" ON public.estampo_customs USING btree ("baseId", "officeId");
CREATE INDEX "estampo_customs_officeId_idx" ON public.estampo_customs USING btree ("officeId");
CREATE INDEX "estampo_customs_baseId_idx" ON public.estampo_customs USING btree ("baseId");
CREATE INDEX "estampo_customs_officeId_isActive_idx" ON public.estampo_customs USING btree ("officeId", "isActive");

-- INDEXES for: materias
CREATE INDEX "materias_officeId_idx" ON public.materias USING btree ("officeId");

-- INDEXES for: notificaciones

-- INDEXES for: offices

-- INDEXES for: tribunales
CREATE INDEX "tribunales_officeId_idx" ON public.tribunales USING btree ("officeId");

-- INDEXES for: users
CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

-- =========================
-- SEQUENCE OWNERSHIP
-- =========================
ALTER SEQUENCE public.abogado_bancos_id_seq OWNED BY public.abogado_bancos.id;
ALTER SEQUENCE public.abogados_id_seq OWNED BY public.abogados.id;
ALTER SEQUENCE public.aranceles_id_seq OWNED BY public.aranceles.id;
ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;
ALTER SEQUENCE public.bancos_id_seq OWNED BY public.bancos.id;
ALTER SEQUENCE public.comunas_id_seq OWNED BY public.comunas.id;
ALTER SEQUENCE public.diligencia_tipos_id_seq OWNED BY public.diligencia_tipos.id;
ALTER SEQUENCE public.estampo_bases_id_seq OWNED BY public.estampo_bases.id;
ALTER SEQUENCE public.estampo_customs_id_seq OWNED BY public.estampo_customs.id;
ALTER SEQUENCE public.materias_id_seq OWNED BY public.materias.id;
ALTER SEQUENCE public.offices_id_seq OWNED BY public.offices.id;
ALTER SEQUENCE public.tribunales_id_seq OWNED BY public.tribunales.id;

COMMIT;