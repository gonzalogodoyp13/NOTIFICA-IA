# NOTIFICA IA — User-action audit and launch test checklist

Prepared: October 29, 2026. Target for execution: https://notifica-staging.vercel.app/ and, after release, the final customer URL.

**Deliverables: 363 base test cases in 26 sections, with action steps, expected results and priorities; 16 source findings to resolve.** The coverage inventory maps all 23 discovered page files and 128 route handlers (169 HTTP method exports). Repeat the parameterized cases for every listed catalog, model, role and environment.

- [Execution log — record pass/fail and evidence](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/docs/USER_ACTION_TEST_LOG.md>)
- [Coverage map — source references and full route inventory](<C:/Users/gonza/Desktop/NOTIFICA IA - WEB - (2)/docs/USER_ACTION_AUDIT_COVERAGE.md>)

**This is a source-based functional audit and executable acceptance checklist, not a certificate that the application has passed these tests. All test cases below start as NOT RUN.** The review used the current working tree at commit `c13b215664c45a4bb894905f024ef605471246bd`, including existing uncommitted signing-agent changes. The deployed Vercel revision, live database catalogs, email accounts, real token, and customer installation were not verified. Confirm the deployed version before testing. A feature present locally may not yet be deployed.

The audit covers actions exposed in the web application, Windows signing companion, admin workflows, and background outcomes that users depend on. It distinguishes visible controls from API-only or missing capabilities. It does not assess legal certification, commercial terms, or market readiness. No application code or database was changed; the Prisma implementation-startup sequence was therefore not invoked for this documentation-only audit.

## How to use this checklist

1. Confirm the candidate build and use isolated test offices and fictitious case data. Email tests below require an explicitly authorized test sender and recipients controlled by the tester; generating this checklist did not send anything.
2. Prepare the fixtures below, then test the sections in order. Test an ordinary member as well as an administrator; do not test everything with one admin account.
3. For every row, record **Not run / Pass / Fail / Blocked / Not applicable**, tester, build, browser/device, date, actual result, evidence, and defect reference. A successful click alone is not a pass: verify persisted data, the downloaded file, email received, or signed artifact as specified.
4. Rows listing several values are parameterized tests: record a result for **each** value, including every office-configured estampo/template and relevant role. Do not mark a whole family passed after one example.
5. Treat the expected results as release acceptance criteria. Where the code and desired behavior differ, record a failure or an explicit product decision; do not quietly change the expectation to match a bug.
6. A blocked test is not a pass. “Not applicable” requires a reason and a feature explicitly excluded from the offer. Repeat affected tests after fixes, then rerun the end-to-end journeys against the final release.

**Priorities:** P0 = release blocker for the feature being sold: access isolation, irreversible operations, document integrity, incorrect money, or failure of a core customer journey. P1 = required functional acceptance for supported features. P2 = usability or lower-impact behavior that needs review; only minor P2 defects may be accepted with a documented workaround. Test all applicable rows, not just P0.

**Actors:** Member = active ordinary office user. Admin = active office administrator. Operator = person installing/enabling the Windows token agent. Engineer = tester exercising APIs or controlled failure scenarios. Unless a section says otherwise, run as Member and repeat its core create/edit flow as Admin.

### Test fixtures

| Fixture | Prepare before execution |
| --- | --- |
| Accounts | Office A: two admins and two ordinary members; Office B: one admin/member; a disabled account; a Supabase-authenticated account without a local application user; an anonymous browser. Use separate browser profiles for isolation tests. |
| Catalog | Two banks; two lawyers, one linked to both banks; procuradores with overlapping and non-overlapping lawyer/bank associations, missing and valid email addresses, and active/inactive states; two tribunales, comunas, materias, diligence types. |
| Cases | A single-ejecutado case; a multiple-ejecutado case; an incomplete address/comuna case; a case without a bank; pending, in-progress, finished and archived cases; the same normalized ROL in offices A and B. |
| Documents and prices | One custom estampo; all wizard templates in the candidate environment; bank default and lawyer-specific prices with different amounts; one missing-price combination; custom PDF assets; old/legacy documents where available. |
| Receipts | More than 25 receipts and preferably more than 50; all four paid/boleta combinations; two notifications in one diligence; regenerated and corrected receipts; receipts with different execution and generation dates, including month/year boundaries. |
| Email | Controlled lawyer/procurador inboxes; missing/invalid address; shared address across recipient types; a failed delivery; replies with matching thread references, unrelated subject, ambiguity, attachment and HTML-like text. |
| Reports | Several dates/months, an empty period, enough history for multiple pages, current/historical/expired versions, partial/failed delivery, queued/running/failed/cancelled jobs, eligible/ineligible recipients. |
| Signing | Two authorized Windows PCs, a real supported token/certificate and operator, one receiver-only device if supported, active/expired/revoked enrollment fixtures, a validated signed file older than 50 days, and controlled network/storage/validator failures. Never deliberately lock a real token to simulate failure; use a test fixture for locked-PIN states. |
| Devices/data volume | Supported Windows/browser combinations, Chrome/Edge desktop, mobile browser at roughly 360–390 px, tablet, installed PWA, long Spanish names/accents, realistic office volume and two users editing concurrently. |

## Audit findings and product decisions to resolve

These are observations from source, not reproduced production failures. See `USER_ACTION_AUDIT_COVERAGE.md` for the route inventory and source mapping.

| Ref | Source observation | Required launch decision/test |
| --- | --- | --- |
| F01 | **Fixed in working tree; deployment pending.** See [verification and rollout](USER_ACTION_FIXES.md). Create-demand UI now labels the lawyer as required and uses native required-field validation, matching the existing create API. | Fixed the optional-label mismatch. Verify CASE-04 on the deployed release. |
| F02 | **Fixed in working tree; deployment pending.** See [verification and rollout](USER_ACTION_FIXES.md). README now documents receipt-level payment dates as active and execution date as the management/export/reconciliation filter date; generation remains a separate timestamp. | Retained the existing payment workflow. Distinct execution, generation and payment date regression passes; verify deployed date/PAY cases. |
| F03 | **Fixed in working tree; deployment pending.** See [verification and rollout](USER_ACTION_FIXES.md). Original finding: bulk “Marcar pagado” updates `Diligencia.estadoCobro` and `fechaPago`, while multiple notification receipts can share a diligence. | Implemented per-receipt payment and undo. Isolated database regressions pass; verify PAY-07 against the deployed release after its migration. |
| F04 | **Fixed in working tree; deployment pending.** See [verification and rollout](USER_ACTION_FIXES.md). Implemented manual reply association with searchable sent destinations, explicit confirmation, office/provider checks, conflict protection and transactional audit/count updates. Added original-mailbox attachment downloads for Graph and Gmail. | API/provider and browser regressions pass. Verify REPLY-13/REPLY-14 with controlled live mailboxes after deployment; files over 20 MB or unavailable original messages require the original mailbox. |
| F05 | **Fixed in working tree; deployment pending.** See [verification and rollout](USER_ACTION_FIXES.md). Finished/archived cases now block case-field edits and note creation/deletion in the APIs, with transaction-level parent protection. UI hides editing/note controls and explains the scope. | Collections and signatures of existing documents remain available under their existing permissions. Verify FLOW-07 after deployment; closed-note API and browser regressions pass. |
| F06 | No self-service registration, user/office-management screen, forgot/reset/change-password screen, subscription checkout, plan management or account cancellation screen was found in the page inventory. | Managed onboarding and billing may be sufficient, but rehearse them as service procedures. Missing UI is not a passing self-service feature. |
| F07 | Device enrollment/revocation exists as an admin API and Windows enrollment dialog, but no web enrollment-management page was found. New shared-folder model retires per-device delivery retry; some old copy/contract branches remain. | Rehearse how an admin obtains/revokes a code; test the shipped installation package. Do not sell old delivery controls as current functionality. |
| F08 | Catalog settings are generally available to ordinary members; PDF settings and reports are explicitly admin-restricted. Signature requests are available to active members, while recovery/cancellation/device administration are admin actions. | Approve this permission model for customer offices, then test both UI and API enforcement. A customer expectation of admin-only catalogs is not automatically met. |
| F09 | `Anular Notificacion` confirms removal together with associated receipts/estampos; its handler deletes related records and then cleans storage. Signing-pinned sources can prevent deletion. | Treat it as a destructive operation, not a harmless status label. Verify cancellation, integrity, historical evidence, and signed-document behavior. |
| F10 | **Fixed in working tree; deployment pending.** See [verification and rollout](USER_ACTION_FIXES.md). Receipt bank labels and bank filtering now use the receipt’s saved bank instead of all banks linked to contacts. Missing saved banks display a dash without guessing. | Shared list/export/email/reconciliation data uses the corrected query. Multi-bank regression passes; verify PDF/XLSX/email agreement with live fixtures. |
| F11 | Current Windows work includes uncommitted 0.14.0 dashboard/update changes; this does not prove that customers or Vercel run them. | Pin web build and agent package versions in every test result; test the actual distributed package and update path. |
| F12 | **Fixed in working tree; deployment pending.** See [verification](USER_ACTION_FIXES.md). Original finding: the per-document wizard text editor's Cancel handler closes the editor but deliberately preserves `textoEditado`; Confirm also closes it. | Cancel now discards the draft; Confirm commits it. Browser payload regressions pass; complete deployed STAMP-07/STAMP-13 PDF acceptance after release. |
| F13 | Receipt API/state logic supports `allFiltered`, but the current receipt component has no control that sets selection into that mode. Pagination resets explicit selection. | Treat all-filtered export/send as API-only unless a deployed control is verified. Test current-page behavior and document the user's bulk-export limit. |
| F14 | **Fixed in working tree; deployment pending.** See [verification](USER_ACTION_FIXES.md). Original finding: recent ROLs use one `notifica.recentRoles.v1` localStorage key without user/office scope; no clearing call was found in the logout path. | History is now scoped to user and office; ownerless legacy history is discarded. Browser scope-switch regressions pass; retain AUTH-09/DASH-07 for deployed acceptance. |
| F15 | Receipt mailer defaults to `dry-run` when `MAIL_PROVIDER` is absent. UI supports a simulation label; simulation is not delivered email. | MAIL-17 must distinguish simulation from real inbox delivery; verify live send and reply configuration before selling email functionality. |
| F16 | Receipt dispatch UI requests history with `limit=20` and exposes no older-history pagination/load-more control. | REPLY-16 checks whether older dispatches/replies can actually be retrieved by a user. Decide the supported retention/navigation promise. |

## 1. Customer onboarding and access to the service

Actor: Admin plus the person responsible for customer setup. These are service acceptance tests where no self-service UI exists.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| START-01 | P0 | Provision a completely new customer office using the intended launch procedure; create its first admin and sign in. | Correct office identity; usable empty workspace; no data, assets, contacts, reports or signatures from a previous customer. Record the actual provisioning procedure. |
| START-02 | P0 | Add a second member and a second administrator through the supported operator procedure; sign in separately. | Both belong to the intended office; member/admin differences match the approved permission model. No shared credentials are required. |
| START-03 | P1 | Walk a first-time admin through catalogs, lawyer/procurador/bank links, prices, PDF identity, email readiness and signing prerequisites. | They can complete the first case journey without hidden developer-only setup. Any operator step has an owner and documented completion check. |
| START-04 | P0 | Simulate a forgotten password and complete the proposed support/recovery process. | Customer regains access securely; no nonexistent reset screen is assumed; old/new-session behavior is verified. |
| START-05 | P0 | Disable a member already logged in, then try reading and changing data from that session. | New authenticated requests are denied; previously open screens cannot continue saving or downloading. |
| START-06 | P1 | Change an admin to a member using the supported operator procedure, then retry privileged actions without restarting the browser. | Permissions reflect the new role; no continuing report/PDF/device-management access through an old session. |
| START-07 | P1 | Rehearse purchase, renewal, support contact and cancellation using the actual commercial process. | Each step has a working owner/process. Record manual billing if used; the product is not described as having subscription checkout. |
| START-08 | P0 | Rehearse customer departure: approved data handover, access removal and device revocation. | Required customer files can be handed over through a defined process and former users/devices lose future access. Document any missing full-office export capability. |

## 2. Login, session and logout

Sources: `app/login`, `app/signin`, `app/logout`, `app/auth/disabled`, `lib/auth-core.ts`, `lib/auth-server.ts`.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| AUTH-01 | P0 | Sign in through `/login` with each valid account. | Dashboard opens with the correct account and office; only that office's records are accessible. |
| AUTH-02 | P1 | Repeat valid and invalid sign-in through `/signin`, which also exists in the source. | Equivalent access checks; no alternate route bypasses disabled/unprovisioned-user handling. |
| AUTH-03 | P1 | Submit empty email/password, malformed email, incorrect password and unknown email. | Clear failure, no protected data, no endless spinner; form becomes usable again. |
| AUTH-04 | P0 | Sign in with a disabled account and with an auth account lacking an application user. | Appropriate disabled/not-provisioned explanation and no usable protected session. |
| AUTH-05 | P0 | Open dashboard, case, receipts, reports, signing and download links anonymously. | Protected pages require login; APIs/files deny access rather than return office information. |
| AUTH-06 | P1 | Refresh a protected page, open a new tab and restart the browser within the supported session lifetime. | Valid session continues consistently; expired session requires login without a redirect loop. |
| AUTH-07 | P0 | Let the session expire while a form is open, then save, export or request a signature. | Request is denied or safely reauthenticated; no false “saved/sent/signed” result. |
| AUTH-08 | P0 | Log out from each visible logout control; press Back and reuse an old API/download URL. | Future protected reads/writes are denied; browser navigation does not make the logged-out session usable. |
| AUTH-09 | P0 | Log out of A, sign in as B in the same browser, revisit recent-case links and cached pages. | No A data or recent-case details appear as B's authorized content. |
| AUTH-10 | P1 | Double-click login and logout; interrupt connectivity during either action. | Controls recover; session state is truthful; user can retry without a stuck or contradictory UI. |
| AUTH-11 | P1 | Temporarily make auth/user lookup unavailable in a controlled environment. | Clear temporary-unavailability handling, no accidental access or account creation. |
| AUTH-12 | P1 | Open `/` anonymously and while signed in; use Ingresar and Inicio. | Anonymous landing works; authenticated root goes to dashboard and navigation reflects session state. |

## 3. Navigation, dashboard and search

