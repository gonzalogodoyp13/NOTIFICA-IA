# NOTIFICA IA — Audit evidence and coverage map

Companion to USER_ACTION_LAUNCH_AUDIT.md. Snapshot: October 29, 2026; current working tree, including uncommitted files. This inventory verifies coverage of discovered surfaces, not functional pass status. API mappings are test-family assignments, not a claim that every endpoint was line-by-line security audited.

**363 base acceptance cases across 26 sections; 23 page files and 128 route-handler files mapped.** Parameterized catalogs, templates, roles, environments and failure variants require additional execution rows. All cases remain Not run.

## Test-family counts

| Family | Base cases |
| --- | ---: |
| START | 8 |
| AUTH | 12 |
| DASH | 16 |
| CAT | 9 |
| CONTACT | 16 |
| RATE | 9 |
| TPL | 13 |
| PDF | 10 |
| CASE | 18 |
| ROL | 14 |
| DIL | 12 |
| EXEC | 17 |
| STAMP | 13 |
| LIST | 13 |
| PAY | 14 |
| MAIL | 17 |
| REPLY | 16 |
| RECON | 8 |
| REPORT | 17 |
| JOB | 11 |
| SCHED | 6 |
| CUSTOM | 10 |
| SIGN | 19 |
| AGENT | 26 |
| ACCESS | 8 |
| API | 8 |
| UX | 15 |
| FLOW | 8 |

## Source evidence for findings

Each reference points to the current local source; line numbers may move with subsequent edits.

| Finding | Evidence |
| --- | --- |
| F01 | [app/(protected)/demandas/nueva/page.tsx:411](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/demandas/nueva/page.tsx:411>); [lib/validations/demanda.ts:21](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/validations/demanda.ts:21>); [app/api/demandas/route.ts:7](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/demandas/route.ts:7>) |
| F02 | [README.md:119](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/README.md:119>); [app/(protected)/recibos/page.tsx:900](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/recibos/page.tsx:900>); [lib/recibos/query.ts:221](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/recibos/query.ts:221>) |
| F03 | [lib/recibos/bulk.ts:167](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/recibos/bulk.ts:167>); [lib/recibos/query.ts:273](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/recibos/query.ts:273>) |
| F04 | [app/(protected)/recibos/components/UnmatchedRepliesPanel.tsx:14](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/recibos/components/UnmatchedRepliesPanel.tsx:14>); [app/(protected)/recibos/page.tsx:878](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/recibos/page.tsx:878>) |
| F05 | [app/(protected)/roles/[id]/_components/RolStatusActions.tsx:40](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/roles/[id]/_components/RolStatusActions.tsx:40>); [app/api/roles/[id]/notas/route.ts:58](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/notas/route.ts:58>); [app/api/demandas/[id]/route.ts:36](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/demandas/[id]/route.ts:36>); [lib/roles/workflowState.ts:25](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/roles/workflowState.ts:25>) |
| F06 | [app/login/page.tsx:26](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/login/page.tsx:26>); [lib/auth-core.ts:13](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/auth-core.ts:13>) |
| F07 | [app/api/signing/devices/route.ts:23](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/signing/devices/route.ts:23>); [lib/signing/center.ts:133](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/signing/center.ts:133>); [agents/windows/Notifica.Agent/Tray.cs:31](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/agents/windows/Notifica.Agent/Tray.cs:31>) |
| F08 | [app/(protected)/ajustes/page.tsx:111](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/ajustes/page.tsx:111>); [lib/reports/access.ts:9](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/reports/access.ts:9>); [lib/signing/center.ts:148](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/signing/center.ts:148>) |
| F09 | [app/(protected)/roles/[id]/diligencias/DiligenciasTable.tsx:424](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/roles/[id]/diligencias/DiligenciasTable.tsx:424>); [app/api/roles/[id]/diligencias/[diligenciaId]/notificaciones/[notificacionId]/route.ts:240](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/diligencias/[diligenciaId]/notificaciones/[notificacionId]/route.ts:240>) |
| F10 | [lib/recibos/query.ts:90](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/recibos/query.ts:90>) |
| F11 | [agents/windows/README.md:3](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/agents/windows/README.md:3>) |
| F12 | [app/(protected)/roles/[id]/diligencias/EstampoWizardModal.tsx:521](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/roles/[id]/diligencias/EstampoWizardModal.tsx:521>) |
| F13 | [app/(protected)/recibos/page.tsx:222](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/recibos/page.tsx:222>); [app/(protected)/recibos/page.tsx:410](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/recibos/page.tsx:410>) |
| F14 | [lib/client/recentRoles.ts:3](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/client/recentRoles.ts:3>); [app/logout/route.ts:32](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/logout/route.ts:32>); [app/(protected)/dashboard/DashboardSearch.tsx:22](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/dashboard/DashboardSearch.tsx:22>) |
| F15 | [lib/recibos/mailer.ts:140](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/recibos/mailer.ts:140>); [lib/recibos/delivery-visibility.ts:41](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/recibos/delivery-visibility.ts:41>) |
| F16 | [app/(protected)/recibos/page.tsx:318](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/recibos/page.tsx:318>) |

