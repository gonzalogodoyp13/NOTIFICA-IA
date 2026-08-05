# NOTIFICA IA

Management system for receiver offices. The app runs on Next.js, uses Supabase for authentication, and stores operational data in PostgreSQL through Prisma.

## Tech Stack

- Next.js 14 App Router with TypeScript
- React 18 and TailwindCSS
- Prisma ORM with PostgreSQL
- Supabase Auth through `@supabase/ssr`
- Vercel for the web app; Supabase PostgreSQL, Auth, and Storage are the target canonical production topology once the deployment-owner dashboard check is complete
- `pdf-lib` for generated document workflows

## Prerequisites

- Node.js 18+
- npm
- One isolated Supabase project per environment for PostgreSQL, Auth, and Storage

## Environment

Create `.env` from `.env.example` and fill in the active values:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_APP_NAME=NOTIFICA IA
DEBUG_LOGS=false
NEXT_PUBLIC_ENVIRONMENT=local
```

`DATABASE_URL` is the runtime-only Supavisor transaction-pooler URL on port 6543. It must include `pgbouncer=true`, `connection_limit=1`, `pool_timeout=10`, `connect_timeout=10`, and `sslmode=require`. `DIRECT_URL` is used only by Prisma migrations and administrative commands; copy either the direct endpoint or Supavisor session-mode URL on port 5432 from Supabase Connect. Never derive one URL by editing the other, and never print either value.

Production, Preview, and QA must use separate Supabase projects and credentials. Preview and QA must never use production PostgreSQL, Auth, or Storage.

Set `DEBUG_LOGS=true` only while troubleshooting locally. Leave it disabled in production so Prisma, auth, and API diagnostic logs stay quiet unless they are true operational errors.

## Required Prisma Startup Rule

Before implementation work, and before schema-dependent changes, run these commands in this order:

```powershell
prisma migrate status
prisma migrate deploy
prisma generate
```

If the global `prisma` command is not available, use the local binary:

```powershell
.\node_modules\.bin\prisma.cmd migrate status
.\node_modules\.bin\prisma.cmd migrate deploy
.\node_modules\.bin\prisma.cmd generate
```

Do not use Prisma's development migration flow unless the user explicitly asks for it. This project has had migration-history and baseline drift issues, so local development must use committed migrations with `migrate deploy`.

Do not push Prisma schema changes directly to the database. Schema changes must be represented by committed Prisma migrations.

## Local Setup

Install dependencies:

```powershell
npm install
```

Apply committed migrations and generate Prisma Client:

```powershell
npm run db:status
npm run db:migrate
npm run db:generate
```

Start the development server:

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Before release or deployment, run:

```powershell
npm run build
```

## Available Commands

```powershell
npm run dev               # Start the local Next.js dev server
npm run build             # Build the app for production
npm start                 # Start the production server
npm run lint              # Run Next.js linting
npm run check:utf8        # Check source files for UTF-8 issues
npm run check:auth-audit  # Enforce authentication and audit architecture
npm run check:infrastructure # Enforce region, pooling, Prisma, and timing architecture
npm run verify:infrastructure # Safely verify local infrastructure connectivity

