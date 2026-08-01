# Receipt Workflow Optimization Implementation Report

**Project:** NOTIFICA IA  
**Implementation date:** July 30–31, 2026  
**Report date:** July 31, 2026  
**Status:** Implemented and validated; changes remain uncommitted in the working tree  
**Related baseline:** `docs/AUTHENTICATION_AUDIT_IMPLEMENTATION_REPORT.md`

## 1. Purpose

This report records the implementation and validation work completed for audit recommendations 2, 3, and 4:

1. Redesign the receipt transaction.
2. Collapse the execution-wizard workflow requests.
3. Make receipt generation persist `estampoTipo`, `monto`, bank, and execution metadata, and return the updated notification so the client does not need an extra metadata PATCH or broad query invalidations.

Audit recommendation 1, authentication and auditing, had already been implemented before this work. The existing canonical authentication and audit foundation was preserved and used by the new receipt workflow.

## 2. Final outcome

| Audit objective | Result | Summary |
| --- | --- | --- |
| Redesign receipt generation | Complete | Receipt generation now uses explicit lifecycle operations, idempotent reservations, legal-data fingerprints, versioned regeneration, correction chains, and transactional finalization. |
| Collapse workflow requests | Complete | The execution wizard loads its receipt context from one workflow endpoint instead of separate notification, bank/arancel, and estampo lookups. |
| Save workflow metadata during receipt generation | Complete | Receipt generation now writes notification metadata and bank selection and returns the updated notification, receipt, and document in one response. |
| Remove post-generation metadata PATCH | Complete | Moving from Step 2 to Step 3 no longer needs a metadata PATCH after receipt creation. |
| Remove broad cache invalidations | Complete for receipt generation | Receipt success updates the relevant React Query caches directly. Other unrelated mutations retain their existing invalidation behavior. |
| Receipt lifecycle UI | Complete | The UI distinguishes initial generation, same-number regeneration, and correction with a new number and mandatory reason. |
| Automated and manual validation | Complete | Prisma checks, lint, TypeScript, focused regression coverage, prior full QA, database inspection, mobile wizard validation, and a full Chrome walkthrough were completed. |

## 3. Implemented architecture

### 3.1 Explicit receipt operations

The receipt API contract now has three explicit operations:

- `GENERATE`: create the first active receipt, document, PDF version, and receipt number.
- `REGENERATE`: preserve the receipt number and receipt/document identities while adding a new PDF document version. Regeneration is accepted only when the legal generation data is unchanged.
- `CORRECT`: issue a new receipt number, receipt, document, and first PDF version; mark the former receipt as `CORRECTED`; void its former document; and link the new receipt to the previous receipt.

For `CORRECT`, a correction reason between 3 and 500 characters is mandatory.

### 3.2 Canonical receipt-generation request

The generation request now includes all data required to produce a legally deterministic receipt:

```text
notificacionId
bancoId
operation
ejecucion.fecha
ejecucion.hora
estampoTipo
monto
medio
referencia
otros
correctionReason (CORRECT only)
```

The previous loose fields such as `variables`, `tipoEstampoNombre`, and a Boolean `regenerate` flag were removed from the validated contract.

### 3.3 Idempotency and request identity

Each generation request must provide an `Idempotency-Key` header. The browser client generates a UUID-based key for every intentional submission.

Two hashes serve different purposes:

- The request hash identifies the complete submitted request. Reusing an idempotency key with different input returns `IDEMPOTENCY_KEY_REUSED`.
- The generation fingerprint identifies the legal receipt data. It includes notification, bank, execution date/time, estampo selection, amount, payment method, reference, other amount, and a receipt-template version. It intentionally excludes the lifecycle operation and correction reason.

This separation permits a correction request to compare legal content accurately while still treating each API request as a distinct idempotent operation.

### 3.4 Reservation state machine

A new `ReceiptGenerationReservation` model records each generation attempt. Its states are:

```text
RESERVED -> UPLOADED -> COMPLETED
                    \-> FAILED
```