Absence observations F04/F06/F07/F13/F16 are based on the whole current page/control/route inventory, not just the single cited function. Runtime feature flags and a different deployed revision must be checked during execution. F14 identifies a source-level privacy risk requiring runtime reproduction; the checklist does not claim a successful unauthorized server read.

## Page inventory

| Browser path | Test families | Source |
| --- | --- | --- |
| `/ajustes/abogados` | CONTACT, ACCESS, API-04 | [app/(protected)/ajustes/abogados/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/ajustes/abogados/page.tsx:1>) |
| `/ajustes/bancos` | CAT, RATE, ACCESS | [app/(protected)/ajustes/bancos/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/ajustes/bancos/page.tsx:1>) |
| `/ajustes/comunas` | CAT, ACCESS | [app/(protected)/ajustes/comunas/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/ajustes/comunas/page.tsx:1>) |
| `/ajustes/diligencias` | CAT, ACCESS | [app/(protected)/ajustes/diligencias/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/ajustes/diligencias/page.tsx:1>) |
| `/ajustes/estampos` | TPL, STAMP, ACCESS | [app/(protected)/ajustes/estampos/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/ajustes/estampos/page.tsx:1>) |
| `/ajustes/materias` | CAT, ACCESS | [app/(protected)/ajustes/materias/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/ajustes/materias/page.tsx:1>) |
| `/ajustes` | DASH, CAT, CONTACT, RATE, TPL, PDF, REPORT | [app/(protected)/ajustes/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/ajustes/page.tsx:1>) |
| `/ajustes/pdf` | PDF, ACCESS | [app/(protected)/ajustes/pdf/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/ajustes/pdf/page.tsx:1>) |
| `/ajustes/procuradores` | CONTACT, ACCESS, API-04 | [app/(protected)/ajustes/procuradores/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/ajustes/procuradores/page.tsx:1>) |
| `/ajustes/reportes` | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/(protected)/ajustes/reportes/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/ajustes/reportes/page.tsx:1>) |
| `/ajustes/tribunales` | CAT, ACCESS | [app/(protected)/ajustes/tribunales/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/ajustes/tribunales/page.tsx:1>) |
| `/dashboard` | DASH, ACCESS | [app/(protected)/dashboard/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/dashboard/page.tsx:1>) |
| `/demandas/nueva` | CASE, ACCESS | [app/(protected)/demandas/nueva/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/demandas/nueva/page.tsx:1>) |
| `/firmados` | SIGN, AGENT, ACCESS, API-06 | [app/(protected)/firmados/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/firmados/page.tsx:1>) |
| `/recibos` | LIST, PAY, MAIL, REPLY, ACCESS | [app/(protected)/recibos/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/recibos/page.tsx:1>) |
| `/recibos/reconciliacion` | RECON, PAY, ACCESS | [app/(protected)/recibos/reconciliacion/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/recibos/reconciliacion/page.tsx:1>) |
| `/roles/[id]/editar` | CASE, ACCESS | [app/(protected)/roles/[id]/editar/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/roles/[id]/editar/page.tsx:1>) |
| `/roles/[id]` | ROL, CASE, DASH, ACCESS | [app/(protected)/roles/[id]/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/roles/[id]/page.tsx:1>) |
| `/roles/no-encontrado` | ROL, CASE, DASH, ACCESS | [app/(protected)/roles/no-encontrado/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/roles/no-encontrado/page.tsx:1>) |
| `/roles` | ROL, CASE, DASH, ACCESS | [app/(protected)/roles/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/(protected)/roles/page.tsx:1>) |
| `/login` | AUTH | [app/login/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/login/page.tsx:1>) |
| `/` | AUTH, START | [app/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/page.tsx:1>) |
| `/signin` | AUTH | [app/signin/page.tsx:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/signin/page.tsx:1>) |