Sources: protected TopBar, `components/Topbar.tsx`, `app/(protected)/dashboard`, roles list and missing-ROL page.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| DASH-01 | P1 | Open every navigation/quick card: Nueva demanda, Demandas, Recibos, Firmados, Reportes, Ajustes; return Home. | Correct destination, no dead links or inaccessible overlapping headers; admin-only destinations handled appropriately. |
| DASH-02 | P1 | Search exact ROL in top bar by Enter and search button; repeat with spaces/lowercase. | Correct normalized case opens; search does not select a similarly named case in another office. **2026-11-05: BLOCKED overall; four search variants PASS, cross-office fixture unavailable. See execution evidence below.** |
| DASH-03 | P1 | Search a missing ROL, click Crear causa con ROL, and return without saving. | Not-found page shows the searched ROL, creation pre-fills it, and no case exists until submission. |
| DASH-04 | P1 | Submit blank top-bar search; open missing-ROL URL without its parameter. | No meaningless search; missing parameter redirects safely to roles. |
| DASH-05 | P1 | Dashboard search by partial ROL, ejecutado, lawyer and bank; use keyboard result navigation. | Relevant office-scoped results; highlight/open behavior selects the intended case. |
| DASH-06 | P1 | Search enough matches for multiple pages; move forward/back and submit another query. | Correct page counts, no duplicated/missing rows; new query resets pagination. |
| DASH-07 | P1 | Open several search results, revisit dashboard and use recent-ROL shortcuts. | Recent links point to correct accessible cases; no cross-office history disclosure. |
| DASH-08 | P1 | Apply each dashboard date, lawyer, bank and procurador filter separately and in combination; clear them. | Applied data matches the chosen criteria; draft inputs do not silently masquerade as applied filters. |
| DASH-09 | P0 | Compare Pendientes, Atrasadas, Recibos sin pagar, Faltan estampos and Documentos recientes against prepared cases. | Counts and money match the underlying records. Include the 14-day overdue and 7-day recent-document boundaries used by the current UI. **2026-11-05: BLOCKED overall; observed totals and independent unpaid-receipt reconciliation recorded below; exact boundary fixtures unavailable.** |
| DASH-10 | P1 | Open each metric's detail list, case link and available document link. | Correct filtered detail and correct case/PDF; empty states remain usable. |
| DASH-11 | P1 | Use Actualizar and Reintentar after a failed dashboard read. | Fresh data loads and error clears; cached totals are not presented as newly verified results. |
| DASH-12 | P1 | Open Continuar flujo, Generar recibo faltante and Generar estampo faltante; try each sort and Cargar más. | Correct queue and order, no repeated rows; link opens the intended notification and wizard step. **2026-11-05: FAIL — D-DASH12-001 reproduced twice; queue pagination and other tested wizard destinations recorded below.** |
| DASH-13 | P1 | Follow a queued action after another user completes/deletes it or archives the case. | Clear stale/not-available/read-only response; no wrong-notification action. |
| DASH-14 | P1 | Click Asociar boleta from dashboard. | Receipt screen opens in the intended flow; tester still reviews/selects the actual receipt records before changing them. |
| DASH-15 | P1 | Expand/collapse activity; select each category; load more and open an event. | Correct office events and links; timestamps and actor/action details match the tested operations. |
| DASH-16 | P1 | Open Demandas list with zero, one and many cases; use Editar and workspace links. | ROL, parties, tribunal and status are accurate; long lists remain navigable. Record any missing pagination at customer scale. |

### Selected dashboard execution — 2026-11-05

Tester: Codex, through the real Chrome desktop UI on Windows, using the already authenticated testing account. Execution approximately 06:00–06:08 America/Los_Angeles (14:00–14:08 UTC); the site displayed Chilean times around 11:00–11:08. Target: https://notifica-staging.vercel.app/dashboard. Only DASH-02, DASH-09 and DASH-12 plus their read-only prerequisites were exercised. Account/office IDs and Member/Admin role were not exposed or independently verified in these screens; no second-office session was available in the connected browser inventory.

Build prerequisite: Vercel's authenticated deployment lookup for `notifica-staging.vercel.app` returned READY deployment `dpl_6deJnsUppX9RUVkkqovxK46NuhP6`, immutable hostname `notifica-staging-as71wvuhr-notifica-ia.vercel.app`, commit `41f0a7e0a174f4a87dbd224b837455ec47b71592`, branch `codex/FEA_10_11`. Vercel labels this staging project's target `production`; this run tested the staging domain only. The live dashboard DOM referenced `/_next/static/chunks/app/(protected)/dashboard/page-b4a1c70bfb042506.js`. Local working-tree changes were not treated as deployed behavior.

| Selected test | Overall result | Observed functional evidence and remaining limitation |
| --- | --- | --- |
| DASH-02 | **BLOCKED** | **PASS** for each of four dashboard-origin searches: exact `C-1001-2026` with Enter; exact with Buscar ROL; `  c-1001-2026  ` with Enter; the same lowercase/surrounding-space input with Buscar ROL. Each navigated to `/roles/cmvzkxwft0002gs1inl4z7dqx`, heading `C-1001-2026`, case `Banco Estado/Perez`, lawyer Pedro, procurador Carmencita. The persisted workspace showed Vicente Perez and matias perez. **BLOCKED** for the required similarly named ROL in another office: no verified Office B counterpart/session was available. These four successful searches alone do not establish office isolation. |
| DASH-09 | **BLOCKED** | Live metrics after a full page reload remained **68 Pendientes; 66 Atrasadas; 19 Recibos sin pagar / $410.000; 22 Faltan estampos; 2 Documentos recientes**. Pending, overdue, unpaid and missing-estampo detail tables contained 68, 66, 19 and 22 data rows respectively. **PASS** for independent unpaid reconciliation: Gestión de Recibos → Estado → Sin pagar → Aplicar filtros returned the same 19 receipt identifiers, all displayed as Sin pagar, with amounts summing to $410.000. **PASS** for the sampled recent-document reconciliation: the two dashboard documents were Estampo 44 Ejecutivo and Recibo R-2026-000136, both created 03/11/2026 18:36 and present in C-1001-2026's persisted workspace. The overdue table ranged from 21/11/2025 (349 days) to 30/09/2026 (36 days); the two newest pending rows were dated 01/11/2026. **BLOCKED** for exact 14-day overdue inclusion/exclusion and exact 7-day recent-document inclusion/exclusion: no verified fixtures immediately before/on/after those cutoffs were available. All pending/missing-estampo records were not independently enumerated in every case workspace; matching a badge to its own detail count is only a consistency check, not complete acceptance. |
| DASH-12 | **FAIL** | All three queues were opened and all three sort options were exercised in each: Actividad mas reciente, Actividad mas antigua, Mas atrasada. They changed the visible notification order and reset the displayed page to 10 rows. Latest receipt/continue entry was matias perez in C-1001-2026; oldest and most-overdue samples were historical C-0007-2025 notifications. **PASS** for tested pagination: Continue loaded 10 → 20 → 30 → 40 → 41 distinct notification URLs; missing receipt 10 → 19; missing estampo 10 → 20 → 22. Earlier page prefixes were preserved, no notification URL repeated, and Cargar mas disappeared at exhaustion. The 41 Continue URLs exactly equaled the union of the 19 missing-receipt and 22 missing-estampo URLs. **PASS** for Continue's matias perez link opening Datos de ejecución, Paso 1 de 3, and for the latest missing-estampo link opening Generar estampo, Paso 3 de 3, for notification `fcbd0344-7e1c-428f-b3ea-01925d1bba8b` in `QA-P9-E2E-UI-1788191241191-746F8A14`; the latter loaded the content editor and Generar estampo control. **FAIL** for missing-receipt queue entry described in D-DASH12-001. Queue rows do not display the underlying activity timestamps, so complete per-record sort correctness was not independently certified. |

Independent unpaid receipt identifiers reconciled between dashboard and receipt management: `R-2026-000136`, `R-2026-000135`, `R-2026-000134`, `R-2026-000133`, `R-2026-000132`, `R-2026-000130`, `R-2026-000128`, `R-2026-000127`, `R-2026-000126`, `R-2026-000125`, `R-2026-000098`, `R-2026-000097`, `R-2026-000085`, `R-2026-000084`, `R-2026-000068`, `R-2026-000006`, `QA-UNPAID-001`, `PH4-1781062563367-V2`, `PH4-1781062563367-V1`.

#### D-DASH12-001 — Missing-receipt queue opens an unusable existing notification flow

**Result: FAIL; priority P1; reproduced twice on the build above.**

1. Open the dashboard, with no shared filters applied.
2. Click **Generar recibo faltante → Abrir cola** (19 pendientes).
3. Select **Mas atrasada**.
4. Open the first entry: **C-0007-2025 | Sin ejecutado — Busqueda positiva | paso 2**, listing missing ejecutado/address/comuna/banco/arancel/estampo_type.
5. The link targets `/roles/cmixo4f46000d9mk74ohyrkbd?tab=diligencias&diligenciaId=cmj8x8d6h0001jgoexzlc3koq&notificacionId=cmjad9wnp000tf81qoa60q7o3&step=2`.
6. Wait for the wizard's initial loading state to finish. **Datos del recibo — Paso 2 de 3** displays **“Flujo de notificacion no encontrado o incompleto”**. Receipt generation controls remain disabled. The persisted workspace shows notification reference **CMJAD9WN**, created 17/12/2025 15:50, Ejecutado pendiente, and text indicating execution is already registered.

Expected: a queue entry opens a usable workflow for its intended notification/step, or provides an actionable prerequisite-repair path. Actual: the listed actionable entry leads to an incomplete-flow error and cannot continue. Closing without saving, returning to the dashboard and repeating steps 2–6 reproduced the same error. A browser screenshot also visibly confirmed the error during execution; the reproducible identifiers and exact message are retained here. Root cause was not diagnosed and no fix was attempted.

Persistence/artifact handling: underlying case, notification, receipt and document metadata were read through the software UI; dashboard totals were rechecked after reload. Wizards were closed without saving. These selected cases require opening queue steps, not generating a new receipt/PDF; no generation, payment, email, signature, deletion or data repair was submitted, and no new artifact is claimed as verified. No code inspection, mocked tests or local test suite was counted as a PASS. No application/schema implementation was performed, so the implementation-only Prisma startup rule was not invoked. Other test rows retain their previous state.

## 4. Basic catalogs

Sources: Ajustes Bancos, Materias, Tribunales, Comunas and Diligencias pages and corresponding APIs. The visible basic pages primarily expose **create and delete**; do not assume an edit button simply because a PUT endpoint exists. Actor: Member and Admin, pending the permission decision F08.

Run CAT-01 through CAT-07 **separately for each of the five catalogs**. Diligencias here means diligence TYPES, not a case's performed work.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| CAT-01 | P1 | Open catalog, inspect empty/list state, create a uniquely named item and refresh. | Exactly one office-scoped item persists and appears in the correct list. |
| CAT-02 | P1 | Cancel/close creation with text entered, then reopen and create a different item. | Cancel does not save; prior form state does not accidentally contaminate a new record. |
| CAT-03 | P1 | Submit blank/space-only name, duplicate name, accented/long name and HTML-like text. | Clear validation or approved duplicate rule; safe plain-text display; no server crash or unexplained truncation. |
| CAT-04 | P0 | Double-submit creation and simulate a lost response before retrying. | No unintended duplicate configuration; uncertain outcome can be reconciled by reloading. |
| CAT-05 | P1 | Start deleting an unused item; cancel; then confirm and refresh. | Cancel preserves it; confirmed deletion affects only that item and disappears persistently. |
| CAT-06 | P0 | Delete an item referenced by a case, executed party, lawyer, template/price or diligence. | Dependency behavior is understandable and preserves case/document integrity; no unexpected cascade loss or raw database error. |
| CAT-07 | P1 | After creation/deletion, open an already-used case form or wizard in another tab. | Selectors refresh appropriately; deleted choices cannot be submitted as valid records. |
| CAT-08 | P1 | In Bancos, open Aranceles for bank A, close, then open bank B. | Price modal is scoped to the selected bank; no previous bank's edits leak across. |
| CAT-09 | P0 | As B, request A's catalog item by ID for read/update/delete using an engineer-assisted test. | No cross-office data or mutation. Repeat for every catalog, not only banks. |

## 5. Lawyers and procuradores

Sources: Ajustes Abogados/Procuradores, `components/ProcuradorSelector.tsx`, related APIs and `lib/procuradorBanks.ts`.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| CONTACT-01 | P1 | Create a lawyer with name, phone, email and one bank; then with multiple banks. | Data and bank associations persist and are available to demand creation and pricing. **2026-11-05: PASS in the supplied testing session; both variants persisted and were selectable in demand creation and pricing. See account-scoped execution below.** |
| CONTACT-02 | P1 | Create a lawyer with minimum allowed fields; submit blank name and invalid email. | Required/optional rules are clear and consistent between form and server. |
| CONTACT-03 | P1 | Link existing procuradores while creating/editing a lawyer. | Selected associations persist without duplicate links; non-selected parties are not linked. |
| CONTACT-04 | P1 | Add several new procurador rows inside the lawyer form; remove one and save. | Only retained, valid rows are created and linked; blanks do not create empty contacts. |
| CONTACT-05 | P1 | Edit lawyer name/email/phone; explicitly clear previously saved optional fields. | Clearing really clears them after reload; omitted payload fields do not silently keep old values. |
| CONTACT-06 | P0 | Remove all/one bank or procurador association from a lawyer already used by cases. | Actual saved links match the form; affected cases remain intelligible and invalid dependent selections are handled explicitly. |
| CONTACT-07 | P1 | Search lawyers by partial name, accents and no matches; open edit through any existing deep link. | Correct records and edit target; no stale modal after changing records. |
| CONTACT-08 | P0 | Delete unused and referenced lawyers, testing Cancel and Confirm and a failed response. | Approved dependency rule; list restores on failure; no orphaned case or false deletion success. |
| CONTACT-09 | P1 | Create a procurador with contact details/notes, select one and multiple lawyers, then select derived banks. | Bank choices derive from selected lawyers and the saved eligible subset matches selection. **2026-11-05: PASS in the supplied testing session; single/multiple-lawyer variants and selected bank subset verified after reload. See account-scoped execution below.** |
| CONTACT-10 | P1 | Change lawyers in the procurador editor so a selected bank is no longer eligible. | Ineligible bank is removed/rejected; it cannot survive invisibly in the saved association. |
| CONTACT-11 | P1 | Re-create an existing procurador through the supported reuse flow. | Existing-record reuse is clear; no unintended duplicate person or loss of original links. |
| CONTACT-12 | P1 | Edit procurador contact details, notes, lawyers and bank subset; clear optional values. | Updated and cleared values persist and later appear in selectors/email previews. |
| CONTACT-13 | P1 | Filter procuradores by searchable bank dropdown, lawyer, name and active state where offered; switch recent/name sort. | Correct intersection, reset and ordering; closing dropdown and clearing bank work. |
| CONTACT-14 | P0 | Deactivate/reactivate a procurador; revisit existing cases and start a new case/email selection. | Historical references remain readable; eligibility follows the approved inactive-contact rule consistently across UI and APIs. |
| CONTACT-15 | P1 | Select/change bank, lawyer and procurador in a demand using overlapping association fixtures. | Only compatible contacts are selectable; changing a parent clears stale child choices. **2026-11-05: PASS in the supplied testing session; compatibility and stale-child clearing verified in Nueva Demanda without saving a case. See account-scoped execution below.** |
| CONTACT-16 | P1 | Use receipt email shortcut links to edit a lawyer/procurador, if offered in the rendered candidate. | Correct contact opens and corrected address is used on a refreshed preview. If the candidate exposes no shortcut, record N/A with evidence. |

### Selected contacts execution — 2026-11-05 (account-scoped)

Tester: Codex through the real Chrome desktop UI on Windows. Target: https://notifica-staging.vercel.app/; supplied authenticated testing account visibly identified as `notificaia@gmail.com` in Ajustes. Execution approximately 06:11–06:18 America/Los_Angeles (14:11–14:18 UTC). Only CONTACT-01, CONTACT-09, CONTACT-15 and their necessary contact/bank/pricing prerequisites were exercised. Vercel deployment lookup reconfirmed READY deployment `dpl_6deJnsUppX9RUVkkqovxK46NuhP6`, commit `41f0a7e0a174f4a87dbd224b837455ec47b71592`, branch `codex/FEA_10_11`, behind the staging alias. No source inspection or mocked test was counted as functional evidence.

**Scope of PASS:** results below apply to the supplied logged-in account and the listed variants. **BLOCKED — separate Member/Admin repeat:** the account's canonical role was not exposed in these screens, and a second authenticated role was not supplied. These results do not certify the checklist's general two-role coverage requirement or office isolation.

The following fictitious fixtures were created through Ajustes and retained for review. Existing Banco Estado and Banco de Chile were reused; existing contacts and prices were not edited.