The reservation stores the office, ROL, diligence, notification, operation, idempotency key, request hash, reserved receipt number, document identity, target version, uploaded artifact metadata, final receipt/version identifiers, timestamps, and failure code.

Database constraints prevent:

- duplicate idempotency keys within one office;
- more than one in-progress generation for the same notification;
- duplicate assigned receipt sequence numbers;
- more than one correction directly superseding the same receipt.

The server can replay a completed request safely. If an artifact was uploaded before finalization, the reservation permits finalization to resume instead of producing a second PDF or number.

### 3.5 Transaction and artifact boundaries

Receipt generation is split into controlled phases:

1. Validate office ownership, notification, executed party, bank association, estampo availability, current receipt state, operation rules, and idempotency.
2. Reserve the receipt number, document identity, and target version in a database transaction.
3. Render and upload the PDF outside the database transaction.
4. Finalize receipt, document version, notification metadata, audit outbox event, and reservation state in a database transaction protected by a PostgreSQL advisory transaction lock.
5. Return the complete updated receipt workflow state.

Artifact-generation failure marks the reservation as `FAILED` and records a non-critical `receipt.generation_failed` audit event. This prevents long PDF/storage work from holding a database transaction open while retaining recovery information.

### 3.6 Receipt lifecycle rules

The following server-side rules are enforced:

- A second `GENERATE` request is rejected when an active receipt already exists.
- `REGENERATE` and `CORRECT` require an active receipt.
- `REGENERATE` compares the legal fingerprint and returns `RECEIPT_CORRECTION_REQUIRED` if the submitted legal data differs.
- `REGENERATE` preserves the receipt number and creates the next document version.
- `CORRECT` requires a reason and creates a new receipt number and new document.
- The corrected receipt receives `status = CORRECTED`, `voidedAt`, `voidReason`, and `voidedByUserId`.
- The corrected document is also voided.
- The new receipt records `supersedesReciboId`.
- Only one `ACTIVE` receipt remains for the notification.
- Inactive historical estampo selections may be used for an exact historical regeneration, but not for a new or changed receipt.

## 4. Database changes

Migration added in:

`prisma/migrations/20260730150000_optimize_receipt_workflow/migration.sql`

### 4.1 Notification fields

- Added nullable `Notificacion.bancoId`.
- Added a restrictive foreign key to `Banco`.
- Added indexes for `bancoId` and `(diligenciaId, createdAt)`.
- Added the corresponding `Banco.notificaciones` relation.

### 4.2 Receipt fields

- Added nullable `Recibo.bancoId` and its bank relation.
- Added `ReceiptStatus` with `ACTIVE`, `VOIDED`, and `CORRECTED`.
- Added `generationFingerprint`.
- Added `voidedAt`, `voidReason`, and `voidedByUserId`.
- Added unique `supersedesReciboId` and the self-referential correction-chain relation.
- Added indexes for bank and receipt status.
- Added the corresponding `Banco.recibos` relation.

### 4.3 Reservation model and enums

- Added `ReceiptGenerationReservation`.
- Added `ReceiptGenerationStatus`.
- Added `ReceiptGenerationOperation`.
- Added uniqueness and partial indexes for idempotency, active notification reservations, and assigned sequence numbers.

### 4.4 Backfill behavior

The migration backfills notification bank selection only when the attorney-to-bank relationship is unambiguous. Ambiguous historical notifications remain null rather than silently selecting the first bank. Receipt bank values are then backfilled from the related notification when available.

## 5. Receipt generation service

The former large receipt route was reduced to request/authentication orchestration. The generation implementation now lives in dedicated modules:

- `lib/recibos/generation-core.ts`: stable hashing, legal fingerprint construction, canonical execution metadata, and idempotency-key validation.
- `lib/recibos/generation.ts`: context validation, reservation, PDF generation/upload, lifecycle enforcement, transactional finalization, cache-ready response serialization, and audit/outbox handling.