## API and route-handler inventory

All methods below need the matching authorization and parent/office-identity variants. Internal machine endpoints are not customer buttons. `/api/ping` is intentionally public and should reveal no private information. `/logout` and `/auth/disabled` are session handlers outside `/api`.

| Route | Exported methods | Test families | Source |
| --- | --- | --- | --- |
| `/api/abogados/[id]` | PUT, DELETE | CONTACT, ACCESS, API-04 | [app/api/abogados/[id]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/abogados/[id]/route.ts:1>) |
| `/api/abogados` | GET, POST | CONTACT, ACCESS, API-04 | [app/api/abogados/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/abogados/route.ts:1>) |
| `/api/activity/auth/login` | POST | AUTH, ACCESS | [app/api/activity/auth/login/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/activity/auth/login/route.ts:1>) |
| `/api/ajustes/estampos/wizard` | GET | TPL, STAMP, ACCESS | [app/api/ajustes/estampos/wizard/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/ajustes/estampos/wizard/route.ts:1>) |
| `/api/ajustes/pdf/assets/[kind]` | GET | PDF, ACCESS | [app/api/ajustes/pdf/assets/[kind]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/ajustes/pdf/assets/[kind]/route.ts:1>) |
| `/api/ajustes/pdf` | GET, PUT | PDF, ACCESS | [app/api/ajustes/pdf/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/ajustes/pdf/route.ts:1>) |
| `/api/aranceles/[id]` | GET, PUT, DELETE | RATE, EXEC, ACCESS | [app/api/aranceles/[id]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/aranceles/[id]/route.ts:1>) |
| `/api/aranceles/lookup` | GET | RATE, EXEC, ACCESS | [app/api/aranceles/lookup/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/aranceles/lookup/route.ts:1>) |
| `/api/aranceles` | GET, POST | RATE, EXEC, ACCESS | [app/api/aranceles/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/aranceles/route.ts:1>) |
| `/api/bancos/[id]` | PUT, DELETE | CAT, RATE, ACCESS | [app/api/bancos/[id]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/bancos/[id]/route.ts:1>) |
| `/api/bancos` | GET, POST | CAT, RATE, ACCESS | [app/api/bancos/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/bancos/route.ts:1>) |
| `/api/comunas/[id]` | PUT, DELETE | CAT, ACCESS | [app/api/comunas/[id]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/comunas/[id]/route.ts:1>) |
| `/api/comunas` | GET, POST | CAT, ACCESS | [app/api/comunas/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/comunas/route.ts:1>) |
| `/api/dashboard/actions` | GET | DASH, ACCESS | [app/api/dashboard/actions/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/dashboard/actions/route.ts:1>) |
| `/api/dashboard/activity` | GET | DASH, ACCESS | [app/api/dashboard/activity/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/dashboard/activity/route.ts:1>) |
| `/api/dashboard` | GET | DASH, ACCESS | [app/api/dashboard/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/dashboard/route.ts:1>) |
| `/api/demandas/[id]` | PUT | CASE, ACCESS | [app/api/demandas/[id]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/demandas/[id]/route.ts:1>) |
| `/api/demandas` | POST | CASE, ACCESS | [app/api/demandas/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/demandas/route.ts:1>) |
| `/api/diligencia-tipos/[id]` | PUT, DELETE | CAT, ACCESS | [app/api/diligencia-tipos/[id]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/diligencia-tipos/[id]/route.ts:1>) |
| `/api/diligencia-tipos` | GET, POST | CAT, ACCESS | [app/api/diligencia-tipos/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/diligencia-tipos/route.ts:1>) |
| `/api/diligencias/[id]/boleta` | POST | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/diligencias/[id]/boleta/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/diligencias/[id]/boleta/route.ts:1>) |
| `/api/diligencias/[id]/complete` | PUT | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/diligencias/[id]/complete/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/diligencias/[id]/complete/route.ts:1>) |
| `/api/diligencias/[id]/estampo/preview` | POST | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/diligencias/[id]/estampo/preview/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/diligencias/[id]/estampo/preview/route.ts:1>) |
| `/api/diligencias/[id]/estampo` | POST | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/diligencias/[id]/estampo/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/diligencias/[id]/estampo/route.ts:1>) |
| `/api/diligencias/[id]/estampos/generate` | POST | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/diligencias/[id]/estampos/generate/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/diligencias/[id]/estampos/generate/route.ts:1>) |
| `/api/diligencias/[id]/estampos/preview` | POST | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/diligencias/[id]/estampos/preview/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/diligencias/[id]/estampos/preview/route.ts:1>) |
| `/api/diligencias/[id]/estampos/wizard` | GET | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/diligencias/[id]/estampos/wizard/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/diligencias/[id]/estampos/wizard/route.ts:1>) |
| `/api/diligencias/[id]/recibo` | POST | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/diligencias/[id]/recibo/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/diligencias/[id]/recibo/route.ts:1>) |
| `/api/diligencias/[id]` | GET, PUT, DELETE | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/diligencias/[id]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/diligencias/[id]/route.ts:1>) |
| `/api/diligencias/[id]/schedule` | PUT | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/diligencias/[id]/schedule/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/diligencias/[id]/schedule/route.ts:1>) |
| `/api/diligencias` | GET, POST, PUT, DELETE | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/diligencias/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/diligencias/route.ts:1>) |
| `/api/documentos/[id]/download` | GET | ROL, API-02, ACCESS | [app/api/documentos/[id]/download/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/documentos/[id]/download/route.ts:1>) |
| `/api/documentos` | GET, POST, PUT, DELETE | ROL, API-02, ACCESS | [app/api/documentos/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/documentos/route.ts:1>) |
| `/api/encargos` | GET | API-08, DASH, ACCESS | [app/api/encargos/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/encargos/route.ts:1>) |
| `/api/estampos-custom/reset` | POST | TPL, STAMP, ACCESS | [app/api/estampos-custom/reset/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/estampos-custom/reset/route.ts:1>) |
| `/api/estampos-custom` | POST | TPL, STAMP, ACCESS | [app/api/estampos-custom/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/estampos-custom/route.ts:1>) |
| `/api/estampos/[id]` | PUT, DELETE | TPL, STAMP, ACCESS | [app/api/estampos/[id]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/estampos/[id]/route.ts:1>) |
| `/api/estampos` | GET, POST | TPL, STAMP, ACCESS | [app/api/estampos/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/estampos/route.ts:1>) |
| `/api/estampos/wizard/categorias` | GET | TPL, STAMP, ACCESS | [app/api/estampos/wizard/categorias/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/estampos/wizard/categorias/route.ts:1>) |
| `/api/internal/activity-outbox/process` | POST | API-05, SCHED, JOB, REPLY, SIGN, ACCESS | [app/api/internal/activity-outbox/process/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/internal/activity-outbox/process/route.ts:1>) |
| `/api/internal/recibos/replies/sync` | POST | API-05, SCHED, JOB, REPLY, SIGN, ACCESS | [app/api/internal/recibos/replies/sync/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/internal/recibos/replies/sync/route.ts:1>) |
| `/api/internal/reports/daily/send` | POST | API-05, SCHED, JOB, REPLY, SIGN, ACCESS | [app/api/internal/reports/daily/send/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/internal/reports/daily/send/route.ts:1>) |
| `/api/internal/reports/monthly/send` | POST | API-05, SCHED, JOB, REPLY, SIGN, ACCESS | [app/api/internal/reports/monthly/send/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/internal/reports/monthly/send/route.ts:1>) |
| `/api/internal/reports/tick` | POST | API-05, SCHED, JOB, REPLY, SIGN, ACCESS | [app/api/internal/reports/tick/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/internal/reports/tick/route.ts:1>) |
| `/api/internal/signing/maintenance` | GET | API-05, SCHED, JOB, REPLY, SIGN, ACCESS | [app/api/internal/signing/maintenance/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/internal/signing/maintenance/route.ts:1>) |
| `/api/materias/[id]` | PUT, DELETE | CAT, ACCESS | [app/api/materias/[id]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/materias/[id]/route.ts:1>) |
| `/api/materias` | GET, POST | CAT, ACCESS | [app/api/materias/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/materias/route.ts:1>) |
| `/api/notas` | GET, POST, DELETE | ROL, API-02, ACCESS | [app/api/notas/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/notas/route.ts:1>) |
| `/api/pdf/generate` | POST | TPL, PDF, API-03, ACCESS | [app/api/pdf/generate/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/pdf/generate/route.ts:1>) |
| `/api/ping` | GET | AUTH-05, API-07 (public health only) | [app/api/ping/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/ping/route.ts:1>) |
| `/api/procuradores/[id]/banco/[bancoId]` | DELETE | CONTACT, ACCESS, API-04 | [app/api/procuradores/[id]/banco/[bancoId]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/procuradores/[id]/banco/[bancoId]/route.ts:1>) |
| `/api/procuradores/[id]/banco/[bancoId]/toggle-activo` | PATCH | CONTACT, ACCESS, API-04 | [app/api/procuradores/[id]/banco/[bancoId]/toggle-activo/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/procuradores/[id]/banco/[bancoId]/toggle-activo/route.ts:1>) |
| `/api/procuradores/[id]/link-banco` | POST | CONTACT, ACCESS, API-04 | [app/api/procuradores/[id]/link-banco/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/procuradores/[id]/link-banco/route.ts:1>) |
| `/api/procuradores/[id]` | GET, PATCH | CONTACT, ACCESS, API-04 | [app/api/procuradores/[id]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/procuradores/[id]/route.ts:1>) |
| `/api/procuradores/[id]/toggle-activo` | PATCH | CONTACT, ACCESS, API-04 | [app/api/procuradores/[id]/toggle-activo/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/procuradores/[id]/toggle-activo/route.ts:1>) |
| `/api/procuradores` | GET, POST | CONTACT, ACCESS, API-04 | [app/api/procuradores/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/procuradores/route.ts:1>) |
| `/api/recibos/bulk/[operationId]/undo` | POST | PAY, ACCESS | [app/api/recibos/bulk/[operationId]/undo/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/bulk/[operationId]/undo/route.ts:1>) |
| `/api/recibos/bulk/preview` | POST | PAY, ACCESS | [app/api/recibos/bulk/preview/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/bulk/preview/route.ts:1>) |
| `/api/recibos/bulk/recent` | GET | PAY, ACCESS | [app/api/recibos/bulk/recent/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/bulk/recent/route.ts:1>) |
| `/api/recibos/bulk` | POST | PAY, ACCESS | [app/api/recibos/bulk/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/bulk/route.ts:1>) |
| `/api/recibos/export` | POST | LIST, PAY, MAIL, REPLY, ACCESS | [app/api/recibos/export/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/export/route.ts:1>) |
| `/api/recibos/filter-options` | GET | LIST, PAY, MAIL, REPLY, ACCESS | [app/api/recibos/filter-options/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/filter-options/route.ts:1>) |
| `/api/recibos/reconciliation/export` | POST | RECON, PAY, ACCESS | [app/api/recibos/reconciliation/export/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/reconciliation/export/route.ts:1>) |
| `/api/recibos/reconciliation` | GET | RECON, PAY, ACCESS | [app/api/recibos/reconciliation/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/reconciliation/route.ts:1>) |
| `/api/recibos` | GET | LIST, PAY, MAIL, REPLY, ACCESS | [app/api/recibos/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/route.ts:1>) |
| `/api/recibos/send/health` | GET, POST | MAIL, REPLY, ACCESS | [app/api/recibos/send/health/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/send/health/route.ts:1>) |
| `/api/recibos/send/history/[batchId]` | GET | MAIL, REPLY, ACCESS | [app/api/recibos/send/history/[batchId]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/send/history/[batchId]/route.ts:1>) |
| `/api/recibos/send/history/recipients/[recipientId]/resend` | POST | MAIL, REPLY, ACCESS | [app/api/recibos/send/history/recipients/[recipientId]/resend/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/send/history/recipients/[recipientId]/resend/route.ts:1>) |
| `/api/recibos/send/history/recipients/[recipientId]/resolution` | PATCH | MAIL, REPLY, ACCESS | [app/api/recibos/send/history/recipients/[recipientId]/resolution/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/send/history/recipients/[recipientId]/resolution/route.ts:1>) |
| `/api/recibos/send/history` | GET | MAIL, REPLY, ACCESS | [app/api/recibos/send/history/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/send/history/route.ts:1>) |
| `/api/recibos/send/preview` | POST | MAIL, REPLY, ACCESS | [app/api/recibos/send/preview/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/send/preview/route.ts:1>) |
| `/api/recibos/send/replies/[replyId]/classification` | PATCH | MAIL, REPLY, ACCESS | [app/api/recibos/send/replies/[replyId]/classification/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/send/replies/[replyId]/classification/route.ts:1>) |
| `/api/recibos/send/replies/sync` | POST | MAIL, REPLY, ACCESS | [app/api/recibos/send/replies/sync/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/send/replies/sync/route.ts:1>) |
| `/api/recibos/send/replies/unmatched` | GET | MAIL, REPLY, ACCESS | [app/api/recibos/send/replies/unmatched/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/send/replies/unmatched/route.ts:1>) |
| `/api/recibos/send` | POST | MAIL, REPLY, ACCESS | [app/api/recibos/send/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/send/route.ts:1>) |
| `/api/recibos/send/template` | GET, PUT | MAIL, REPLY, ACCESS | [app/api/recibos/send/template/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/send/template/route.ts:1>) |
| `/api/recibos/send/test` | POST | MAIL, REPLY, ACCESS | [app/api/recibos/send/test/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/recibos/send/test/route.ts:1>) |
| `/api/reports/[id]/delivery-attempts` | GET | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/[id]/delivery-attempts/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/[id]/delivery-attempts/route.ts:1>) |
| `/api/reports/[id]/download` | GET | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/[id]/download/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/[id]/download/route.ts:1>) |
| `/api/reports/[id]/send` | POST | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/[id]/send/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/[id]/send/route.ts:1>) |
| `/api/reports/[id]/versions/[versionId]/restore` | POST | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/[id]/versions/[versionId]/restore/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/[id]/versions/[versionId]/restore/route.ts:1>) |
| `/api/reports/[id]/versions` | GET | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/[id]/versions/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/[id]/versions/route.ts:1>) |
| `/api/reports/cleanup` | POST | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/cleanup/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/cleanup/route.ts:1>) |
| `/api/reports/custom-definitions/[definitionId]/archive` | POST | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/custom-definitions/[definitionId]/archive/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/custom-definitions/[definitionId]/archive/route.ts:1>) |
| `/api/reports/custom-definitions/[definitionId]` | GET, PATCH | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/custom-definitions/[definitionId]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/custom-definitions/[definitionId]/route.ts:1>) |
| `/api/reports/custom-definitions/[definitionId]/run` | POST | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/custom-definitions/[definitionId]/run/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/custom-definitions/[definitionId]/run/route.ts:1>) |
| `/api/reports/custom-definitions` | GET, POST | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/custom-definitions/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/custom-definitions/route.ts:1>) |
| `/api/reports/daily/generate` | POST | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/daily/generate/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/daily/generate/route.ts:1>) |
| `/api/reports/daily/send` | POST | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/daily/send/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/daily/send/route.ts:1>) |
| `/api/reports/delivery-attempts/[attemptId]` | GET | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/delivery-attempts/[attemptId]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/delivery-attempts/[attemptId]/route.ts:1>) |
| `/api/reports/delivery-attempts` | GET | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/delivery-attempts/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/delivery-attempts/route.ts:1>) |
| `/api/reports/jobs/[jobId]/cancel` | POST | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/jobs/[jobId]/cancel/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/jobs/[jobId]/cancel/route.ts:1>) |
| `/api/reports/jobs/[jobId]/retry` | POST | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/jobs/[jobId]/retry/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/jobs/[jobId]/retry/route.ts:1>) |
| `/api/reports/jobs/[jobId]` | GET | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/jobs/[jobId]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/jobs/[jobId]/route.ts:1>) |
| `/api/reports/jobs` | GET | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/jobs/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/jobs/route.ts:1>) |
| `/api/reports/monthly/generate` | POST | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/monthly/generate/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/monthly/generate/route.ts:1>) |
| `/api/reports/monthly/send` | POST | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/monthly/send/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/monthly/send/route.ts:1>) |
| `/api/reports/recipients` | GET, PUT | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/recipients/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/recipients/route.ts:1>) |
| `/api/reports` | GET | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/route.ts:1>) |
| `/api/reports/schedules/[scheduleId]` | PATCH | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/schedules/[scheduleId]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/schedules/[scheduleId]/route.ts:1>) |
| `/api/reports/schedules/[scheduleId]/run-now` | POST | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/schedules/[scheduleId]/run-now/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/schedules/[scheduleId]/run-now/route.ts:1>) |
| `/api/reports/schedules` | GET | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/schedules/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/schedules/route.ts:1>) |
| `/api/reports/versions` | GET | REPORT, JOB, SCHED, CUSTOM, ACCESS | [app/api/reports/versions/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/reports/versions/route.ts:1>) |
| `/api/roles/[id]/diligencias/[diligenciaId]/notificaciones/[notificacionId]` | PATCH, DELETE | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/roles/[id]/diligencias/[diligenciaId]/notificaciones/[notificacionId]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/diligencias/[diligenciaId]/notificaciones/[notificacionId]/route.ts:1>) |
| `/api/roles/[id]/diligencias/[diligenciaId]/notificaciones/[notificacionId]/workflow` | GET | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/roles/[id]/diligencias/[diligenciaId]/notificaciones/[notificacionId]/workflow/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/diligencias/[diligenciaId]/notificaciones/[notificacionId]/workflow/route.ts:1>) |
| `/api/roles/[id]/diligencias/[diligenciaId]/notificaciones` | POST | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/roles/[id]/diligencias/[diligenciaId]/notificaciones/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/diligencias/[diligenciaId]/notificaciones/route.ts:1>) |
| `/api/roles/[id]/diligencias` | GET, POST | DIL, EXEC, STAMP, API-01, API-08, ACCESS | [app/api/roles/[id]/diligencias/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/diligencias/route.ts:1>) |
| `/api/roles/[id]/documentos` | GET | ROL, CASE, DASH, ACCESS | [app/api/roles/[id]/documentos/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/documentos/route.ts:1>) |
| `/api/roles/[id]/header` | GET | ROL, CASE, DASH, ACCESS | [app/api/roles/[id]/header/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/header/route.ts:1>) |
| `/api/roles/[id]/membrete` | POST | ROL, CASE, DASH, ACCESS | [app/api/roles/[id]/membrete/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/membrete/route.ts:1>) |
| `/api/roles/[id]/notas` | GET, POST, DELETE | ROL, CASE, DASH, ACCESS | [app/api/roles/[id]/notas/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/notas/route.ts:1>) |
| `/api/roles/[id]/resumen` | GET | ROL, CASE, DASH, ACCESS | [app/api/roles/[id]/resumen/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/resumen/route.ts:1>) |
| `/api/roles/[id]` | GET | ROL, CASE, DASH, ACCESS | [app/api/roles/[id]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/route.ts:1>) |
| `/api/roles/[id]/status` | PUT | ROL, CASE, DASH, ACCESS | [app/api/roles/[id]/status/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/status/route.ts:1>) |
| `/api/roles/[id]/timeline` | GET | ROL, CASE, DASH, ACCESS | [app/api/roles/[id]/timeline/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/[id]/timeline/route.ts:1>) |
| `/api/roles` | GET | ROL, CASE, DASH, ACCESS | [app/api/roles/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/route.ts:1>) |
| `/api/roles/search` | GET | ROL, CASE, DASH, ACCESS | [app/api/roles/search/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/roles/search/route.ts:1>) |
| `/api/search/roles` | GET | DASH, ACCESS | [app/api/search/roles/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/search/roles/route.ts:1>) |
| `/api/signing/archive/[id]` | GET | SIGN, AGENT, ACCESS, API-06 | [app/api/signing/archive/[id]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/signing/archive/[id]/route.ts:1>) |
| `/api/signing/archive` | GET | SIGN, AGENT, ACCESS, API-06 | [app/api/signing/archive/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/signing/archive/route.ts:1>) |
| `/api/signing/center` | GET, POST | SIGN, AGENT, ACCESS, API-06 | [app/api/signing/center/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/signing/center/route.ts:1>) |
| `/api/signing/device/[action]` | POST | SIGN, AGENT, ACCESS, API-06 | [app/api/signing/device/[action]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/signing/device/[action]/route.ts:1>) |
| `/api/signing/devices` | GET, POST | SIGN, AGENT, ACCESS, API-06 | [app/api/signing/devices/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/signing/devices/route.ts:1>) |
| `/api/tribunales/[id]` | PUT, DELETE | CAT, ACCESS | [app/api/tribunales/[id]/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/tribunales/[id]/route.ts:1>) |
| `/api/tribunales` | GET, POST | CAT, ACCESS | [app/api/tribunales/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/tribunales/route.ts:1>) |
| `/api/user/me` | GET | AUTH, ACCESS | [app/api/user/me/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/api/user/me/route.ts:1>) |
| `/auth/disabled` | GET | AUTH | [app/auth/disabled/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/auth/disabled/route.ts:1>) |
| `/logout` | POST | AUTH | [app/logout/route.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/app/logout/route.ts:1>) |