| Fixture | Saved contact details | Saved associations |
| --- | --- | --- |
| `QA-1105-0614 Abogada Uno` | `qa1105-lawyer-one@example.com`; `+1 202 555 0101` | Banco Estado only; lawyer ID `50` was visible as the demand selector option value. |
| `QA-1105-0614 Abogado Multi` | `qa1105-lawyer-multi@example.com`; `+1 202 555 0102` | Banco Estado and Banco de Chile. |
| `QA-1105-0614 Procuradora Una` | `qa1105-proc-one@example.com`; `+1 202 555 0103`; notes: `CONTACT-09 single lawyer / Banco Estado test fixture; fictitious data.` | Abogada Uno only; Banco Estado selected. |
| `QA-1105-0614 Procurador Multi` | `qa1105-proc-multi@example.com`; `+1 202 555 0104`; notes: `CONTACT-09 multiple lawyers / Banco de Chile only; fictitious data.` | Abogada Uno and Abogado Multi; Banco de Chile selected, Banco Estado deliberately unselected. |

| Test / variant | Result in supplied account | Observed software evidence |
| --- | --- | --- |
| CONTACT-01 — one bank | **PASS** | Added Abogada Uno with name/email/phone and Banco Estado. Reloaded `/ajustes/abogados`, reopened Editar and visually confirmed the original email/phone; Banco Estado was checked and Banco de Chile unchecked. Banco Estado → Aranceles → Aranceles por Abogado listed the new lawyer and accepted its selection. Nueva Demanda with Banco Estado listed and accepted Abogada Uno. |
| CONTACT-01 — multiple banks | **PASS** | Added Abogado Multi with name/email/phone and both banks. Reloaded/reopened Editar: original contact fields and both bank checkboxes persisted. Both banks' Aranceles por Abogado selectors listed and accepted Abogado Multi; Banco de Chile excluded Abogada Uno. Abogado Multi was selectable in demand creation for each bank. No price was added or changed; this check verifies availability for pricing, not price calculation. |
| CONTACT-09 — one lawyer | **PASS** | Before choosing a lawyer, creation showed Sin bancos derivados. Selecting Abogada Uno exposed only Banco Estado. Saved Procuradora Una with contact details, notes, one lawyer and that bank. After full reload and reopening Editar, contact details/notes, one checked lawyer and checked Banco Estado persisted. |
| CONTACT-09 — multiple lawyers / eligible subset | **PASS** | Selecting Abogada Uno plus Abogado Multi derived exactly Banco Estado and Banco de Chile, with no duplicate Banco Estado despite overlapping lawyers. Selected only Banco de Chile and saved Procurador Multi. After full reload and reopening Editar, both lawyers remained checked, Banco de Chile remained checked, and Banco Estado remained unchecked; original email/phone/notes also persisted. |
| CONTACT-15 — compatible selections | **PASS** | In `/demandas/nueva`, Banco Estado listed both new lawyers. With Abogada Uno, the procurador selector contained Procuradora Una and excluded Procurador Multi (whose saved bank subset is Chile only). With Banco de Chile, Abogada Uno was absent; Abogado Multi was selectable and its procurador selector contained Procurador Multi, excluding Procuradora Una. Both compatible procurador options were actually selected. |
| CONTACT-15 — change lawyer | **PASS** | Selected Banco Estado → Abogada Uno → Procuradora Una, then changed to Abogado Multi. After the procurador lookup completed, the previous procurador was cleared, neither incompatible fixture was offered, and the selector showed Selecciona un procurador. |
| CONTACT-15 — change bank | **PASS** | Selected Banco Estado → Abogada Uno → Procuradora Una, then changed to Banco de Chile. Both lawyer and procurador selections cleared; Abogada Uno disappeared from the lawyer options. Then selected Chile → Abogado Multi → Procurador Multi and changed back to Banco Estado. Both previous selections cleared again. Reselecting Abogado Multi under Estado produced no compatible fixture procurador; the Chile-only procurador did not survive or become selectable. |

Final persistence verification: fresh navigation to both contact management pages found **exactly one row for each of the two new lawyers and each of the two new procuradores**. Lawyer rows also reflected the newly saved procurador links; procurador rows showed the exact saved lawyer sets and bank subsets above, with both procuradores Activo. Reopened editor screenshots visually verified the fictitious email and phone fields (these fields were redacted in DOM snapshots), while DOM snapshots verified checkboxes and notes. The final visible procurador list was filtered to `QA-1105-0614` and showed both retained records and their associations.

CONTACT-15 was performed in an unsaved demand form, then exited through Cancelar; no demand was submitted or existing case changed. No email, receipt, PDF, signature or export was generated: those artifacts are not required by these selected contact tests. No reproducible functional defect was observed within this account-scoped run, and no fix was attempted. No schema or implementation changes were made, so the implementation-only Prisma startup sequence was not invoked. Results for other CONTACT rows remain unchanged.

## 6. Aranceles and price defaults

Source: Bancos → Aranceles modal, `lib/utils/aranceles.ts`, receipt generation.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| RATE-01 | P0 | Add/save a bank-wide price for a custom estampo; reopen modal and generate a receipt. | Correct amount and bank-default source are used. **2026-11-05: PASS in supplied account; saved $12.345, reopened, generated and visually verified receipt R-2026-000137. See execution below.** |
| RATE-02 | P0 | Repeat for a wizard category. | Category price resolves for its supported templates without using an unrelated custom-estampo price. **2026-11-05: PASS for the exposed Busqueda Negativa (Wizard) pricing category in supplied account; saved $23.456 and verified R-2026-000138, distinct from custom price. See execution below.** |
| RATE-03 | P0 | Add lawyer-specific prices for custom and wizard cases that differ from bank prices. | Lawyer override wins only for the chosen lawyer/bank/template combination. **2026-11-05: PASS in supplied account; custom/wizard override PDFs and other-lawyer/bank/template controls verified. See execution below.** |
| RATE-04 | P1 | Switch bank/lawyer tabs and selected lawyer after editing a row. | Correct row set loads; unsaved edits do not update another scope. |
| RATE-05 | P1 | Add an unsaved row, change template/category, edit amount, save, delete and cancel deletion. | Each control affects the intended row; refreshed values agree with the submitted action. |
| RATE-06 | P0 | Enter zero, negative, blank, malformed and Chilean thousands-formatted amounts; attempt duplicate price keys. | Valid zero is preserved if allowed; invalid money rejected; duplicate-rule errors are clear and no wrong amount is charged. **2026-11-05: PASS in supplied account; all listed input variants and custom/wizard duplicate keys exercised, persisted zero and formatted-amount PDFs verified. See execution below.** |
| RATE-07 | P0 | Use a bank/template with no price and enter a manual receipt amount without saving a default. | Only this receipt uses the amount; no price record is silently created. **2026-11-05: PASS in supplied account; manual $56.789 PDF verified, fresh flow remained unpriced and reloaded price scopes contained no new default. See execution below.** |
| RATE-08 | P0 | Enter a manual amount and explicitly opt to save it as default; repeat with an existing override. | Default scope and overwrite safeguards are clear; unrelated bank/lawyer rates remain unchanged. |
| RATE-09 | P1 | Change/delete a price while another user has a receipt wizard open. | Refresh/reselection and submission reconcile the current price or explicit manual choice; no silent stale-price claim. |

### Selected pricing execution — 2026-11-05 (account-scoped)

Tester: Codex through the real Chrome desktop UI on Windows, using the supplied authenticated testing account `notificaia@gmail.com`. Target: https://notifica-staging.vercel.app/. Execution approximately 06:21–07:01 America/Los_Angeles (14:21–15:01 UTC). Authenticated Vercel lookup reconfirmed READY deployment `dpl_6deJnsUppX9RUVkkqovxK46NuhP6`, commit `41f0a7e0a174f4a87dbd224b837455ec47b71592`, branch `codex/FEA_10_11`. Only RATE-01, RATE-02, RATE-03, RATE-06, RATE-07 and necessary fictitious fixture creation/receipt-generation prerequisites were exercised. No application source inspection, mocks or local test suite was counted as PASS.

**Scope of PASS:** the supplied account, custom templates and wizard pricing category identified below. **BLOCKED — separate Member/Admin repeat:** no independently identified second-role session was supplied; canonical account role was not exposed in the tested screens. These results do not certify general two-role or cross-office coverage. The pricing UI offered one wizard category, **Busqueda Negativa (Wizard)**; its receipt pricing path was tested. Estampo text/content generation and all downstream document-template variants were not certified by these pricing checks.

#### Retained isolated fixtures and persisted prices

Created through the software UI, without editing existing office banks, contacts, cases, templates or prices:

- Banks: `QA-RATE-1105-0621 Banco A` and `QA-RATE-1105-0621 Banco B`.
- Lawyers: `QA-RATE-1105-0621 Abogado`, linked to both test banks, and `QA-RATE-1105-0621 Control`, linked only to test bank A.
- Cases: [QA-RATE-1105-0621-A](https://notifica-staging.vercel.app/roles/cmw3naqqd0005dgnez2zggxkv) (bank A / override lawyer), [QA-RATE-1105-0621-CONTROL](https://notifica-staging.vercel.app/roles/cmw3o1tj90004nzdp1g0o58tt) (bank A / control lawyer), [QA-RATE-1105-0621-B](https://notifica-staging.vercel.app/roles/cmw3o54nw000334k4t11ghq1h) (bank B / override lawyer).
- Each case used fictitious Ejecutado QA Precios, RUT `11111111-1`, Calle QA 100, QA-P9 Santiago, existing QA-P9 Tribunal Civil, and one new QA-P9 Notificacion diligence dated 05/11/2026. Separate notification cycles were created only as needed for pricing/receipt checks. No email, payment, signature, cancellation or deletion was submitted.

| Bank / price scope | Custom template / wizard category | Saved CLP |
| --- | --- | --- |
| Bank A default | Notificación art. 52 | 12,345 |
| Bank A default | Busqueda Negativa (Wizard) | 23,456 |
| Bank A / QA-RATE-1105-0621 Abogado override | Notificación art. 52 | 34,567 |
| Bank A / QA-RATE-1105-0621 Abogado override | Busqueda Negativa (Wizard) | 45,678 |
| Bank B default | oposicion al embargo | 0 |

All five values were verified in reopened pricing scopes after fresh navigation/reload. Bank A's control lawyer had **no override records**. `44 Ejecutivo` had **no default or override** in the tested bank A/control-lawyer combination before or after its manual receipt.

#### Functional results

| Test / variant | Result | Actual software outcome |
| --- | --- | --- |
| RATE-01 — bank-wide custom default | **PASS** | Bank A → Aranceles → bank-default tab → Agregar Arancel Legacy → Notificación art. 52 → `12.345` → Guardar. Reloaded/reopened: one saved row at 12.345. In the new case, before any lawyer override existed, step 2 suggested `12345` with “Monto sugerido por el arancel configurado.” Generated R-2026-000137; its rendered PDF showed correct case/lawyer/template and Valor Gestión / TOTAL A PAGAR $12.345. |
| RATE-02 — wizard category default | **PASS** | Added Busqueda Negativa (Wizard) at `23.456` in bank A's default scope. Reloaded/reopened confirmed 23.456. A separate notification's step 2 suggested `23456` for that wizard category; generated R-2026-000138 and visually verified PDF total $23.456. It did not use the unrelated custom-template price of $12.345. |
| RATE-03 — custom lawyer override | **PASS** | Added Notificación art. 52 at `34.567` for bank A / QA-RATE-1105-0621 Abogado, while bank default remained 12.345. A fresh notification suggested `34567`; generated R-2026-000139 and visually verified PDF total $34.567. After a later full reload, the same override row persisted at 34.567. |
| RATE-03 — wizard lawyer override | **PASS** | Added Busqueda Negativa (Wizard) at `45.678` for the same bank/lawyer, distinct from its 23.456 bank default and 34.567 custom override. A fresh notification suggested `45678`; generated R-2026-000140 and visually verified PDF total $45.678. The reloaded override remained 45.678. |
| RATE-03 — other lawyer control | **PASS** | With bank A / Control lawyer, custom Notificación art. 52 suggested `12345`, not 34567; generated R-2026-000141, whose PDF showed Control lawyer and $12.345. Another fresh notification with Busqueda Negativa (Wizard) suggested `23456`, not 45678; this wizard-category control was observed in the form, then switched to the unpriced manual template for RATE-07. No second wizard control PDF is claimed. Reloaded Control-lawyer pricing scope remained empty. |
| RATE-03 — other bank / template controls | **PASS** | In bank B's case with the same override lawyer, both Notificación art. 52 and Busqueda Negativa (Wizard) resolved to an empty manual amount; bank A's defaults and overrides did not leak across banks. In bank A / Control, switching to unpriced `44 Ejecutivo` also cleared the previous suggested wizard amount. No cross-bank price was charged in these negative controls. |
| RATE-06 — negative / blank / malformed | **PASS** | In bank B's new `oposicion al embargo` row, separately submitted `-1500`, empty string and `abc`. Each remained unsaved and displayed **“El monto debe ser un número válido”**. No receipt was generated from invalid input. The row was then explicitly given valid zero for the next check. |
| RATE-06 — zero | **PASS** | Entered `0`, saved, reloaded/reopened: exactly one bank B `oposicion al embargo` row at 0. In the bank B receipt flow, selecting that template suggested `0` and enabled generation. Generated R-2026-000143; rendered PDF showed Valor Gestión $0, Otros $0, TOTAL A PAGAR $0. Receipt management retained $0 after reload; no nonzero fallback was charged. |
| RATE-06 — Chilean thousands formatting | **PASS** | Price input `12.345` persisted as 12,345 CLP and generated R-2026-000137 at $12.345. Manual receipt input `56.789` generated R-2026-000142 at $56.789. These were verified in actual rendered PDFs and persisted receipt-management rows, not just formatted input controls. |
| RATE-06 — duplicate custom key | **PASS** | In bank B, attempted a second `oposicion al embargo` price at `999` after the zero row existed. UI rejected it with **“Este estampo ya tiene un arancel definido para este banco”**. Closing/reloading/reopening left exactly one saved row at zero; the attempted 999 did not overwrite it. |
| RATE-06 — duplicate wizard key | **PASS** | In bank A, attempted another Busqueda Negativa (Wizard) default at `999`. UI rejected it with **“Este categoría wizard ya tiene un arancel definido para este banco”**. After closing/reloading/reopening, only the original custom 12.345 and wizard 23.456 default rows remained; no 999 row persisted. |
| RATE-07 — manual amount, no saved default | **PASS** | In bank A / Control's new notification, chose unpriced `44 Ejecutivo`, entered `56.789`, and left **“Guardar este monto como arancel predeterminado para este abogado” unchecked**. Generated R-2026-000142; its PDF showed the correct case/lawyer/template and total $56.789. In a subsequent fresh notification with the same bank/lawyer/template, the amount remained blank after lookup, generation was disabled until an amount was supplied, and the UI explained that it would populate only if a configured price existed. Closed this probe without generating another receipt. Reloaded bank-default and Control-lawyer price lists confirmed no `44 Ejecutivo` record had been silently created. |

#### Persisted receipt artifacts

Every PDF below was opened through **Ver recibo** and visually inspected in Chrome's PDF viewer, including receipt number, case/lawyer identity, template/category label, Valor Gestión and TOTAL A PAGAR. Each had one rendered page. Fresh receipt-management navigation, filtering ROL `QA-RATE-1105-0621`, then a full reload and reapplication of the filter returned exactly these seven receipts with the same amounts. No duplicate receipt was created by the retrieval checks.

| Receipt | Verified purpose / total | Persisted PDF artifact |
| --- | --- | --- |
| R-2026-000137 | Bank A custom default — $12.345 | [Open verified PDF](https://notifica-staging.vercel.app/api/documentos/f0cbd1a2-9d6b-4d91-8532-7a0abf6d9e05/download?mode=inline) |
| R-2026-000138 | Bank A wizard default — $23.456 | [Open verified PDF](https://notifica-staging.vercel.app/api/documentos/4d2063ab-b934-47df-ba93-0ae8d5f33774/download?mode=inline) |
| R-2026-000139 | Bank A custom lawyer override — $34.567 | [Open verified PDF](https://notifica-staging.vercel.app/api/documentos/6a4d6029-e371-4d8a-9862-1b2721af534d/download?mode=inline) |
| R-2026-000140 | Bank A wizard lawyer override — $45.678 | [Open verified PDF](https://notifica-staging.vercel.app/api/documentos/b8638e94-405c-46a4-96c9-f675513deee4/download?mode=inline) |
| R-2026-000141 | Other-lawyer control, bank custom default — $12.345 | [Open verified PDF](https://notifica-staging.vercel.app/api/documentos/ac5b7777-8b58-4a24-a498-a1f8d671f38a/download?mode=inline) |
| R-2026-000142 | Receipt-only manual amount — $56.789 | [Open verified PDF](https://notifica-staging.vercel.app/api/documentos/c5ee9fec-16a5-46c1-87b9-d162610717dd/download?mode=inline) |
| R-2026-000143 | Bank B zero price — $0 | [Open verified PDF](https://notifica-staging.vercel.app/api/documentos/3adb2679-b276-48ff-aa33-fb76de1418a3/download?mode=inline) |

Artifact retrieval limitation: the first Documentos → Descargar attempt was not captured by the automation's download event and yielded no verified local file. It was not counted as a successful local download or diagnosed as an application defect. The existing receipt was subsequently retrieved via Ver recibo and its actual persisted PDF rendered successfully, as did all six later artifacts. No regeneration was used as a retrieval workaround. Artifact links above require the authorized staging session.

No reproducible pricing defect was observed within the listed variants; no fix was attempted. All isolated fixtures, five saved rates, seven receipt documents and the ungenerated manual recheck notification remain for review. The two custom/wizard override receipts and their original bank-default receipts remain separate history. No schema or implementation work was performed, so the implementation-only Prisma startup sequence was not invoked. Other RATE rows retain their prior state.

## 7. Estampo template administration

Sources: Ajustes Estampos, custom editor, wizard editor, variables toolbar and custom/reset endpoints.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| TPL-01 | P1 | Open templates and inspect custom models and wizard models separately. | Correct names and available actions; base and office-customized versions are distinguishable. |
| TPL-02 | P1 | Create a custom model with name/content; cancel another creation; submit empty name/content. | Save/cancel/validation are truthful and usable; no unusable empty document template enters operational use unnoticed. |
| TPL-03 | P1 | Insert each offered variable at cursor position and over a text selection. | Correct token inserted once, text preserved, cursor remains useful. |
| TPL-04 | P1 | Edit custom-model content and save; reopen and use it in a case. | Saved content persists and a new document uses it; existing generated files retain their original content. **2026-11-05: PASS in supplied account; exact edited text persisted, new PDFs used VERSION DOS, original PDF still showed VERSION UNO after reopening. See execution below.** |
| TPL-05 | P1 | Preview a custom model before saving. | PDF opens with clearly understood sample data; preview does not create a case document or overwrite the saved model. |
| TPL-06 | P0 | Generate with every supported variable, repeated variables, unknown variable, accents, long paragraphs and line breaks. | Actual case PDF has correct substitutions and no silent truncation or accidental literal placeholder. Unknown-token handling is explicit. **2026-11-05: FAIL — D-TPL06-001: unknown token silently retained literally in two generated PDFs. Text/layout subresults and blocked graphic/non-empty optional-field coverage recorded below.** |
| TPL-07 | P0 | Delete unused and already-used custom models; cancel first. | Confirmation is effective; dependency handling protects existing documents and explains any blocked deletion. |
| TPL-08 | P1 | Open each wizard template, change office text and save. | Office override persists and only that office's new generated documents change. |
| TPL-09 | P1 | Use wizard variable controls and the `$Pagina` page-break token. | Saved/generated output has intended variables and page breaks without blank/overlapping pages. |
| TPL-10 | P0 | Reset a customized wizard template to default, testing Cancel and Confirm. | Cancel preserves override; Confirm restores the base for this office only; historical PDFs are unchanged. |
| TPL-11 | P1 | Switch templates while editing, close editor, reopen and reload page. | Saved versus unsaved behavior is predictable; no text from one template is saved into another. |
| TPL-12 | P1 | Keep a receipt/estampo wizard open while a colleague edits a template. | Updated catalog/content is obtained when appropriate; selected template identity is not silently replaced. |
| TPL-13 | P0 | Remove each required non-derived template variable and save; restore it and save again. | Missing-variable validation names the problem and protects the saved model; derived/wizard-answer fields follow their separate rules. **2026-11-05: PASS in supplied account; 53 removal/protection/restoration checks across all nine wizard models, plus derived/answer controls; all original texts verified after reload. See execution below.** |

### Selected template execution — 2026-11-05 (account-scoped)

Tester: Codex through the real Chrome desktop UI on Windows, using the supplied authenticated staging account `notificaia@gmail.com`. Completed approximately 07:49 America/Los_Angeles (15:49 UTC). Target: https://notifica-staging.vercel.app/. Vercel lookup reconfirmed READY deployment `dpl_6deJnsUppX9RUVkkqovxK46NuhP6`, commit `41f0a7e0a174f4a87dbd224b837455ec47b71592`, branch `codex/FEA_10_11`. Scope: TPL-04, TPL-06, TPL-13 and necessary isolated template/case/receipt prerequisites. Read-only source references clarified which variables are derived or wizard answers; **all recorded functional outcomes below came from actual UI saves, reloads and rendered case PDFs**, not source inspection.

**Scope of PASS:** supplied account and variants below. **BLOCKED — separate Member/Admin repeat:** the canonical account role was not displayed in these screens and no second-role session was supplied. No two-role or office-isolation certification is claimed.

#### Fixtures and generated artifacts

Created custom model **QA-TPL-1105-0706 Águila** and fictitious case [QA-TPL-1105-0706-A](https://notifica-staging.vercel.app/roles/cmw3pa0wj00028d7amnxz7fo2). Reused the isolated pricing bank/lawyer from the preceding selected test group; did not change their prices. Case source data visibly persisted as María José Muñoz Álvarez, RUT `11111111-1`, Pasaje Ñandú 123, QA-P9 Santiago, QA-P9 Tribunal Civil, cuantía $1.234.567, lawyer QA-RATE-1105-0621 Abogado and receiver QA-1030 Receptor Álvarez. One new QA-P9 Notificacion diligence and three notification cycles were necessary to generate the baseline, edited-text probe and verified-time repeat. Prerequisite receipts R-2026-000144 / 145 / 146 used manual amounts 101 / 102 / 103 CLP without saving rates.

| Artifact | Actual inspection / persistence evidence |
| --- | --- |
| [Baseline VERSION UNO PDF](https://notifica-staging.vercel.app/api/documentos/cmw3pawa000017awnme7fgckp/download?mode=inline) | One-page case document generated before editing the model. Visually inspected, then reloaded and inspected again after VERSION DOS generation: still VERSION UNO, original short body and FIN VERSION UNO; not replaced by the new template text. |
| [Edited VERSION DOS PDF](https://notifica-staging.vercel.app/api/documentos/cmw3pfmjm000110c72ydft84l/download?mode=inline) | Three-page actual case PDF. Reviewed across all three pages: populated text variables/repeated tokens, unknown literal, accented text, both long-paragraph end markers, consecutive line breaks and explicit final page marker. |
| [Verified-time VERSION DOS repeat PDF](https://notifica-staging.vercel.app/api/documentos/cmw3pzga800018kk35ssnpil8/download?mode=inline) | Separately generated three-page artifact; page 1 inspected to verify HORA_DILIGENCIA `[11:07]`, amount `$103`, other populated variables and reproduction of the unknown literal. This repeat's remaining pages were not independently re-reviewed; full layout review used the preceding artifact. |

All three estampos and all three prerequisite receipts remained listed in the case's Documentos tab after a full page reload. Each estampo is a separate version-1 document on its own notification; template VERSION UNO/DOS markers describe model content, not document-version counters. Artifact URLs require an authorized staging session. PDFs were verified through the actual application viewer; no local download/checksum verification is claimed.

#### TPL-04 — saved edit and historical content: PASS

1. Created the isolated model with VERSION UNO, case/party/address/date/time variables and FIN VERSION UNO; reloaded and reopened it to verify saved content.
2. Used it through the normal execution → receipt → estampo flow, generating the baseline PDF above.
3. In Editar modelo, replaced the content with VERSION DOS, all toolbar variables and the TPL-06 probes below. Guardar cambios displayed **“Modelo actualizado correctamente.”**
4. Reloaded/reopened the model; compared its actual textarea value with the submitted content: **exact match, 4,955 characters**.
5. A new notification generated a new document containing VERSION DOS. Reloading the original document URL still rendered VERSION UNO. Thus the saved edit affected new generation without rewriting the previously generated file's observed content.

#### TPL-06 — substitutions and document content: FAIL

The edited model included all **16 text variables** exposed by the custom editor toolbar, the three additional controls `$firma`, `$sello`, `$Pagina`, repeated name/ROL variables, unknown `$qa_variable_desconocida_1105`, accented text, two long paragraphs, explicit line breaks and final marker `FIN VERSION DOS QA-TPL-1105-0706`.

| Variable / variant | Result | Actual rendered outcome |
| --- | --- | --- |
| `$nombre_ejecutado`, `$rut_ejecutado` | **PASS** | María José Muñoz Álvarez and `11111111-1`. Repeated name tokens also substituted correctly. |
| `$direccion_ejecutado`, `$solo_direccion_ejecutado`, `$solo_comuna_ejecutado` | **PASS** | Full `Pasaje Ñandú 123, QA-P9 Santiago`; street-only `Pasaje Ñandú 123`; comuna-only `QA-P9 Santiago`. |
| `$rol`, `$tribunal`, `$caratula` | **PASS** | QA-TPL-1105-0706-A, QA-P9 Tribunal Civil, and the application's generated bank/party carátula `QA-RATE-1105-0621 Banco A / María José Muñoz Álvarez`. Repeated ROL tokens also substituted. |
| `$fecha_palabras_diligencia`, `$hora_diligencia` | **PASS** for verified-time repeat | Date rendered `cinco de noviembre de dos mil veintiseis`; known persisted native time rendered `11:07` in the final PDF. See time-entry qualification below. |
| `$cuantia`, `$receptor_nombre`, `$abogado_nombre`, `$monto_ejecutado` | **PASS** | `1.234.567`, QA-1030 Receptor Álvarez, QA-RATE-1105-0621 Abogado, and `$102` / `$103` matching the respective notification receipts. |
| `$abogado_direccion`, `$n_operacion` | **BLOCKED** for non-empty-value acceptance | Tokens expanded to empty brackets in the test case, without remaining literal placeholders. This fixture had no supplied lawyer address or operation number, and no corresponding positive-value prerequisite was established through the tested flow. Do not treat blank expansion as certification of non-empty values. |
| `$firma`, `$sello` | **BLOCKED** for non-empty graphical acceptance | Output contained empty FIRMA / SELLO labels. Read-only Configuracion PDF inspection showed existing Predeterminado/Fallback previews broken for both assets: loaded image elements had `naturalWidth: 0` for `/api/ajustes/pdf/assets/firma?revision=114` and `/api/ajustes/pdf/assets/sello?revision=114`. No valid non-empty graphical fixture was available. Settings/assets were not replaced or repaired. |
| Accents, repeats, long paragraphs, line breaks | **PASS** for inspected edited PDF | ÁÉÍÓÚ/áéíóú/Ññ/Üü/¿Qué ocurrió?/¡Acción! rendered legibly. Two 12-repeat long paragraphs wrapped and continued across pages; both end markers were visible. SALTO DE LINEA UNO and DOS remained on separate lines. No observed clipping/overlap or loss of the tested final text markers. |
| `$Pagina` | **PASS** in this custom-model probe | PDF had three pages; PAGINA EXPLICITA FINAL and FIN VERSION DOS appeared on the explicit final page, without a literal `$Pagina`. This is evidence for the selected TPL-06 layout probe, not a separate execution of TPL-09. |
| Unknown `$qa_variable_desconocida_1105` | **FAIL — D-TPL06-001** | Custom model save, generation and both edited PDFs retained the token literally. No unknown-variable validation or explanatory warning appeared. |

Time-entry qualification: the first automated `fill` of the native time control appeared populated but did not survive returning between steps; the first two artifacts consequently had a blank time. A native keyboard increment changed the control to `11:07`, which then persisted across steps and rendered correctly in the final PDF. The earlier blank-time observation was **not classified as a confirmed application defect** after this control check. No application code or saved-model workaround was used.

**D-TPL06-001 — unknown custom-template token silently survives into generated legal PDF (P0, reproduced twice).** Reproduction:

1. In Ajustes → Estampos, edit the retained isolated model QA-TPL-1105-0706 Águila. Its saved body includes `DESCONOCIDA: [$qa_variable_desconocida_1105]`.
2. Save the model; the application confirms the update without naming/rejecting the unknown variable.
3. In the retained case, execute a new notification, generate the prerequisite receipt with this model selected, then generate the estampo from the unchanged resolved content. No unknown-token warning is shown.
4. Open the resulting actual PDF. On page 1, below REPETIDOS, **DESCONOCIDA contains the literal `$qa_variable_desconocida_1105`**. This happened independently in both VERSION DOS artifact URLs above.

Expected: explicit handling of an unknown token before producing the case artifact, with no accidental literal placeholder. Actual: successful save/generation with an unresolved literal token in the persisted PDF. No fix was attempted; the failing isolated model and artifacts are retained for the separate fix batch.

#### TPL-13 — required variables, saved-model protection and restoration: PASS

Preserved every original wizard body before mutation in [wizard-originals.json](audit-artifacts/tpl-2026-11-05/wizard-originals.json). For **each variable in each model below**, the UI test removed that token, clicked Guardar cambios, observed **“Faltan variables requeridas del asistente”** with **“Variable requerida faltante: $<exact_name>”**, closed/reopened the editor to verify the original stored text was protected, restored the original text and saved again, then reopened it to verify restoration. All **53** probes passed these four checks. After all probes and exemption controls, a full page reload and independent reopening of all nine models confirmed their textarea values matched the originals exactly.

Set **A (6 variables)**: `$direccion_ejecutado`, `$hora_diligencia`, `$nombre_ejecutado`, `$solo_comuna_ejecutado`, `$fecha_palabras_diligencia`, `$firma`.

Set **B (5 variables)**: `$hora_diligencia`, `$nombre_ejecutado`, `$solo_comuna_ejecutado`, `$fecha_palabras_diligencia`, `$firma`; the alternate-street model does not require the full-address token.

| Wizard model | Variables tested individually | Removal / named error / stored protection / restored save | Exact original after final reload |
| --- | --- | --- | --- |
| Dirección señalada se encuentra incompleta | Set A — 6 | **PASS for all 6** | **PASS** |
| Falta especificar número de casa | Set A — 6 | **PASS for all 6** | **PASS** |
| Falta especificar número de casa del inmueble señalado | Set A — 6 | **PASS for all 6** | **PASS** |
| Inmueble desocupado y sin moradores | Set A — 6 | **PASS for all 6** | **PASS** |
| No existe la calle en esta comuna | Set A — 6 | **PASS for all 6** | **PASS** |
| No existe la calle en esta comuna + calle alternativa | Set B — 5 | **PASS for all 5** | **PASS** |
| No existe la numeración | Set A — 6 | **PASS for all 6** | **PASS** |
| No fue habido, no es persona conocida | Set A — 6 | **PASS for all 6** | **PASS** |
| No vive en ese domicilio | Set A — 6 | **PASS for all 6** | **PASS** |

Separate-rule controls also **PASS**: removing derived `$tratamiento_corto` in the first model was allowed to save and persisted without that literal token; removing wizard-answer `$numero_casa` in Falta especificar número de casa was likewise allowed. Both original bodies were then restored through Guardar cambios and matched after the final full reload. Variables supplied by wizard answers or derivation were not incorrectly counted in the 53 required-body-token probes.

Restoration used the supported office-template save flow; previously official texts can therefore now have identical office-customized copies/metadata. **Original text content was restored exactly; no “Restablecer a versión oficial” reset was performed.** This was the requested restore-and-save test, not a fix to product behavior. The isolated custom VERSION DOS model remains edited and contains the known unknown-token failure. Existing legal documents were not edited/deleted, and receiver/PDF settings were not changed. No implementation/schema work was performed, so the implementation-only Prisma startup sequence was not invoked. Other TPL rows retain their previous state.

## 8. Office PDF identity and assets

Actor: Admin; repeat denial cases as Member. Source: Ajustes → Configuracion PDF.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| PDF-01 | P1 | Load settings with no custom configuration. | Fallback assets and current receiver details display clearly; no other office's identity. |
| PDF-02 | P0 | Save receiver name, address and phone; reload and generate a receipt and estampo. | New documents contain the intended office identity; old PDFs retain their original bytes. **2026-11-05: BLOCKED — Computer Use safety interruption before settings mutation; only starting-state and historical-receipt capture completed. See execution below.** |
| PDF-03 | P1 | Test field limits: name 160, address 240, phone 60; blank values and accented text. | Limits/blank fallback behavior are clear; no corrupt text or hidden truncation. |
| PDF-04 | P0 | Replace firma, sello and reciboStamp separately with valid PNGs; save and generate relevant PDFs. | Correct asset is previewed and rendered in the correct position/scale for this office. **2026-11-05: BLOCKED — valid labeled PNG prerequisites prepared, but Computer Use ended before upload/save/generation. See execution below.** |
| PDF-05 | P1 | Choose a file but leave without saving; then save a replacement and reload. | Unsaved file is not treated as persisted; saved preview updates, including in another tab. |
| PDF-06 | P1 | Upload non-PNG, corrupt/disguised PNG and a file over 5 MB; test the documented 5 MB boundary. | Rejected with actionable error; previous valid configuration remains usable. |
| PDF-07 | P0 | Remove each custom asset and save; replace after removal. | Correct fallback then replacement appears; no broken image or other customer's signature image. |
| PDF-08 | P0 | As Member, open page/API and attempt asset upload/removal/download outside allowed access. | Admin-only configuration is enforced server-side; asset visibility follows approved office rules. **2026-11-05: BLOCKED — user confirmed no Member session is available. No Member denial/enforcement claim is made. See execution below.** |
| PDF-09 | P1 | Generate long/multi-page documents with transparent/high-resolution assets and print them. | No clipped text, stretched signature, misplaced seal, blank pages or unacceptable printed margins. |
| PDF-10 | P0 | Distinguish a scanned signature image in a PDF from a digitally validated signed artifact. | UI and customer instructions do not misrepresent an image as completed cryptographic signing. |

### Selected PDF configuration execution — 2026-11-05

Tester: Codex, using Chrome desktop on Windows and the existing authenticated staging profile. Target: https://notifica-staging.vercel.app/. Vercel lookup reconfirmed READY deployment `dpl_6deJnsUppX9RUVkkqovxK46NuhP6`, commit `41f0a7e0a174f4a87dbd224b837455ec47b71592`, branch `codex/FEA_10_11`. Only PDF-02, PDF-04, PDF-08 and their necessary read-only/artifact prerequisites were attempted. The prior staging tab had been closed; a new task tab was opened in the same authenticated browser profile.

| Selected test | Result | Actual progress and concrete blocker |
| --- | --- | --- |
| PDF-02 | **BLOCKED** | Opened Configuracion PDF and observed the starting receiver name `QA-1030 Receptor Álvarez`, address `Calle Ficticia 1030, Ñuñoa`, phone `220000103`. Opened the historical receipt R-2026-000144 and historical VERSION UNO estampo through dashboard document links and visually confirmed their original identity. Captured and parsed one valid local historical-receipt PDF and recorded its SHA-256 below. Before changing any setting, Windows Computer Use stopped because it could not determine the current browser URL with enough confidence to enforce policy. Receiver save/reload, new receipt/estampo generation and before/after byte comparisons were **not completed**. |
| PDF-04 | **BLOCKED** | Prepared three distinct valid transparent PNG fixtures and verified that each reopens as PNG: green QA FIRMA, blue QA SELLO, red QA RECIBO. Read the documented file-chooser upload workflow. No file was uploaded and no asset/configuration save or relevant new PDF generation occurred before the Computer Use interruption. Prepared images are prerequisites, not evidence that upload, persistence, placement or scale passed. |
| PDF-08 | **BLOCKED** | Asked which existing browser/profile held an ordinary Member session. User explicitly answered **“No Member session available.”** No Member page/API, upload, removal or download attempt was executed. Access through the supplied session is not evidence of Member denial or server-side enforcement. |

#### Prepared evidence and retained prerequisites

- [Historical receipt before settings changes](audit-artifacts/pdf-2026-11-05/old-receipt-before.pdf): one-page PDF, parsed to confirm R-2026-000144, QA-TPL-1105-0706-A, original receiver/address and $101. SHA-256 **`409ca98a3ac32bb4c801e8ee61ebb7d4549cead7fb6f0282b95d616f991558cf`**. This is a **before-only** capture; no matching after-capture or byte-immutability PASS is claimed.
- Historical artifact URLs observed through the software: [receipt R-2026-000144](https://notifica-staging.vercel.app/api/documentos/a499c02a-f957-4641-b7ef-48e3cfea0d24/download?mode=inline) and [VERSION UNO estampo](https://notifica-staging.vercel.app/api/documentos/cmw3pawa000017awnme7fgckp/download?mode=inline). A later temporary download candidate parsed as another copy of the receipt, so it was **not** treated as an estampo byte capture.
- [firma-qa.png](audit-artifacts/pdf-2026-11-05/firma-qa.png): 720 × 180, RGBA PNG, 9,931 bytes, green **QA FIRMA / SOLO PRUEBA 1105**.
- [sello-qa.png](audit-artifacts/pdf-2026-11-05/sello-qa.png): 360 × 360, RGBA PNG, 9,003 bytes, blue **QA SELLO / SOLO PRUEBA / 1105**.
- [recibo-stamp-qa.png](audit-artifacts/pdf-2026-11-05/recibo-stamp-qa.png): 600 × 240, RGBA PNG, 11,397 bytes, red **QA RECIBO / SOLO PRUEBA 1105**.
- [Fixture-generation script](audit-artifacts/pdf-2026-11-05/make_test_assets.py) retained for reproducibility. These are clearly synthetic test graphics, not a person's signature.

Browser download-capture APIs timed out. A viewer download produced a temporary local PDF, whose contents were verified before copying it as the before-only receipt artifact above. This capture limitation was not classified as an application defect. The subsequent native-window inspection returned: **“Computer Use has been stopped for this turn because it could not determine the current browser URL on Windows with enough confidence to enforce policy.”** UI work stopped immediately; no alternate UI mechanism or bypass was attempted.

**No PDF configuration, receiver identity, asset, case or stored document was changed in this run.** No application fix was made and no new application-generated receipt/estampo is claimed. These are blocked results, not passes or reproduced application failures. No implementation/schema work was performed, so the implementation-only Prisma startup sequence was not invoked. Other PDF rows retain their previous state.

## 9. Demand creation and editing

Sources: Nueva Demanda, Editar Demanda, demand schemas/endpoints.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| CASE-01 | P0 | Create a complete demand with ROL, bank, caratula, tribunal, lawyer, materia, procurador, cuantia and one ejecutado. | Exactly one demand/ROL exists with correct linked data; workspace and list show it after reload. |
| CASE-02 | P0 | Create two cases using the same ROL with different casing/outer spaces in one office. | Normalization prevents duplicate case; useful conflict message and no partial orphan record. |
| CASE-03 | P0 | Create the same normalized ROL in office B. | Independent B case is allowed and cannot expose A's case. |
| CASE-04 | P0 | Leave the required lawyer blank and attempt creation; then select a valid lawyer and retry. | Form and server rules agree. The browser prevents empty-lawyer submission and the API rejects a missing/invalid lawyer; a generic save failure does not pass (F01). |
| CASE-05 | P1 | Omit each other required field in turn; create with allowed optional fields blank. | Specific validation; legitimate minimal case saves and displays blanks consistently. |
| CASE-06 | P1 | Select bank, type remaining caratula text, toggle manual bank-name editing and change bank. | Composed caratula is correct without repeated bank names, lost user text or mismatched associations. |
| CASE-07 | P0 | Change bank/lawyer/procurador in different orders, including a lawyer with multiple banks. | Compatible selections survive; incompatible selections clear/reject and the saved bank is the intended one. |
| CASE-08 | P0 | Enter cuantia as `4.000.000`, zero, empty, negative and malformed text. | Approved numeric interpretation is consistent in form, database, summaries and documents. |
| CASE-09 | P1 | Add two or more ejecutados with different names, RUTs, addresses and comunas; remove one before saving. | Only retained people save, in the right case, with the right address/comuna pair. |
| CASE-10 | P1 | Test missing/invalid RUT and optional/missing address/comuna; try zero ejecutados. | Actual validation policy is explicit. If incomplete intake is allowed, execution/doc generation identifies what must be completed. |
| CASE-11 | P1 | Use long Spanish names, accents, apostrophes and multiline/special-character fields. | Text survives create/edit/search/document generation without executable markup or broken layout. |
| CASE-12 | P0 | Double-click Guardar and retry after an uncertain network response. | No duplicate demand/ROL; user can discover whether the first save succeeded. |
| CASE-13 | P1 | Cancel/back out of creation, including the missing-ROL handoff. | No partial case created; navigation is usable and prefill does not overwrite a different ROL unexpectedly. |
| CASE-14 | P0 | Edit every case field separately; reload and inspect summary/list/selectors. | Changes persist in the intended case and dependent data stays consistent. |
| CASE-15 | P0 | Edit one ejecutado after notifications exist; add another, reorder where possible and remove a referenced person. | Notification-to-person identity is preserved; referenced-person removal is prevented or safely handled without reassignment to the wrong person. |
| CASE-16 | P0 | Edit a case after PDFs/receipts exist. | Historical files remain accurate historical records; new generation uses approved current data and correction rules. |
| CASE-17 | P0 | Two users edit the same case with different changes; one saves while the other has an old form. | No silent loss of legally important data; conflict/reload behavior is acceptable and documented. |
| CASE-18 | P1 | Open a nonexistent/deleted case and malformed ID; open edit without permission. | Clear not-found/denied state with navigation out, no raw stack trace or unrelated case. |

## 10. Case workspace, lifecycle, notes and documents

Sources: Resumen, Diligencias, Documentos, Notas, Historial tabs; status endpoint. Status progression is deliberately one-way in the current code.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| ROL-01 | P1 | Switch all five workspace tabs, reload/deep-link where supported and use browser Back. | Correct case remains selected; tab content loads without stale data from a previous case. |
| ROL-02 | P1 | Inspect Resumen and switch between ejecutados. | Correct person, address, comuna, demand and tribunal data display. |
| ROL-03 | P1 | Generate membrete for each ejecutado, each of six placements and both oficio/carta page sizes. | Correct person and case appear at the selected printed position/size; no unexpected case-document mutation. |
| ROL-04 | P1 | Cancel membrete dialog and try generating with no valid ejecutado. | Cancel produces no file; missing selection is explained. |
| ROL-05 | P0 | Choose Pendiente → En proceso, cancel confirmation, then confirm. | Cancel preserves status; Confirm changes it once and records the action. |
| ROL-06 | P0 | Try marking Terminado with no diligence, pending diligence or failed diligence. | Transition is blocked with a useful reason; no premature completion. |
| ROL-07 | P0 | Complete all diligences and mark En proceso → Terminado. | Status changes; diligence/document workflow mutations become read-only while consultation/download remain available. |
| ROL-08 | P0 | Archive from Pendiente, En proceso and Terminado; test Cancel separately. | Clear irreversible warning; correct transition after confirmation only. |
| ROL-09 | P0 | Attempt to reactivate an archived case or perform another invalid status transition via UI and API. | Rejected; archived case remains archived. Do not assume a reopen feature exists. |
| ROL-10 | P0 | On finished/archived cases separately try editing demand, creating/deleting notes, changing payment/boleta and requesting a signature. | Case edits and note writes are blocked; collections and signatures of existing documents follow their existing permissions. Status labels explain this scope (F05). |
| ROL-11 | P1 | Add a valid internal note; test fewer than three characters, whitespace, multiline and HTML-like text. | Required meaningful content and safe display; author/time correct; persisted once. |
| ROL-12 | P1 | Review activity history after create/edit/status/note/document/payment operations. | Correct case, actor, order and action; no unrelated-office events or misleading duplicate business events. |
| ROL-13 | P0 | Download each receipt/estampo from Documentos and view through notification/dashboard links. | Correct filename, type, version, content and person; all paths enforce the same access rules. |
| ROL-14 | P1 | Open a row without a PDF and simulate failed/expired storage download. | Unavailable download is disabled or clearly explained; page remains usable and does not return another file. |

## 11. Diligence creation and notification setup

Sources: NuevaDiligenciaWizard and DiligenciasTable. A diligence can contain several notifications; this is a required multi-person/multi-attempt test, not an optional edge case.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| DIL-01 | P0 | Create a diligence: choose type, assignment date, observations; review and save. | One diligence in the correct ROL; fechaEncargo displays correctly and case progress updates. |
| DIL-02 | P1 | Use typed DD/MM/YYYY date, calendar picker and Hoy; include a leap-day fixture. | All inputs agree on the same date; impossible/future dates rejected without timezone shift. |
| DIL-03 | P1 | Submit missing type/date and observations at/over the 1,000-character limit. | Clear validation; no partial diligence. |
| DIL-04 | P1 | Go Back/Next through wizard; cancel at each step; reopen after scrolling a long case. | Intended values preserved while navigating; cancel saves nothing; dialog is visible in the viewport. |
| DIL-05 | P0 | Double-submit a new diligence and retry after a lost response. | No accidental duplicate work; saved outcome can be reconciled. |
| DIL-06 | P0 | Click Ejecutar on a diligence with no notifications and one ejecutado. | One notification is created for that person and execution wizard opens. |
| DIL-07 | P0 | Click Ejecutar/Nueva Notificacion with several ejecutados; cancel selection, then choose a specific person. | Selection is required; cancel creates nothing; new notification belongs to the chosen person. |
| DIL-08 | P1 | Try notification creation for a case without ejecutados or with a person ID from another case. | Clear rejection, no orphan notification and no fallback to an unintended person. |
| DIL-09 | P0 | Add multiple notifications to the same diligence, including distinct people. | Independent execution/document workflows, stable references, correct person labels and counts. |
| DIL-10 | P0 | Anular Notificacion: cancel, then confirm for an unsigned disposable test notification with receipt and estampo. | Cancel preserves everything; Confirm removes the intended workflow records/files according to the approved policy and updates totals/status. |
| DIL-11 | P0 | Attempt annulment while its document is queued for signing or already signed. | Signing/document constraints preserve evidence; blocked action gives useful recovery guidance and does not partially delete storage. |
| DIL-12 | P0 | Complete all active notifications, add another, then annul that new notification. | Derived diligence completion updates correctly at every step; unrelated notifications are unchanged. |

## 12. Execution and receipt generation wizard

Sources: EjecutarWizard, receipt workflow/generation service. Step I → Next currently keeps changes locally until receipt generation; Save and close explicitly persists Step I.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| EXEC-01 | P0 | Enter execution date and optional time, choose Guardar/cerrar, then reopen. | Date/time/bank context persist for the intended notification. |
| EXEC-02 | P1 | Use typed date/calendar/Hoy and valid 00:00/23:59; try impossible/future dates and invalid times. | Correct validation and focus; no timezone/day shift. |
| EXEC-03 | P0 | Step I → Continue → Back; change date; then close without generating. | Draft/persisted distinction is clear. Next alone must not be represented to the user as a committed execution. |
| EXEC-04 | P0 | Clear a previously saved time and save again. | Optional time is actually cleared; old legacy metadata cannot silently reappear in documents. |
| EXEC-05 | P1 | Start execution when the demand has no bank or has an incompatible lawyer/bank. | Useful instruction to fix the demand; no wrong-bank receipt. |
| EXEC-06 | P0 | Select a custom estampo, accept/default/manual amount and Generate receipt only. | Execution and one valid receipt save together; wizard closes with truthful result and Ver recibo becomes available. |
| EXEC-07 | P0 | Select wizard category and Generate + Continue with estampo. | Correct category/person/amount is passed to the estampo wizard and receipt remains available. |
| EXEC-08 | P1 | Switch between custom/wizard selections and rates; revisit prior steps. | Type identity and amount remain coherent; no stale selection or overwritten intentional manual amount. |
| EXEC-09 | P0 | Generate with zero, large and thousands-formatted amount; reject negative/blank/invalid values. | Correct CLP amount throughout PDF, receipt list, export and collection totals. |
| EXEC-10 | P0 | Double-click Generate, retry after a lost response and submit simultaneously from two tabs. | One logical generation per intended action; no duplicate charge/receipt number. |
| EXEC-11 | P0 | Interrupt PDF/storage generation, then retry/reopen workflow. | No completed status for a missing PDF; failure is recoverable without duplicate active receipts. |
| EXEC-12 | P1 | Open workflow through dashboard deep links for steps 1/2/3 and reopen a partially completed flow. | Correct notification/step and saved data; no jumping into another person's work. |
| EXEC-13 | P0 | Generate several receipts in one office/year, in another office and across a year boundary. | Unique sequential `R-YYYY-000001` style numbers per office/year; legacy numbers preserved. Gaps from failed reservations must be explained, not mistaken for duplicates. |
| EXEC-14 | P0 | Regenerate a receipt without legal-data changes. | Same receipt number/logical receipt, updated document version as designed, no additional amount counted. |
| EXEC-15 | P0 | Change legal data and try Regenerate, then choose Correct with and without a valid reason. | Regenerate is blocked; correction requires reason, creates a new number and preserves explicit supersession/history. |
| EXEC-16 | P0 | Correct an already paid/sent/boleta-associated receipt and inspect every dependent screen/export. | Approved treatment of prior payment, boleta, correspondence and superseded receipt is explicit; no double-counted collectible amount. |
| EXEC-17 | P0 | Use assignment date, execution date and generation date on different days/months. | PDF visible date is execution date; dashboard, filters, exports and reports follow their documented date semantics. Resolve F02. |

## 13. Estampo generation and completion

Sources: EstampoWizardModal, custom Step III, base templates and document generation endpoints.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| STAMP-01 | P0 | Continue to a custom estampo from an existing receipt; inspect auto-filled person, ROL, tribunal, address, date/time and amount. | All fields correspond to the specific notification and receipt, not the first ejecutado or case cuantia by mistake. |
| STAMP-02 | P1 | Edit custom content, save draft, close/reopen, then generate. | Draft survives; generated PDF uses the accepted draft and correct version. |
| STAMP-03 | P1 | Submit blank custom content; cancel; go Back and reopen. | Blank generation rejected; cancelling does not falsely mark completed. |
| STAMP-04 | P0 | For every configured wizard category and base model, select model and answer every required question. | Correct template, required-field checks, derived text and generated PDF. Record one result per model. |
| STAMP-05 | P0 | Exercise every radio/select branch and conditional question for each model. | Only relevant questions appear; changed branches recompute text and do not retain contradictory hidden answers. |
| STAMP-06 | P1 | Change template after entering answers; use text/date/time/number/enum inputs. | Defaults and answers reset/persist intentionally; invalid input cannot yield a plausible but incorrect PDF. |
| STAMP-07 | P0 | Open text editor/preview, edit generated text, accept changes or cancel editor. | Confirmed edits reach the final PDF. Cancel discards the current draft and preserves any previously confirmed override; a first cancelled edit sends no override. Merely previewing does not complete the notification. |
| STAMP-08 | P0 | Repeat for all nine seeded búsqueda negativa models, including alternative street, missing number, unknown person and no-longer-resident branches. | Each applicable legal-text variant is reviewed by the office against the supplied facts; do not treat one model as coverage for all nine. |
| STAMP-09 | P0 | Generate/re-generate with long address/name, accents, large amount, signature/seal and page breaks; download and print. | No unresolved placeholders, wrong person, cropped paragraphs or lost pages; printed document is usable. |
| STAMP-10 | P0 | Generate estampo twice intentionally and double-click accidentally; inspect versions and completion counts. | Versioning/replay behavior is coherent; logical notification is counted once and historical evidence is preserved. |
| STAMP-11 | P0 | Verify receipt-only, estampo-only legacy fixture and full receipt+estampo notification. | Completion reflects both required documents; all active notifications must complete before the diligence completes. |
| STAMP-12 | P0 | If automatic signing is configured, generate an eligible estampo and observe queue; repeat with feature disabled/unavailable. | Exactly the intended source is queued when enabled; document generation outcome and signing availability are separately truthful. |
| STAMP-13 | P1 | Use Restablecer in the per-document text editor after manual changes; reopen and generate. | Manual override clears and template/answers produce the text again. This does not reset the office-wide template. |

## 14. Receipt search, selection and export

Sources: Gestión de Recibos and ReceiptResults. Current visible filters are status, lawyer, procurador, bank, ROL and execution-date range. Additional API filter fields do not imply visible controls.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| LIST-01 | P1 | Open Recibos with no filters, set a filter and apply; then clear. | Initial choose-criteria state, deliberate loading and reset behave as stated. |
| LIST-02 | P1 | Test each visible filter individually, multiple values in each selector, and mixed filters. | Correct intersection; multi-select clearing works; other-office options never appear. |
| LIST-03 | P0 | Filter on exact execution dates, month/year boundary and an end date earlier than start. | Inclusive intended range, no off-by-one day; invalid range rejected. Generation-date discrepancy F02 is resolved. |
| LIST-04 | P1 | Change draft filters without applying, then apply and use Back/refresh where supported. | Displayed results and applied-filter state remain understandable and consistent. |
| LIST-05 | P1 | Move across more than two result pages and change filters on a later page. | Correct rows/page counts; new filter resets to valid page and stale selections do not target hidden records. |
| LIST-06 | P0 | Compare all displayed fields and sums with source cases: number, ROL, caratula, gestion, template/result, parties, bank, amount, dates, paid state, boleta. | Accurate records; especially verify multi-bank labels (F10) and execution versus generation dates. |
| LIST-07 | P1 | Select/unselect one receipt and all current-page receipts using desktop table and mobile cards. | Correct selection count and available actions; labels remain associated with the right record. |
| LIST-08 | P0 | Engineer: exercise API all-filtered selection with excluded IDs across pages. Separately inspect whether candidate UI actually offers it. | API export/send scope equals filter set minus exclusions. Current source lacks a UI entry point (F13); do not mark that missing user control passed. |
| LIST-09 | P0 | In UI export individual/current-page selection; Engineer repeats API all-filtered export with exclusions. | XLSX opens without repair; row identities, counts, totals, dates, CLP amounts and column order match the intended selection; UI scope is not overstated. |
| LIST-10 | P0 | Export corrected/regenerated/voided and legacy receipt fixtures. | No duplicate logical charge or invalid active document counted; superseded/legacy behavior is explicit. |
| LIST-11 | P1 | Export with no selection, very large result set and connection failure. | Buttons/limits/error handling are clear; no empty-success download or stuck spinner. |
| LIST-12 | P0 | Export fields starting with `=`, `+`, `-`, `@` and long/Unicode text. | Untrusted text is not executed as spreadsheet formulas; content remains readable and accurate. |
| LIST-13 | P1 | Expand/collapse Ver detalles on mobile receipt cards, select partial/all page and compare desktop view. | All hidden details become readable; partial-selection indicator is correct; no differing data or lost selection between layouts. |

## 15. Payment, boleta and undo

Sources: receipt bulk preview/apply/recent/undo and reconciliation. Current bulk mutation limit is 25 explicit receipt IDs; all-filtered selection is for export/send, not these mutations.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| PAY-01 | P0 | Select unpaid receipts, choose Marcar pagado, enter allowed date and Revisar cambios. | Preview shows eligible, unchanged, skipped and conflicting counts, target records and total amount before mutation. |
| PAY-02 | P0 | Cancel payment preview, then repeat and Confirmar cambios. | Cancel makes no changes; confirmed records persist as paid with correct approved date. |
| PAY-03 | P1 | Test missing/future/impossible payment date and changing the date after preview. | Invalid date rejected; changed draft requires refreshed preview, not reuse of old approval. |
| PAY-04 | P0 | Select already-paid receipts with same/different payment date, plus invalid/deleted-PDF fixtures. | Unchanged/conflict/skipped states are accurate and visible; no unintended overwrite hidden by a bulk success count. |
| PAY-05 | P0 | Associate a boleta number: review, cancel, confirm and reload. | Only intended receipts gain the exact external number; no boleta PDF/date is falsely generated. |
| PAY-06 | P1 | Associate blank/space-only number, an existing same number and a conflicting different number. | Trim/validation and conflict preview work; accidental overwrites are reviewable. |
| PAY-07 | P0 | Create two notification receipts in one diligence; mark only one paid and inspect the unselected sibling. | Only the selected receipt changes payment status/date. Its unselected sibling remains unchanged in lists, filters, reports and exports; undo also affects only the selected receipt. |
| PAY-08 | P0 | Try 26 IDs or all-filtered selection for payment/boleta; try duplicate IDs. | Server enforces the 25-item boundary and de-duplicates appropriately; UI explains permitted selection. |
| PAY-09 | P0 | While preview is open, have another user modify one target, then confirm old preview. | Stale-state conflict requires re-review; concurrent work is not silently overwritten. |
| PAY-10 | P0 | Click Confirm repeatedly or retry after an uncertain response. | No repeated unintended change/history; refreshed state lets the user reconcile the outcome. |
| PAY-11 | P0 | Undo the last payment operation and the last boleta operation in separate fixtures. | Exact prior values restored; totals and audit evidence update; undo itself is recorded. |
| PAY-12 | P0 | Change a target after a bulk operation, then try Undo; repeat an already-undone operation. | Unsafe/stale/repeated undo rejected with reason; newer work is preserved. |
| PAY-13 | P1 | Reload/navigate away and return to the recent-operation undo banner. | Reversibility and operation identity are current, scoped to the intended office/user behavior. |
| PAY-14 | P0 | Repeat payment/boleta on a finished/archived case and on corrected receipts. | Approved business policy is enforced consistently; historical/legal evidence is not silently rewritten. |

## 16. Sending receipt lists

These tests send real test emails only when executed with approved controlled inboxes. The attachment is a receipt **listing XLSX**; do not assume this action sends every receipt PDF.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| MAIL-01 | P0 | Select receipts and open Enviar listado; inspect recipient grouping, count, amount, subject and attachment name. | Preview matches the selected receipts and intended recipients; no email sent merely by opening preview. |
| MAIL-02 | P0 | In advanced options switch Procurador, Abogado and Ambos. | Grouping/recipients recalculate correctly; no unintended copies or cross-client disclosure. |
| MAIL-03 | P1 | Include missing contact, missing/invalid email and unsupported receipt rows; expand exclusions. | Exact excluded records and reasons visible; valid groups remain correctly scoped. |
| MAIL-04 | P0 | Edit recipient email without Guardar este correo en la ficha; send to test inbox. | Message goes to chosen test address; permanent contact address is unchanged. |
| MAIL-05 | P0 | Repeat with Guardar este correo en la ficha checked. | Only the intended contact's email persists and future previews use it. |
| MAIL-06 | P1 | Edit subject/body and insert each supported variable into both: recipient_name, recipient_type, office_name, fecha, cantidad_recibos, monto_total. | Preview and actual message substitute correctly for each group with no leftover valid token. |
| MAIL-07 | P1 | Enter unknown variable, empty/overlong subject/body and special characters. | Clear supported-variable/length handling; no misleading success or broken email. |
| MAIL-08 | P1 | Save office default template, close/reopen, and compare another office. | Default persists only in intended office; one-off unsaved edits do not become its default. |
| MAIL-09 | P0 | Choose Enviar prueba a mi correo for a group. | Only current user's controlled inbox receives test; actual clients receive nothing and test is not mistaken for a completed client dispatch. |
| MAIL-10 | P0 | Confirm initial send with multiple groups. | Each intended recipient receives correct subject/body/XLSX containing only their intended records; on-screen and history counts reconcile. |
| MAIL-11 | P0 | Use same email for lawyer/procurador and multiple contacts. | Approved deduplication/copy behavior; no accidental disclosure through grouping or repeated sends. |
| MAIL-12 | P0 | Attempt duplicate send, inspect warning, omit reason, then give valid reason and confirm. | Required review cannot be bypassed; intentional resend is traceable. |
| MAIL-13 | P0 | Double-click Confirm and simulate timeout after provider acceptance. | User is not told it definitely failed if outcome is uncertain; no blind automatic duplicate messages. Check provider inbox and dispatch history. |
| MAIL-14 | P0 | Mix successful and rejected recipient deliveries; temporarily disable provider. | Per-recipient failures and partial results are truthful; no all-success banner when some messages failed. |
| MAIL-15 | P1 | Refresh preview after changing selections/contact/template; cancel and close send center. | Latest preview represents actual send; cancellation sends nothing and receipt filters remain intact. |
| MAIL-16 | P0 | Change/correct/annul a selected receipt after preview but before send. | Server validates current eligibility; stale or invalid records are not sent unnoticed. |
| MAIL-17 | P0 | Send once in explicit simulation mode, then once with the intended live provider to a controlled inbox; inspect UI/history/reply readiness. | Simulation is clearly labeled and sends nothing. Live test requires actual received email/XLSX evidence; a dry-run message ID or success banner is not delivery proof. |

## 17. Dispatch history, replies and recovery

Sources: Gestión de envíos, UnmatchedRepliesPanel, receipt send/history/reply APIs.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| REPLY-01 | P1 | Open Gestión de envíos; filter Todos, Enviados, Fallidos, Esperando, Vencidos, Respondidos and Resueltos. | Correct dispatches/status; selection detail resets appropriately on filter change. |
| REPLY-02 | P0 | Open a dispatch and inspect recipient delivery evidence, timestamps, original selection, amount and lineage. | Matches actual email sent; provider-accepted delivery is not overstated as recipient-read confirmation. |
| REPLY-03 | P1 | Actualizar history and Comprobar proveedores; repeat as Member and Admin. | Current readiness/errors; technical diagnostics follow the intended visibility rules without secrets. |
| REPLY-04 | P0 | Reply from controlled recipient inbox using original thread; click Actualizar respuestas and wait for automatic sync separately. | Response attaches to the correct office/dispatch/recipient exactly once. |
| REPLY-05 | P0 | Repeat sync and deliver duplicate/threaded replies, including replies to a resend. | No duplicate imported reply; correct relationship to original/resend history. |
| REPLY-06 | P1 | Expand/contract Leer respuesta completa for short/long and HTML-like replies. | Safe readable text, sender/time accurate; no executable message markup. |
| REPLY-07 | P1 | Confirm/change each classification: Recibido, Observado, Requiere corrección, Pago informado and Otro. | Classification persists and suggestion versus confirmed state is clear. |
| REPLY-08 | P0 | Classify a reply as Pago informado, then inspect paid balance. | A message classification must not falsely prove bank/payment reconciliation; any resulting financial action must match the approved explicit policy. |
| REPLY-09 | P1 | Enter resolution note, mark resolved, reload, then reopen. | Note/state persist; resolved/reopened queues update with traceable action. |
| REPLY-10 | P0 | Reenviar from history: edit addresses/subject/body, require reason, cancel then confirm. | Correct controlled recipients and current allowed listing; new dispatch links to original with reason. |
| REPLY-11 | P0 | Resend after some original receipts were corrected/removed; test partial/duplicate warnings. | Partial scope and duplicate risks explicitly reviewed; never silently send a different set than the user approved. |
| REPLY-12 | P1 | Switch Envíos / Respuestas por asociar using clicks and keyboard; close/reopen via URL state. | Correct panel, focus and badge; closing preserves receipt filters and removes only panel state. |
| REPLY-13 | P0 | Import unmatched and ambiguous responses; filter Todos/Revisión necesaria/Sin asociar; page and refresh. | Correct candidate counts and office isolation. Search/select the intended sent email, cancel once, then explicitly confirm association; reply moves to that dispatch exactly once. Foreign-office destinations and stale second confirmations fail without changes. |
| REPLY-14 | P1 | Review replies with attachments and a queue count above 99. | Attachment metadata and 99+ badge are accurate. Download from matched and unmatched replies; verify exact original bytes, office isolation, safe attachment disposition, unavailable-message errors and the documented large-file fallback (F04). |
| REPLY-15 | P1 | Simulate mailbox sync unavailable, malformed message or missing provider configuration. | Last good results preserved, understandable failure/readiness state, retry usable, no false “no replies” success. |
| REPLY-16 | P1 | Create more than 20 dispatches, then try finding, reading replies to, resolving and resending an older dispatch. | Supported user history navigation reaches required records; current source limit/no-pagination gap F16 is documented or fixed. |

## 18. Reconciliation

Source: Recibos → Conciliación operativa.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| RECON-01 | P1 | Generate using execution date, bank, procurador, payment state, boleta and min/max amount individually and combined. | Correct filtered receipt set; invalid ranges rejected. |
| RECON-02 | P0 | Prepare one receipt in each category: Conciliado, Boleta pendiente de pago, Pagado sin boleta, Sin boleta y sin pagar. | Each appears in exactly the correct category with correct total. |
| RECON-03 | P1 | Select one/multiple categories; clear and generate again. | Correct inclusion and cleared-state behavior, no stale summary. |
| RECON-04 | P0 | Group by category, bank, procurador, execution month and boleta; expand/collapse groups. | Membership/subtotals agree with underlying records and grand totals. |
| RECON-05 | P0 | Include regeneration/correction history and legacy rows without notification/document linkage. | One intended logical receipt counted; fallback identities do not merge unrelated records. |
| RECON-06 | P1 | Move through multiple pages and check summaries versus page rows. | Global versus page totals are distinguishable and accurate. |
| RECON-07 | P0 | Export report for each grouping and compare workbook to screen/all matching records. | Correct sheets/grouping, dates, counts and sums; XLSX opens without repair. |
| RECON-08 | P0 | Mark paid, associate boleta, undo and correct a receipt; regenerate reconciliation after each. | Categories and balances follow approved business effects, including shared-diligence behavior F03. |

## 19. Reports: generate, download, deliver and versions

Actor: Admin. Source: Ajustes → Reportes; ordinary members should be denied throughout.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| REPORT-01 | P1 | Navigate the three sections and five operations views; reload, Back and keyboard arrow/Home/End navigation. | URL and selected tab agree; filters/focused report behave predictably; no broken tab content. |
| REPORT-02 | P0 | Generate daily report for a known date and an empty day. | Correct Chile-day activity, actor/actions/results, valid file and explicit empty-period result. |
| REPORT-03 | P0 | Generate monthly report with known billing/activity fixtures across month boundaries. | Correct month, money and historical events; counts reconcile with source operations, including corrections/voids. |
| REPORT-04 | P1 | Enter invalid/future dates and repeat generation of an existing period. | Validation and existing-file/idempotent behavior are explicit; no accidental duplicate logical report. |
| REPORT-05 | P0 | Choose Regenerar daily/monthly; cancel then confirm. | New immutable version after confirmation; previous valid version remains available as policy permits. |
| REPORT-06 | P0 | Download current daily/monthly file and verify in a spreadsheet viewer. | Correct period, office, rows, totals, timestamps, safe text and filename; no raw secrets or unrelated data. |
| REPORT-07 | P0 | Send daily/monthly report to authorized controlled admin inboxes. | Only eligible recipients receive correct version; history and actual attachment agree. |
| REPORT-08 | P0 | Reenviar a todos, cancel/confirm, then retry only failed recipients from a partial attempt. | Full resend is explicit; failed-only retry targets failures and remains tied to the reviewed version, not an unrelated regenerated file. |
| REPORT-09 | P1 | Filter inventory by type, status, delivery status and date; paginate, refresh, open Versions/Entregas for one report. | Correct results, totals and focused history; clearing report focus returns to all permitted reports. |
| REPORT-10 | P1 | Filter version history by daily/monthly/custom, every available status, current/historical and date. | Correct histories and availability; uploading/corrupt/deleted versions are not offered as healthy files. |
| REPORT-11 | P0 | Download a historical version; copy checksum and compare to downloaded file. | Exact immutable bytes and checksum; historical file is not replaced by current version. |
| REPORT-12 | P0 | Restore a ready historical monthly version, cancel first; download current afterward. | Pointer changes to selected historical version; no file rewritten; restoration recorded. Daily/non-ready restoration is not accidentally exposed. |
| REPORT-13 | P0 | Corrupt/remove a test report object, then download. | Clear integrity/unavailability error; no corrupted workbook presented as valid and prior good version remains recoverable where supported. |
| REPORT-14 | P1 | Filter deliveries by offered type/status/mode/date; expand an attempt/recipient, view errors and version links. | Per-recipient outcome, attempts, timestamps and version lineage match actual delivery. |
| REPORT-15 | P0 | Run Mantenimiento with confirmation against expired daily files and permanent monthly/history fixtures. | Only policy-eligible files removed; history preserved; monthly permanent retention honored; failed deletion remains visible/retryable. |
| REPORT-16 | P0 | As Member/anonymous/B-office admin, open all report pages/APIs/download/version/job IDs from A. | Proper denial with no metadata/file leak; possession of a report ID is insufficient. |
| REPORT-17 | P0 | In delivery history copy the attachment checksum and compare it with the actual email attachment; filter delivery target All authorized / Failed only. | Attachment identity matches the recorded immutable version, and the target filter correctly distinguishes full delivery from failure-only retry. |

## 20. Report jobs, recipients and scheduling

Actor: Admin; Engineer assists time/failure scenarios. Automatic work must complete with browser closed.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| JOB-01 | P1 | Trigger report work, open Trabajos, filter status/type/report/origin and paginate. | Correct queued/running/completed/failed records; filters persist in URL as intended. |
| JOB-02 | P1 | Expand/collapse job, observe live progress and refresh. | Accurate phase/attempt history/parent-child lineage; not stuck on stale details after state changes. |
| JOB-03 | P0 | Cancel a queued and a running job separately; repeat the request. | Cooperative cancellation is truthful; no completed deliverable mislabeled cancelled and no duplicated cancellation effects. |
| JOB-04 | P0 | Retry a failed/cancelled job where permitted; try retry of an ineligible job. | One traceable child retry with correct inputs; invalid transition rejected. |
| JOB-05 | P0 | Reload/close browser during generation or delivery; reopen after worker execution. | Durable work finishes or exposes recoverable failure without requiring the original tab. |
| JOB-06 | P0 | Interrupt worker/process or external provider mid-job, then allow recovery. | No duplicate business file/email; completed units and attempts reconcile to real outcomes. |
| JOB-07 | P1 | In Destinatarios, toggle daily, monthly and custom eligibility for active admins; save and reload. | Preferences persist; inactive admins cannot be enabled; next delivery respects the selection. |
| JOB-08 | P0 | Remove all eligible recipients and request delivery; disable an admin between preview/configuration and send. | No unauthorized or unintended fallback recipient; no-recipient condition clearly reported. |
| JOB-09 | P0 | Two admins edit recipient configuration concurrently. | Revision/conflict handling prevents silent overwrite; user can reload/reapply intentionally. |
| JOB-10 | P1 | Disable the last eligible recipient for each report type, first cancelling and then accepting the warning. | Cancel preserves eligibility; accept shows zero recipients and safe no-recipient state until reconfigured. |
| JOB-11 | P1 | Change recipient preferences without saving; attempt reload/leave, cancel the browser prompt, then save. | Unsaved-change protection is meaningful; persisted preferences change only on successful save. |
| SCHED-01 | P1 | Edit schedule time, enabled flag, lateness threshold and available weekday/month day; save/reload. | Correct stored schedule and next run; monthly day bounds 1–28 and lateness bounds 5–1440 minutes enforced. |
| SCHED-02 | P0 | Disable a schedule and wait past its due time in a controlled test; enable again. | Disabled schedule does not send; re-enabled next run follows defined policy without surprise duplicate catch-up. |
| SCHED-03 | P0 | Ejecutar ahora for daily/monthly/custom schedules, including double-click. | Correct one intended queued execution and period; UI distinguishes queued from delivered. |
| SCHED-04 | P0 | Execute due schedules with browser closed, including simultaneous scheduler triggers and manual action. | Required processing actually runs on hosting; duplicate execution identity prevents duplicate outcome. |
| SCHED-05 | P0 | Test Chile midnight/month/year boundaries, Monday/Sunday and DST changes with controlled clock fixtures. | Daily/weekly/monthly period and delivery time follow America/Santiago, not the tester's PC timezone. |
| SCHED-06 | P1 | Cause missed/failed run and restore worker/provider; refresh health. | Next run, last success/failure, consecutive failures and lateness status accurately guide recovery. |

## 21. Custom reports

Actor: Admin. Source: Reportes → Personalizados. These use approved activity-event fields, not arbitrary SQL.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| CUSTOM-01 | P1 | Create a definition with name/description, selected modules/categories/results and actor filters. | Definition saves and reopens with exact settings. |
| CUSTOM-02 | P1 | Toggle include-system and individual filters; run against known user/system events. | Output includes precisely the approved subset; no raw sensitive fields. |
| CUSTOM-03 | P1 | Add/remove/reorder approved columns; test first/last move and empty selection. | Saved output order matches editor; invalid empty/duplicate/unknown-column selection rejected. |
| CUSTOM-04 | P1 | Select eligible custom recipients; make one ineligible before next run. | Only currently authorized recipients receive data; stale selection cannot bypass eligibility. |
| CUSTOM-05 | P1 | Create/edit daily, weekly and monthly custom schedules; remove scheduling. | Correct schedule fields, lifecycle and next run; removing schedule stops future automatic work. |
| CUSTOM-06 | P0 | Run a date range with Deliver unchecked, then checked using controlled inboxes. | Generate-only does not email; deliver path produces and sends the intended report through visible jobs/history. |
| CUSTOM-07 | P1 | Invalid/reversed range, missing name, empty results and a range beyond allowed output limits. | Actionable validation/limit behavior; no silently truncated report presented as complete. |
| CUSTOM-08 | P0 | Download output for known fixtures and a result around the documented 50,000-row ceiling. | Correct filters, column order, row count and explicit limit handling; safe spreadsheet text. |
| CUSTOM-09 | P0 | Edit a definition after a run was queued. | Queued job uses its intended captured definition/version; historical output is not silently changed. |
| CUSTOM-10 | P1 | Archive a definition, cancel first; inspect its prior files and schedule afterward. | Confirmed archive removes future operational use as intended; history retained and future scheduling stops. |

## 22. Web signing center and signed archive

Actor: Member can request; Admin manages retries/cancellation; Operator enables token session. Test real signing separately from UI mocks.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| SIGN-01 | P1 | Open Firmados, refresh, inspect cards and device/certificate status. | Office-wide counts/readiness are accurate; disconnected token and offline agent are distinct from a usable signing session. |
| SIGN-02 | P1 | Filter date range and each status; clear, page, open case/source links. | Correct business-date set and status; selected rows reset intentionally with filters. |
| SIGN-03 | P0 | Select one/several eligible estampos, clear selection and select all eligible in range across pages. | Exact eligible versions/checksums selected; non-estampo/invalid/superseded documents cannot slip in. |
| SIGN-04 | P1 | Select a range over 500 documents and invalid/reversed dates. | Clear request to narrow range and validation; no silent first-500 submission. |
| SIGN-05 | P0 | Choose correct signer certificate/device; attempt expired/revoked/other-office certificate. | Only eligible office certificate accepted; rejected request does not queue a different signer. |
| SIGN-06 | P0 | Choose each offered profile B, LT and LTA; review documents and certificate, leave checkbox unchecked, then confirm. | Confirmation requires review; request retains exact profile and source versions; no silent downgrade. |
| SIGN-07 | P0 | Cancel review or close with Escape; retry with a reviewed confirmation. | Cancel queues nothing; confirmed request queues once and describes remote authorization correctly. |
| SIGN-08 | P0 | Request signature as ordinary Member while token session is enabled. | Authorized office request succeeds without asking for a web PIN; admin-only recovery controls remain unavailable. |
| SIGN-09 | P0 | Request while signer is offline/token missing/session disabled, then restore readiness. | Queue/waiting state is truthful; signing occurs only under a valid enabled token session. |
| SIGN-10 | P0 | Double-submit/timeout then resend the same reviewed request. | Existing job replay instead of duplicate signature; exact reviewed payload preserved during uncertain result. |
| SIGN-11 | P0 | Another user regenerates/deletes/changes source between selection, confirmation and signing. | Changed source is rejected/fenced; never sign unreviewed replacement bytes. |
| SIGN-12 | P0 | Observe queued → processing → validated completion; open/download the resulting file. | Completion only after independent validation; certificate, signed version, checksum and profile correspond to the requested document. |
| SIGN-13 | P0 | As Admin cancel before signing; try again after signing begins and from Member. | Pre-start cancellation works; started work and unauthorized cancellation are blocked. |
| SIGN-14 | P0 | Retry a recoverable/uncertain failure as Admin with review checkbox; repeat stale attempt count. | Explicit local-result review required; correct attempt boundary and retry limit; no duplicate token operation from stale retry. |
| SIGN-15 | P0 | Simulate invalid signature/checksum, validator down, timestamp/revocation service failure and expired certificate. | No false validated success or profile downgrade; actionable state and preserved recovery evidence. |
| SIGN-16 | P1 | Read failure status as Member versus Admin and inspect office-wide alerts under narrow filters. | User guidance remains useful; privileged diagnostics restricted; important office alerts do not disappear because of date filters. |
| SIGN-17 | P0 | Search archive by document name, ROL and identifier; include a file older than 50 days. | Complete office archive accessible regardless of Windows recent-folder cutoff. |
| SIGN-18 | P0 | Download original signed archive file, paginate, compare checksum and open in a signature-aware PDF viewer. | Exact validated signed bytes; correct document/certificate, not an unsigned current regeneration. |
| SIGN-19 | P0 | Reuse archive URL/checksum as other office or alter signature ID/checksum. | No cross-office or mismatched-file download. |

## 23. Windows companion, enrollment and token session

Sources: `agents/windows/Notifica.Agent`, managed installation/update guides, office-folder runbook. Test the actual package shipped, not only a developer preview. Enrollment-code creation/revocation currently requires the admin API/support procedure.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| AGENT-01 | P0 | Install managed package on a clean supported PC using customer installation procedure; restart/log on. | Service and tray run as intended, correct server/version, no missing runtime; operator can complete setup. |
| AGENT-02 | P1 | Cancel/interrupt installation then resume the supported matching install. | Safe recoverable state; no duplicate broken service/task or loss of existing data. |
| AGENT-03 | P0 | Admin creates a role-appropriate enrollment code; Operator enters code/name and chooses office-folder location. | Correct office/device role enrolled once; no infrastructure secrets/web password required in agent. |
| AGENT-04 | P0 | Test invalid, expired (ten-minute), reused and revoked enrollment codes; simulate lost enrollment response. | Rejected safely; uncertain enrollment requires reconciliation rather than duplicate identity. |
| AGENT-05 | P0 | Enroll a second PC and receiver-only role where offered. | Both see only their office; receiver-only cannot sign. Admin can distinguish devices accurately. |
| AGENT-06 | P1 | Open dashboard by tray double-click and menu; refresh, hide, close and reopen. | Service/token/session status updates; closing window leaves expected background service/tray running. |
| AGENT-07 | P1 | Exit tray and relaunch/log on while remote session is active. | Actual behavior is clear: exiting tray does not itself close the remote signing session. User sees how to explicitly stop it. |
| AGENT-08 | P0 | Open remote-session dialog; review office/certificate, consent and enter correct local PIN. | Only intended token session enabled; PIN never requested by website or retained in visible logs/settings. |
| AGENT-09 | P0 | Omit consent/PIN, cancel dialog and try an incorrect PIN once using a safe test token. | No signing authorization without required consent; no automatic PIN retry that could lock token. |
| AGENT-10 | P0 | Explicitly Cerrar sesión de firma; submit new web request afterward. | New token signing stops until a fresh locally enabled session; UI reflects actual disabled state. |
| AGENT-11 | P0 | Let session expire (up to eight hours), restart service/PC, or trigger token/engine failure. | Session closes under defined conditions; no silent persistent authorization across those boundaries. |
| AGENT-12 | P0 | Disconnect/reconnect token, test driver unavailable and ambiguous/expired certificate fixtures. | Correct readiness guidance; no wrong certificate selected or signing while unhealthy. |
| AGENT-13 | P0 | Request a multi-document batch from another computer during enabled session. | Authorized documents sign with intended certificate/profile without unexpected per-document local consent; counts match request. |
| AGENT-14 | P0 | Disconnect network during source download, during/after token signing and during result upload. | Recovery preserves exact signed bytes; upload retry does not re-sign automatically after an unknown token outcome. |
| AGENT-15 | P0 | Restart after an uncertain signing result and follow reviewed recovery procedure. | Local journal/output inspected; no forced deletion of evidence or blind duplicate signature. |
| AGENT-16 | P1 | Open firmados de la oficina from tray/dashboard on both PCs; open a recent placeholder PDF. | Same authorized recent-office listing; PDF downloads on demand and opens correctly. |
| AGENT-17 | P0 | Attempt modification/deletion within the read-only shared-folder experience; test existing local filename collision and low disk. | Signed source remains immutable; no overwritten personal file; clear recoverable disk/collision error. |
| AGENT-18 | P0 | Use shared folder offline and reconnect; open cached versus uncached PDF. | Truthful availability; no empty/corrupt placeholder shown as valid; recovery works after connection returns. |
| AGENT-19 | P0 | Cross the 50-day folder cutoff and search older document in web archive. | Recent folder follows retention boundary while original validated signature remains recoverable in web archive. |
| AGENT-20 | P0 | Revoke enrolled device and unused code; use old sessions/URLs and attempt reconnect. | Future access denied; old code unusable; returning device follows supported new-identity process. Previously downloaded copies are not falsely promised remote erasure. |
| AGENT-21 | P0 | Upgrade supported managed older version to shipped candidate, including installation paths with spaces. | Enrollment, settings, documents, folder and service/tray continue working; new version reported accurately. |
| AGENT-22 | P0 | Cause controlled upgrade/startup failure and follow rollback; then retry upgrade. | Previous working installation restored without losing enrollment/documents or weakening permissions. |
| AGENT-23 | P1 | Remove/retire the application using supported procedure; inspect remaining customer files and server device state. | Customer understands preserved data; service/task no longer runs; revocation is completed as intended. |
| AGENT-24 | P1 | Test each shipped dashboard action at Windows display scaling and with keyboard; receiver and signer roles separately. | Controls/text visible and role-appropriate; developer test-batch mode is not confused with normal production signing. |
| AGENT-25 | P1 | Choose office-folder locations on supported local NTFS, an unavailable/unwritable directory, UNC share, non-NTFS volume and another cloud-sync root. | Supported setup succeeds; unsupported setups are explained without silent fallback or overwriting unrelated files. Current shared-folder guide specifies Windows 11 x64 and local NTFS. |
| AGENT-26 | P0 | Run the shipped updater's preflight and interrupted-update recovery flows on controlled installations. | Preflight makes no changes; recovery identifies the interrupted version and restores a usable installation without resetting enrollment or documents. |

## 24. Office isolation, hidden/API-only actions and permissions

Actor: Engineer with controlled A/B accounts. These protect user actions even when a control is hidden. Use the complete endpoint inventory in the companion coverage file; test all applicable methods, not only GET.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| ACCESS-01 | P0 | Substitute other-office IDs in cases, diligences, notifications, notes and document download/edit/delete requests. | No read/write/delete outside own office and no sensitive existence disclosure. |
| ACCESS-02 | P0 | Substitute other-office catalog/contact/price IDs in otherwise valid create/update payloads, including comuna and tribunal. | Every linked record is validated for office ownership; no cross-office foreign-key association. |
| ACCESS-03 | P0 | Substitute receipt IDs in export/send/bulk/undo/reconciliation and reply/batch/recipient IDs in history/classification/resend. | No other office's financial/contact/email data or changes; mixed-ID batches fail/skip explicitly according to safe contract. |
| ACCESS-04 | P0 | Repeat reports/versions/jobs/recipients/schedules/custom definitions, PDF assets, signing queue/device/archive with B identifiers. | Admin privileges are office-scoped, never global by possession of IDs. |
| ACCESS-05 | P0 | Attempt privileged operations as Member via direct API even when buttons are hidden. | Reports/PDF configuration/device administration/signing recovery denied; ordinary signature request remains allowed as designed. |
| ACCESS-06 | P0 | Tamper with client officeId, userId, admin-like fields or user-editable auth metadata. | Authorization derives from canonical active user/office, not client claims. |
| ACCESS-07 | P0 | Log out/disable/revoke during a long-running download/send/signing interaction and retry actions. | New unauthorized requests fail; in-flight outcomes follow explicit policy and cannot be falsely replayed under another identity. |
| ACCESS-08 | P0 | Access private storage objects through guessed/copied URLs or public data APIs using ordinary/anonymous credentials. | Legal records/PDFs remain private; app authorization cannot be bypassed through storage/database exposure. |
| API-01 | P0 | Exercise legacy/direct diligence create/update/delete, schedule and complete endpoints using correct and mismatched parent IDs. | Same office, read-only and completeness invariants as current UI; no bypass that permits premature completion or wrong-person documents. |
| API-02 | P0 | Exercise document metadata create/update/delete and both note deletion APIs, which lack corresponding visible controls in current workspace. | Valid scoped behavior or explicit disablement; no history/signing-integrity bypass. Record whether supported API-only or retired. |
| API-03 | P1 | Exercise catalog PUT endpoints not exposed as basic-catalog edit UI and legacy estampo/document-generation paths. | Correct office/rules/cache behavior; no claim of a visible edit/upload feature merely because the API exists. |
| API-04 | P1 | Call retired procurador-bank link/unlink/toggle routes and retired per-device signing delivery retry. | Clear retired response; current lawyer-derived bank/shared-folder flow remains usable. |
| API-05 | P0 | Call internal report tick/send, receipt reply sync, activity-outbox processing and signing maintenance anonymously/as a normal browser user. | Machine authorization enforced; users cannot trigger unrestricted cross-office background jobs. |
| API-06 | P0 | Send forged browser origins/content types to signing mutation/device routes and repeat invalid/replayed device challenges. | Origin/HTTPS/auth checks enforce intended trust boundary with no unintended mutation. |
| API-07 | P1 | Test malformed JSON, missing IDs, excessive page sizes/selection counts and stale deleted targets across action families. | Bounded, clear errors; no partial writes, server trace leaks or exhausted UI. |
| API-08 | P0 | Exercise `/api/diligencias/[id]/boleta`, which currently re-exports receipt generation, and `/api/encargos` office summaries. | Alias cannot bypass receipt-generation safeguards or be confused with associating an external boleta number; legacy summary remains private and accurate. |

## 25. Browser, mobile, accessibility and recovery

Run these across the relevant action families, not on the dashboard alone. Minimum families: case save, catalog save, wizard/PDF generation, bulk apply/undo, export, email send, report work, signature request.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| UX-01 | P1 | Perform core journeys in supported Chrome/Edge desktop and mobile browser; use narrow viewport/tablet. | Every action reachable; no clipped submit buttons, obscured dialogs or unreadable receipt cards. |
| UX-02 | P1 | Scroll a long workspace, open modal, scroll modal, close with buttons/Escape where supported. | Modal stays in viewport, background/focus behavior is usable and close never silently submits. |
| UX-03 | P1 | Navigate forms, dropdowns, tables, tabs and confirmations with keyboard and 200% zoom. | Focus visible, labels understandable, critical controls reachable and validation discoverable. |
| UX-04 | P1 | Cancel/close every destructive confirmation and press Enter/double-click near its buttons. | No accidental confirmation or duplicate operation. |
| UX-05 | P0 | Lose network before submit and after server commit for each mutation family; restore and retry. | Error versus uncertain success is handled truthfully; no duplicate case, payment, email, report or signature. |
| UX-06 | P1 | Slow network/read timeout, repeated refresh and browser Back while work is pending. | Useful progress, recoverable state, no wrong-record render from out-of-order responses. |
| UX-07 | P0 | Two same-office users update related records in separate sessions, then reload dashboards/workspaces. | Current committed state appears; no stale catalogs, amounts, completion or permission state treated as authoritative. |
| UX-08 | P1 | Use blocked pop-ups/download permissions when viewing PDFs and exporting XLSX. | User can recover/access the generated artifact; operation is not repeated unnecessarily. |
| UX-09 | P1 | Install PWA when browser offers Instalar App; accept/dismiss; launch installed app and log out. | Correct install affordance and session behavior; no installation prompt falsely offered in unsupported/standalone context. |
| UX-10 | P0 | With PWA/service worker active, load private screens then go offline/reload; switch accounts afterward. | Private pages/APIs/legal PDFs are not served from service-worker cache; no cross-account stale data. PWA installation does not imply offline case editing. |
| UX-11 | P1 | Deploy candidate update over an older cached installed app and reopen. | Current assets/API contracts load without persistent blank screen or obsolete dangerous controls. |
| UX-12 | P0 | Repeat execution/payment/report/signing date tests from PCs in Chile and another timezone, including midnight/DST. | Business dates and report boundaries are consistent; no one-day shifts or future-date rejection caused solely by tester timezone. |
| UX-13 | P1 | Load realistic customer-scale cases/receipts/history and two concurrent users; measure page/search/download/wizard times. | Meets recorded customer acceptance target; no unbounded freeze, timeout or silently omitted results. Existing performance test target is evidence to examine, not proof of hosted performance. |
| UX-14 | P0 | Simulate database/storage/mail/validator outage separately while performing dependent user action. | Clear recoverable failure, no false persisted/sent/signed success; previously valid artifacts remain usable after recovery. |
| UX-15 | P1 | Inspect Spanish labels, accents, empty states, errors and success messages in every module. | Customer-facing wording is understandable and consistent; remove internal implementation copy where it misleads users. |

## 26. Complete customer journeys — final acceptance

Perform these on the release candidate with real persistence, downloadable files, controlled email inboxes and real signing equipment where applicable. Mocks and unit tests do not replace these journeys.

| ID | Priority | Action / steps | Expected result |
| --- | --- | --- | --- |
| FLOW-01 | P0 | New office → first admin/member → catalogs/contacts/prices/PDF setup → demand → diligence → execution → receipt → custom estampo → download/print → complete case. | New customer can finish the core workflow from a clean office without hidden manual database repairs. All identities, dates, money and status reconcile. |
| FLOW-02 | P0 | Multi-bank lawyer + two ejecutados → multiple notifications → different wizard models/amounts → receipts/estampos → finish diligence/case. | Correct person/bank/template for every notification; no first-record fallback or premature completion. |
| FLOW-03 | P0 | Generate receipt → correct legal data → new numbered receipt → export/send listing → recipient reply → classify/resolve → payment/boleta → reconciliation → monthly report. | A single coherent financial/document history; no double charges, wrong attachments or inconsistent totals. |
| FLOW-04 | P0 | Member generates estampo → remote signature request → operator enables token → validated PDF → both PCs' office folder → old-file web archive recovery. | Exact signed document available at each promised destination; permission and consent model work on shipped versions. |
| FLOW-05 | P0 | Queue report/signing work, close browser, interrupt a provider/network once, recover through documented controls. | Work completes or clearly requests review; no duplicate irreversible operation or lost recovery evidence. |
| FLOW-06 | P0 | Office A and B perform similar ROL/document/email/report/signing actions concurrently; switch accounts and try exchanged IDs/URLs. | Complete customer separation across UI, caches, exports, inbox grouping, storage and signing. |
| FLOW-07 | P0 | Finish/archive a case, attempt disallowed actions, retain/download approved history and perform approved collections. | Read-only scope matches customer promise; terminal state cannot be silently reactivated or legal documents altered. |
| FLOW-08 | P0 | Repeat key journeys after production promotion/domain/config changes, using dedicated approved production test records/inboxes. | Final customer URL, auth, private files, mail workers, reports and token agent all use the intended production environment. Staging results alone are not substituted. |

## Release decision

The checklist is ready to execute; **the software is not marked ready for sale by this audit**. Release evidence should include:

- Every applicable P0 and P1 row passed on the candidate; every parameterized variant recorded. No blocked core flow accepted as a pass.
- F01–F16 resolved by a verified fix or explicit approved product behavior and customer instructions. Missing self-service features can be handled through tested managed procedures if that is the offer being sold.
- Complete customer journeys passed with downloaded/printed documents, actual test-inbox receipts and real validated signature evidence where signing is sold.
- All critical failures retested, plus an affected-area regression; outstanding minor usability issues have an owner and acceptable workaround.
- Final candidate and agent package identifiers, deployment URL, environment, test-office IDs, tester/date, artifacts and defect references saved together.
- A final launch-domain smoke test completed after any promotion/configuration change.

### Existing automated evidence to reuse, not assume

The repository includes Playwright suites for workflows, reports, PDF settings, Firmados, unmatched replies, responsive receipts, service-worker behavior and workflow performance, plus Vitest integration suites for authentication, receipt generation/collections/email/replies, reports, signing and infrastructure. Some browser tests mock API responses and some require seeded/live resources. They were inspected as supplementary intent evidence, **not executed or counted as passed in this audit**. Run appropriate suites against isolated fixtures and attach their real outputs, then still execute the real customer journeys above.

No ordinary web UI was found for arbitrary document upload, reopening archived cases, editing/deleting workspace notes, general user management, self-service password recovery, SaaS subscription billing. Manual reply association and attachment downloads were subsequently implemented for F04; deployment and live-mailbox acceptance remain pending. Do not add these to a demonstration as supported actions without implementation/deployment evidence. Some corresponding lower-level APIs exist and are explicitly covered under API-only tests.