The PDF builder now receives the selected bank explicitly. It no longer assumes that the first bank related to the attorney is the correct bank.

New receipt-specific API errors were added:

- `RECEIPT_EXISTS`
- `RECEIPT_GENERATION_IN_PROGRESS`
- `RECEIPT_CORRECTION_REQUIRED`
- `IDEMPOTENCY_KEY_REUSED`
- `RECEIPT_GENERATION_FAILED`

API errors may now include structured `details`, allowing the UI to respond to lifecycle conflicts without parsing error-message text.

## 6. Collapsed workflow read

A new authenticated endpoint was added:

```text
GET /api/roles/:rolId/diligencias/:diligenciaId/notificaciones/:notificacionId/workflow
```

An optional `?detail=stamp` query includes estampo content only when Step 3 needs it.

The endpoint returns one office-scoped workflow payload containing:

- the serialized notification and workflow state;
- the selected executed party and address/comuna;
- allowed banks and selected bank;
- execution date and time;
- selected estampo type;
- current amount;
- active wizard and custom estampo options;
- bank- and attorney-derived arancel data;
- the active receipt state;
- a historical inactive estampo selection when required for exact regeneration.

The implementation is centralized in:

- `lib/workflow/receiptWorkflow.ts`
- `lib/workflow/receiptWorkflowTypes.ts`
- `lib/workflow/notificationView.ts`

`notificationView.ts` also replaced duplicated notification serialization in the diligence list route, ensuring that both the list and receipt response derive workflow status, completeness, latest receipt, and latest estampo consistently.

## 7. Notification metadata and response redesign

Successful receipt generation now persists the following in the same finalization transaction:

```json
{
  "ejecucion": { "fecha": "YYYY-MM-DD", "hora": "HH:mm" },
  "fechaEjecucion": "ISO timestamp",
  "horaEjecucion": "HH:mm",
  "estampoTipo": { "kind": "CUSTOM or WIZARD", "...": "selection data" },
  "estampoId": "custom estampo id or null",
  "monto": 25000
}
```

It also persists `bancoId` on both the notification and the receipt.

The receipt endpoint returns:

- the applied operation (`created`, `regenerated`, or `corrected`);
- the generated/updated document view;
- the active receipt view;
- the fully serialized updated notification.

Because the notification comes back from the receipt request, the wizard no longer makes an extra metadata PATCH after generation.

The general notification progress PATCH remains available for explicit draft/progress saves. It now validates `{ meta, bancoId? }`, validates the bank against the demand attorney and office, audits changed fields, and returns a deliberately narrow progress response.

## 8. Frontend and cache behavior

### 8.1 Wizard state

`EjecutarWizard` now initializes from the consolidated workflow payload:

- execution date/time;
- selected bank;
- estampo selection;
- amount/arancel;
- active receipt and operation mode;
- optional historical estampo selection.

Step 1 to Step 2 continuation is local and does not issue a metadata PATCH. Receipt submission sends the complete server contract.

### 8.2 Lifecycle controls

When there is no active receipt, the wizard uses `GENERATE`.

When there is an active receipt, the user can select:

- **Regenerar el mismo recibo** (`REGENERATE`); or
- **Corregir y emitir un nuevo número** (`CORRECT`).

Correction displays a mandatory reason field. If the server detects changed legal data during regeneration, the UI switches to correction mode and presents the required reason instead of silently issuing an incorrect replacement.

### 8.3 Targeted React Query updates

Receipt success directly updates:

- the notification/diligence list cache;
- the role workspace summary;
- the role document cache;
- the consolidated receipt workflow cache.

For correction, the superseded receipt/document is removed from active cached views and the new active objects are inserted. This replaced the post-generation metadata PATCH and two broad query invalidations that previously caused extra network traffic and transient stale state.

### 8.4 Cache regression found during manual QA

Manual testing exposed a subtle cache regression after saving Step 3:

