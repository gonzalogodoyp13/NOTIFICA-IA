# User-action fixes — 2026-10-29

These changes address audit findings F03, F12 and F14 in the working tree. They have not been deployed to Vercel. The launch audit's remaining cases are still unverified.

## Receipt payment isolation (F03)

- `Recibo.estadoCobro` and `Recibo.fechaPago` are now the authoritative payment fields. Mark paid and undo update individual selected receipts.
- Lists, paid/unpaid filters, Excel exports, reconciliation, dashboard totals and newly generated monthly reports use receipt payment state. An encargo is fully paid only when it has active receipts and all of them are paid.
- Regenerating a receipt preserves payment state. New/corrected receipts start unpaid without changing sibling receipts.
- Old bulk-operation snapshots remain undoable, but only for the receipt IDs explicitly selected in that operation. Boleta undo does not overwrite payment changes, and payment undo does not overwrite boletas.
- The transactional migration `20261029000000_receipt_payment_state` copies the existing diligence payment state into its existing receipts. It preserves recorded history; it cannot infer which historical sibling payments were unintended. Existing generated report files remain historical snapshots.

## Recent-case history isolation (F14)

- Version 2 storage keys include both the authenticated internal user ID and office ID supplied by the protected server layout.
- Changing that identity remounts the protected provider and its client state. The old ownerless version 1 history is discarded rather than assigned to the next account.
- History remains limited to ten unique recent cases. Invalid or unavailable browser storage does not break navigation.

## Estampo Cancel (F12)

- Editing changes a temporary draft. Confirm commits it; Cancel discards only that editing session.
- A first cancelled edit sends no override to generation. Cancelling after an earlier Confirm preserves the last confirmed text.
- Restablecer clears the override and returns to template-generated text.

## Verification

- `npm run test:integration`: 357 passed; opt-in suites skipped in the regular run.
- `npm run test:receipts:database`: six tests passed against real PostgreSQL in a generated disposable schema, with no application records copied. Exercises migration backfill, sibling isolation, per-receipt dates, paid/unpaid filters, exports, reconciliation, dashboard totals, monthly rows, encargo totals, new and legacy undo, boleta independence, office boundaries and stale previews.
- `npm run test:regressions`: four Chromium component interaction tests using the actual React components and mocked API transport. Covers Cancel/Confirm/Reset payloads and same-browser account/office changes.
- UTF-8 and auth/audit checks pass.
- `npm run build`: production build, lint, TypeScript validation and all 33 static pages passed. Prisma schema validation also passed.

The browser tests do not claim live authentication or rendered PDF acceptance. Their evidence is the displayed editor/history and the actual generation request payload. Keep AUTH-09 and the complete STAMP acceptance cases pending until the corresponding deployed workflows are exercised.

## Rollout

Deploy the new application and payment migration together. Pause payment and receipt-generation writes during the switch, apply the migration with `prisma migrate deploy`, generate the client and activate the new build before resuming writes. Do not leave the old application writing diligence payment fields after the backfill. Do not use `prisma migrate dev`.

The new migration has been tested in isolation, not applied to the shared application schema. Reverting only the application after new receipt payments have been written would expose stale diligence payment state; reconcile those values before any rollback to old payment code.

## Launch follow-up — 2026-11-05 (F01, F02, F04, F05, F10)

All five findings are fixed in the working tree; deployment and live acceptance remain pending. F010 in the request refers to F10 in the audit.

- **F01:** Nueva demanda requires a lawyer in the labeled select. Browser native validation prevents an empty selection; the existing API validation remains authoritative.
- **F02:** Preserve the active per-receipt payment-date workflow introduced for F03. README now distinguishes assignment, execution, generation and payment dates. Receipt management, export and reconciliation filter by execution date; monthly receipt reporting uses execution date with the existing legacy creation-date fallback. Payment date does not move a receipt between execution periods.
- **F04:** Both mobile and desktop unmatched queues expose a sent-email search and manual association, with destination details and explicit confirmation. The API checks office and provider, rejects already-associated replies, and writes the association, aggregate counts and actor audit event transactionally. No payment state changes. Attachment links exist in unmatched queues and dispatch details; downloads authorize the reply/attachment before retrieving original Graph/Gmail bytes, force attachment disposition, and disable caching. Gmail retrieval checks message identity and stored attachment checksum; fallback IMAP identifiers must match UID validity. No credentials or provider URLs are sent to the browser.
- **F05:** Closed case fields and notes are immutable through the editing and both note APIs. A conditional parent-row update inside each transaction serializes these writes with closure. The edit page blocks direct navigation, the overview hides editing, and notes remain readable without a creation form. Status dialogs explicitly retain collection operations and signatures of existing documents, subject to their existing permissions; closing a case does not cancel collections or signing.
- **F10:** Shared receipt queries use `Recibo.bancoId` / `Recibo.banco` for filtering and labels, so contact associations cannot broaden the selected receipt bank in management, XLSX, dispatch listings or reconciliation. A missing saved bank displays `-`; it is not inferred from mutable contact associations.

### Verification for this follow-up

- Required Prisma startup completed in order: migration status, migration deploy (46 committed migrations; none pending), client generation. No new migration is needed.
- Integration suite: **371 passed**, 90 opt-in tests skipped. New regressions cover association confirmation, office/provider boundaries, stale writes, counts/audit, attachment authorization/bytes/provider failures, Gmail identity checks, both closed-note APIs, and distinct receipt bank/date fields. Provider calls and database access in these new tests are mocked.
- Browser regressions: **7 passed**, including explicit association confirmation/cancellation and both terminal note states. These render actual components with mocked transport; they do not establish live-mailbox delivery or database persistence.
- Production build passed, including lint, TypeScript and all 33 static pages. UTF-8 validation passed.

### Release acceptance and attachment fallback

Deploy the application together, then execute CASE-04, FLOW-07, REPLY-13/14 and the bank/date cases with isolated office fixtures. Confirm exact PDF/XLSX/email bank agreement. Test Graph and Gmail with authorized controlled mailboxes; no live email was sent or downloaded during this implementation.

Downloads require the originally configured mailbox and the original provider message/attachment to remain available. Gmail currently retrieves from INBOX. Files over 20 MB (or Gmail messages over 20 MB), moved/deleted messages, and legacy attachments without provider identifiers require an authorized mailbox operator to locate the original message by sender, subject, received time and message identity and retrieve the attachment there. The app returns an explicit error rather than an empty file. Do not represent provider-retained attachments as an application-owned permanent archive.