### Dynamic device actions

`POST /api/signing/device/[action]` multiplexes these transport operations. Test user-visible effects via SIGN/AGENT and auth/replay/failure behavior via ACCESS/API-06:

`enroll`, `retire`, `challenge`, `session`, `session-renew`, `heartbeat`, `claim`, `renew`, `release`, `fail`, `start`, `input`, `download`, `result`, `ack`, `recovery`, `deliveries`, `delivery-begin`, `delivery-download`, `delivery-fail`, `office-folder`, `office-folder-download`.

Legacy delivery operations remaining in this transport are compatibility paths, not evidence of a new per-device delivery UI. The current shared folder and archive are the customer-facing model.

## Wizard model coverage

The shipped seed source contains these models. Run STAMP-04/05/08 against each installed model and every configured custom model; capture the live catalog inventory at execution time because source seeds do not prove what is installed.

- Dirección señalada se encuentra incompleta
- Falta especificar número de casa
- Falta especificar número de casa del inmueble señalado
- Inmueble desocupado y sin moradores
- No existe la numeración
- No existe la calle en esta comuna
- No existe la calle en esta comuna + calle alternativa
- No vive en ese domicilio
- No fue habido, no es persona conocida

## Supporting source and automated tests

- [lib/validations/rol-workspace.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/validations/rol-workspace.ts:1>)
- [lib/roles/workflowStateCore.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/roles/workflowStateCore.ts:1>)
- [lib/recibos/generation.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/recibos/generation.ts:1>)
- [lib/recibos/bulk.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/recibos/bulk.ts:1>)
- [lib/reports/jobs.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/reports/jobs.ts:1>)
- [lib/reports/schedules.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/reports/schedules.ts:1>)
- [lib/signing/center.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/lib/signing/center.ts:1>)
- [docs/signing/OFFICE-SHARED-FOLDER.md:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/docs/signing/OFFICE-SHARED-FOLDER.md:1>)
- [agents/windows/release/managed/INSTALACION.md:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/agents/windows/release/managed/INSTALACION.md:1>)
- [agents/windows/release/managed/ACTUALIZACION.md:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/agents/windows/release/managed/ACTUALIZACION.md:1>)
- [public/sw.js:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/public/sw.js:1>)

Browser suite files (not run by this audit):

- [e2e/firmados.spec.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/e2e/firmados.spec.ts:1>)
- [e2e/pdf-settings.spec.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/e2e/pdf-settings.spec.ts:1>)
- [e2e/recibos-responsive.spec.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/e2e/recibos-responsive.spec.ts:1>)
- [e2e/recibos-unmatched-replies.spec.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/e2e/recibos-unmatched-replies.spec.ts:1>)
- [e2e/reports.spec.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/e2e/reports.spec.ts:1>)
- [e2e/service-worker.spec.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/e2e/service-worker.spec.ts:1>)
- [e2e/workflow-performance.spec.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/e2e/workflow-performance.spec.ts:1>)
- [e2e/workflows.spec.ts:1](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/e2e/workflows.spec.ts:1>)

## Execution evidence required

Use USER_ACTION_TEST_LOG.md for base-case status. Duplicate a row with a variant suffix when testing different roles, templates, catalog types, browsers, dates or environments. Attach the actual file/email/checksum/history evidence. An inventoried route or a test file existing in source is never a passing execution result.