- The progress PATCH returned a deliberately partial notification.
- The client parsed that partial response with the full `NotificacionItemSchema`.
- `workflowStatus` in the full schema defaults to `nueva`.
- Parsing therefore manufactured `workflowStatus = nueva`, which overwrote the correct cached `recibo_generado` state.

The fix introduced `NotificationProgressUpdateSchema`, a pick of only the fields actually returned by the progress PATCH:

```text
id, diligenciaId, meta, ejecutadoId, bancoId, createdAt, updatedAt, step1Done
```

The mutation now merges only those fields. It can no longer overwrite receipt/estampo workflow state with a schema default.

A focused browser regression test was added to prove that after generating/correcting a receipt, entering Step 3, and saving the draft, the card still exposes **Editar recibo** and **Continuar con estampo** without reloading.

### 8.5 Mobile wizard controls

The wizard footer now uses a wrapping flex layout. At a 390×844 viewport, the four receipt controls wrap to separate rows as needed and remain within the modal bounds.

## 9. Active-data filtering

Consumers that should represent current operational state were updated to exclude superseded receipts and voided documents:

- dashboard receipt queries;
- receipt list/search;
- receipt bulk operations and undoability checks;
- monthly reports;
- role workspace summaries;
- notification document serialization.

This prevents corrected receipt history from being double-counted or presented as active work while preserving the historical records for audit purposes.

## 10. Audit changes

The canonical event catalog was extended with:

- `receipt.corrected` as a critical receipt event;
- `receipt.generation_failed` as a non-critical receipt event.

Receipt event metadata now includes the reservation ID and may include the prior receipt ID. Generation failure metadata records the reservation, notification, reserved receipt number, requested operation, and error code.

Success events are queued through the existing audit outbox within finalization. Best-effort failure events are recorded if artifact generation cannot complete.

The API error handler now avoids recording a duplicate request-level audit failure when a more specific event has already been recorded for that request.

## 11. Automated validation

### 11.1 Prisma startup rule

The repository-required Prisma sequence was run in order:

1. `prisma migrate status`
2. `prisma migrate deploy`
3. `prisma generate`

Migration status was current and there were no pending migrations. `prisma generate` initially encountered a Windows engine DLL lock held by local development servers. The workspace-owned servers were stopped safely, and generation then completed successfully. `prisma migrate dev` was not used.

### 11.2 Static validation

- ESLint passed after the final cache fix.
- `tsc --noEmit` passed after the final cache fix.

### 11.3 Integration coverage

`tests/integration/receipt-generation-core.test.ts` covers:

- stable request hashing;
- legal fingerprint behavior;
- canonical execution metadata;
- correction-reason validation;
- idempotency-key validation.

`tests/integration/canonical-audit-foundation.test.ts` was updated for reservation-aware receipt event metadata.

### 11.4 End-to-end coverage

`e2e/workflows.spec.ts` now covers:

- receipt requests with complete execution, bank, estampo, and operation data;
- required idempotency headers;
- idempotent replay without a second receipt or document version;
- same-number regeneration and document-version increment;
- rejection of changed legal data during regeneration;
- correction with a new number and supersession link;
- corrected receipt/document status and exactly one active receipt;
- generated, regenerated, and corrected canonical audit events;
- one consolidated workflow read;
- no Step 1 continuation PATCH;
- no separate arancel or estampo-category fetches;
- correction controls and reason field;
- the Step 3 cache regression;
- mobile wizard/modal button bounds.

The focused regression test passed after the cache fix. The broader automated QA suite had also passed before that final narrowly scoped cache correction; static checks and the focused affected flow were rerun afterward.

## 12. Full manual Chrome walkthrough

The final manual walkthrough used the authenticated Chrome session at:

```text
http://localhost:3002/dashboard
```

No password or reusable credential is recorded in this report.

The disposable seeded role `QA-P9-CUSTOM` and notification `qa-p9-noti-custom` were used.

### 12.1 Initial generation

