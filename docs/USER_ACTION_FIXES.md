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
