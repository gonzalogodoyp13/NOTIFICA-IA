# Workflow fixes verification — 2026-10-05

All five requested flows passed manual testing in the signed-in Chrome session at localhost:3000, using the production build.

## Automated and environment checks

- Prisma startup: migrate status, migrate deploy, generate, in that order. No migrate dev used.
- Additive migration applied: 20261005120000_explicit_procurador_and_demanda_banks. All 45 migrations current.
- Existing procurador bank assignments preserved. Thirty legacy demandas resolved to a bank; one ambiguous legacy demanda remains unassigned and requires selection in Editar demanda.
- TypeScript: passed.
- ESLint: passed without warnings.
- UTF-8 check: passed.
- Infrastructure static and local database connectivity checks: passed without warnings.
- Production build: passed. An initial build collided with the development server; stopping the project server and rebuilding cleanly resolved it.
- Vitest: 353 passed, 83 skipped across 55 files (44 passed, 11 skipped). Includes eight new regression tests for explicit bank selections, simultaneous abogado/bank filtering, validation, and legacy demanda bank resolution.

## Manual browser checks

1. Created QA-FIX-20261005 Procurador under ABOGADO PRUEBA 1, which has Banco Estado and Banco de Chile. Both bank checkboxes started unchecked. Selected only Banco de Chile. Saved and reopened: only Banco de Chile was checked. Database confirmed one bank link.
2. Created QA-FIX-20261005 demanda with Banco de Chile and ABOGADO PRUEBA 1. Procurador options contained only the new fixture and the existing procurador associated with that abogado. Unrelated procuradores were absent. Selecting the abogado preserved the selected second bank.
3. Opened Editar Demanda from the ROL. The carátula box showed the saved bank and complete detail, including an embedded slash. Changed its displayed bank prefix manually and saved. Reopened: edited detail persisted; database bancoId still identified Banco de Chile.
4. Created a new QA-P9 Notificacion diligencia. Clicked Ejecutar. Observed Preparando, then Cargando datos del flujo, then Datos de ejecución. No temporary not-found warning appeared.
5. Execution step 1 contained date and time without a Banco field. Selected Hoy and successfully continued to receipt step 2. Database confirmed the notification inherited Banco de Chile despite the manual carátula prefix.

No receipt or estampo was generated. The exact temporary test records were removed after verification; audit history was retained.

The expired automated QA session was not regenerated after automatic approval review rejected that helper. Manual testing used the user's normal signed-in session instead.

## Screenshots

- procurador-bank-selection.png
- edit-demanda.png
- execution-step-1.png