1. Opened the QA role diligence workflow.
2. Continued directly to receipt Step 2 using the seeded execution date, time, executed party, and bank context.
3. Selected `QA-P9 Custom Estampo`.
4. Confirmed the configured amount auto-populated as CLP 25,000.
5. Selected **Guardar recibo y continuar**.
6. Confirmed receipt `R-2026-000039` was generated and Step 3 opened with rendered estampo text containing the executed party, ROL, tribunal, and `14:00` execution time.

### 12.2 Immediate cache-state regression check

1. Saved Step 3 as a draft instead of generating the estampo immediately.
2. Waited for the wizard to close.
3. Without reloading, confirmed the card still displayed:
   - `Recibo generado`;
   - **Editar recibo**;
   - **Continuar con estampo**;
   - **Ver recibo**.

This manually confirmed the partial-response cache fix.

### 12.3 Estampo generation

1. Reopened Step 3 with **Continuar con estampo**.
2. Generated the estampo PDF.
3. Confirmed the success message and immediate card state:
   - `Ejecutada`;
   - `QA-P9 Custom Estampo`;
   - **Ver estampo**;
   - **Editar**;
   - receipt actions remained available.

No reload was needed for the card to reach the correct state.

### 12.4 Same-number regeneration

1. Opened **Editar recibo**.
2. Confirmed the active receipt was `R-2026-000039`.
3. Kept **Regenerar el mismo recibo** selected.
4. Regenerated the receipt.
5. Reopened the receipt editor and confirmed the active number remained `R-2026-000039`.

### 12.5 Correction workflow

1. Selected **Corregir y emitir un nuevo número**.
2. Confirmed the mandatory **Motivo de corrección** field appeared.
3. Entered `Corrección manual QA del flujo`.
4. Submitted the corrected receipt and continued to Step 3.
5. Saved the Step 3 draft.
6. Confirmed the active receipt number changed to `R-2026-000040` and the executed/card state remained correct.

### 12.6 Database verification before cleanup

A read-only Prisma query confirmed:

- notification `qa-p9-noti-custom` contained:
  - `monto: 25000`;
  - `ejecucion.fecha: 2026-06-10`;
  - `ejecucion.hora: 14:00`;
  - compatibility execution fields;
  - a custom `estampoTipo` and matching estampo ID;
  - the generated estampo draft;
  - `bancoId: 26`.
- `R-2026-000039` had status `CORRECTED` and the entered correction reason.
- the document for `R-2026-000039` had a non-null `voidedAt`.
- `R-2026-000040` had status `ACTIVE` with no void reason.
- the new receipt referenced its own active document.
- the generated custom estampo document remained active.
- exactly one receipt remained active for the notification.

These receipt numbers and database records were temporary QA evidence and were removed by the fixture reset described below.

### 12.7 Mobile-width validation

The receipt editor was tested at an explicit 390×844 viewport.

All wizard footer controls remained within the modal:

| Control | Approximate horizontal bounds |
| --- | --- |
| Cancelar | 135–222 px |
| Anterior | 234–318 px |
| Regenerar recibo | 178–318 px |
| Guardar recibo y continuar | 116–318 px |

The footer wrapping fix therefore passed.

### 12.8 Browser console

The Chrome error/warning log contained no application errors. The only warnings originated from the installed Grammarly Chrome extension, including its default logger and missing experimentation-gate messages.

## 13. QA cleanup and final browser state

After database evidence was collected, the disposable QA-P9 fixtures were reset using the repository QA reset task with mutation guards enabled.

The reset completed successfully and reported the QA seed ready. This removed the temporary receipts, corrected history, documents, and generated estampo used in the walkthrough and restored the seeded test scenario.

Chrome was returned to `http://localhost:3002/dashboard` and left open in a deliverable state. The temporary port-3001 development server started during troubleshooting was terminated. The user's port-3002 server was not restarted or stopped.

## 14. Defects found during manual validation

### 14.1 Fixed: receipt state reverted to “Nueva” after Step 3 draft save