npm run db:status         # Check Prisma migration status
npm run db:migrate        # Apply committed Prisma migrations with migrate deploy
npm run db:generate       # Generate Prisma Client
npm run db:studio         # Open Prisma Studio
npm run db:seed           # Run the Prisma seed script
npm run db:backfill:recibos
```

## Domain Date Semantics

These terms are the canonical business dates for diligence, receipt, and document workflows:

- `fechaEncargo`: date entered by the user when creating "Nueva Diligencia" inside a Rol workspace. This is the assignment or request date for the diligencia.
- `fechaEjecucion`: date when the receptor actually performed the diligencia. This is the visible date that should be used on the recibo PDF.
- `fechaRecibo`: date and time when the recibo or estampo document is generated. This is for admin filtering and reporting, not the visible receipt date.
- `fechaPago`: retired. This is not part of the official workflow; future implementation should remove or ignore it safely without breaking legacy behavior.
- `fechaBoleta`: retired. This is not part of the official workflow; future implementation should not add a business date for boleta.

`Recibo.fechaEjecucion` and `Recibo.fechaRecibo` are persisted business dates. Receipt PDFs use `fechaEjecucion` as their visible date, while Recibos admin filters and exports use `fechaRecibo`.

`createdAt` is a technical audit timestamp. Do not treat it as a business date except as a temporary legacy fallback when older records are missing explicit business dates.

In receipt workflows, `recibo` means the generated PDF receipt for a notificacion. `boleta` means only the external boleta number that can be attached to selected recibos from Gestion de Recibos. `estadoCobro` is the paid/unpaid collection status and is not a boleta document or date.

ROL records are office-scoped. The same normalized ROL, such as `C-2020-2025`, may exist in different offices as separate private records, but it may not be duplicated inside the same office. ROL values are stored trimmed and uppercase so casing differences do not create separate causes.

New recibos use sequential receipt numbers per office and generation year in the format `R-YYYY-000001`. The sequence is independent per office/year, so two offices can both have `R-2026-000001`, while one office's 2026 receipts continue as `R-2026-000001`, `R-2026-000002`, and so on. Legacy receipt numbers are preserved.

## Application Modules

- Authentication and session handling through Supabase.
- Users and office ownership for tenant-aware data access.
- Roles and case management through `RolCausa`.
- Demandas for intake and case creation.
- Diligencias, notifications, scheduling, status updates, and completion flows.
- Document generation and storage workflows.
- Audit logs, recent logs, summaries, and exports.
- Recibos and linkage/backfill utilities.
- Ajustes and catalog modules for bancos, comunas, materias, tribunales, procuradores, abogados, aranceles, diligencia tipos, and estampos.
- PDF and estampo generation workflows for operational documents.

## Project Structure

```text
app/                    Next.js App Router pages and API routes
app/api/                Server API modules for the application workflows
components/             Shared React UI components
lib/                    Auth, Prisma, roles, PDF, recibos, estampos, and utility code
prisma/schema.prisma    Prisma data model
prisma/migrations/      Committed database migrations
prisma/seed.ts          Seed data script
scripts/                One-off and backfill scripts
public/                 Static assets
```

## Current Workflow

1. Pull the latest code.
2. Install dependencies if `package-lock.json` changed.
3. Run the Prisma startup sequence with `db:status`, `db:migrate`, and `db:generate`.
4. Start the app with `npm run dev`.
5. Make code changes without using forbidden Prisma commands.
6. Run `npm run build` before handing off or deploying changes.

## Deployment Notes

- Follow [the infrastructure co-location runbook](docs/INFRASTRUCTURE_COLOCATION_RUNBOOK.md). It defines region selection, pooled connections, release approval, monitoring, and rollback.
- The exact Supabase AWS region must be read from the production dashboard before committing `vercel.json`. Configure exactly one matching Vercel function region and enable Fluid Compute.
- Configure `DATABASE_URL`, `DIRECT_URL`, Supabase service values, and `NEXT_PUBLIC_ENVIRONMENT` separately for Production, Preview, and QA.
- Dispatch `.github/workflows/release.yml` with an exact commit SHA. The QA job must pass before a protected `production` environment reviewer can approve release.
- Migrations run only in that controlled job, through `DIRECT_URL`, in the required `status` → `deploy` → `generate` order. Vercel functions must not run migrations.
- Disable Vercel Git integration's automatic production promotion. Isolated Preview builds may remain enabled.
- For daily audit emails, configure `AUDIT_REPORT_SYNC_SECRET`, `AUDIT_FAILURE_EMAIL`, and the normal mail provider variables. Schedule an external cron/Vercel Cron call to `POST /api/internal/reports/daily/send` at 7:00 AM America/Santiago with `Authorization: Bearer <AUDIT_REPORT_SYNC_SECRET>`.
- For monthly billing report emails, schedule an external cron/Vercel Cron call to `POST /api/internal/reports/monthly/send` at 7:00 AM America/Santiago on the first day of each month with the same bearer secret. Daily and monthly endpoints are separate and may both run on the first day; idempotency prevents duplicate successful sends.
- Monthly billing reports use `reportType = "monthly"`, `periodDate = YYYY-MM`, are stored permanently with `expiresAt = null`, and can also be generated or sent manually by office admins from `Ajustes > Reportes`.

## License

Private - NOTIFICA IA