**Cause:** A partial progress response was parsed as a full notification, causing a default workflow status to overwrite the cache.  
**Resolution:** Added a partial response schema and restricted the cache merge to returned fields.  
**Regression coverage:** Added to the focused Playwright workflow test and confirmed manually without a reload.

### 14.2 Fixed: mobile wizard footer controls overflowed

**Cause:** The footer action row could not wrap at narrow viewport widths.  
**Resolution:** Added `flex-wrap` to the wizard footer.  
**Regression coverage:** Added modal/button bounding-box assertions at 390×844 and confirmed manually.

## 15. Remaining observation outside the requested receipt scope

At mobile width, the global authenticated application shell still has horizontal overflow unrelated to the receipt wizard.

Measured at the 390×844 override:

- CSS viewport width: approximately 375 px after the scrollbar;
- document scroll width: approximately 537 px;
- body scroll width: approximately 538 px.

The overflowing elements were the global navigation links and search area in the application header. The receipt modal itself and its action controls fit correctly. This shell issue was not changed because it is outside the receipt/workflow audit scope and should be addressed as a separate responsive-layout task.

## 16. Files added

- `app/api/roles/[id]/diligencias/[diligenciaId]/notificaciones/[notificacionId]/workflow/route.ts`
- `lib/recibos/generation-core.ts`
- `lib/recibos/generation.ts`
- `lib/workflow/notificationView.ts`
- `lib/workflow/receiptWorkflow.ts`
- `lib/workflow/receiptWorkflowTypes.ts`
- `prisma/migrations/20260730150000_optimize_receipt_workflow/migration.sql`
- `tests/integration/receipt-generation-core.test.ts`
- `docs/RECEIPT_WORKFLOW_OPTIMIZATION_IMPLEMENTATION_REPORT.md`

## 17. Files modified

- `app/(protected)/roles/[id]/diligencias/EjecutarWizard.tsx`
- `app/api/diligencias/[id]/recibo/route.ts`
- `app/api/roles/[id]/diligencias/[diligenciaId]/notificaciones/[notificacionId]/route.ts`
- `app/api/roles/[id]/diligencias/route.ts`
- `e2e/workflows.spec.ts`
- `lib/api/server.ts`
- `lib/audit/catalog.ts`
- `lib/dashboard/service.ts`
- `lib/hooks/useRolWorkspace.ts`
- `lib/pdf/recibo.ts`
- `lib/recibos/bulk.ts`
- `lib/recibos/query.ts`
- `lib/reports/monthlyReport.ts`
- `lib/roles/workspace.ts`
- `lib/validations/rol-workspace.ts`
- `lib/workflow/completeness.ts`
- `prisma/schema.prisma`
- `tests/integration/canonical-audit-foundation.test.ts`

## 18. Working-tree and handoff notes

- The implementation and this report are currently uncommitted.
- The working tree also contains manual-development log files and `test-results/`; these are generated artifacts and are not part of the product implementation.
- No test password is documented here.
- The database migration is already deployed to the configured environment and Prisma Client generation completed successfully.
- Do not use `prisma migrate dev` in this repository. Future agents must follow `prisma migrate status`, `prisma migrate deploy`, and `prisma generate` in that order before schema-dependent work.

## 19. Recommended next steps

1. Review the complete diff and this report together.
2. Decide whether generated manual log/test-result artifacts should be deleted or added to `.gitignore` before committing.
3. Run the full automated QA suite once more immediately before the final commit if the branch has changed since this report.
4. Commit the receipt workflow implementation and migration as one coherent change set, or split schema/service and UI/test work into clearly ordered commits.
5. Track the global mobile application-shell overflow as a separate responsive-layout issue.

## 20. Completion statement

The requested receipt transaction redesign, workflow-request collapse, and receipt-owned metadata persistence were implemented. The complete functional path was exercised manually through creation, draft save, estampo generation, same-number regeneration, correction, database verification, mobile wizard validation, console inspection, and QA cleanup. The target workflow passed, including the cache and mobile-footer regressions discovered during validation.
