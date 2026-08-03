# Cache and Workflow-Wait Optimization Implementation Report

## 1. Outcome

Audit recommendations 7 (cache configuration and catalogs) and 8 (remove unnecessary waiting) are implemented for the PDF configuration, estampo/arancel catalogs, and notification/receipt/estampo workflow.

The implementation preserves the existing authentication/audit boundary, receipt transaction, consolidated workflow endpoint, and workflow indexes. It does not add Redis, offline legal-data support, or unrelated invalidation changes for notes, ROL status, membrete, reports, or other settings.

## 2. Database-backed cache revision

Migration `20260803120000_add_office_cache_revision` adds:

```prisma
cacheRevision Int @default(1)
```

to `Office`. Existing offices receive a non-null revision of `1`.

Every canonical mutation for cached office data increments this value atomically in the same Prisma transaction as the data change and its critical audit event:

- PDF configuration and asset references.
- Legacy estampo create, update, and delete.
- Wizard-template customization and reset.
- Arancel create, update, and delete.

Mutation responses include the resulting `cacheRevision`. After commit, the current process also evicts that office's local entries to reclaim memory immediately.

The authenticated local-user lookup selects the office revision along with the existing identity data. `RequestContext.officeCacheRevision` is therefore populated without adding another Supabase lookup or another local-user database lookup.

This gives Vercel instances a shared invalidation signal without Redis: a request using revision N+1 cannot reuse a key created for revision N. A direct database or storage change that bypasses the canonical API can remain visible through a same-revision cache entry for at most five minutes.

## 3. Bounded server cache architecture

The new server-only cache foundation supports:

- Five-minute TTL entries.
- LRU eviction.
- In-flight promise deduplication.
- Prefix and office invalidation.
- Rejected-loader removal.
- Weighted eviction for binary data.
- Deterministic fake-clock hooks for tests.
- Optional shorter per-load TTL values.

Two bounded caches are used:

| Cache | Entry limit | Weight limit | Normal TTL |
| --- | ---: | ---: | ---: |
| Configuration and catalogs | 512 | Not applicable | 5 minutes |
| Binary PDF assets | 64 | 32 MB | 5 minutes |

Configured-asset failures use a 30-second fallback entry so a transient storage failure is retried quickly. Cache keys include the namespace, office ID, cache revision, and all result-shaping parameters.

Examples:

```text
pdf-config:{officeId}:{revision}
pdf-asset:{officeId}:{revision}:{bucket}:{key}
legacy-estampos:{officeId}:{revision}
wizard-customs:{officeId}:{revision}:{category}
aranceles:{officeId}:{revision}:{attorneyId}:{sortedBankIds}
```

## 4. PDF configuration and asset caching

The PDF loader now caches the raw `Office` configuration row. `fallbackReceptorNombre` is applied only after the raw row is read, preventing a request-specific fallback name from contaminating office-wide cached state.

The following binary reads are cached:

- Signature PNG.
- Seal PNG.
- Receipt-stamp PNG.
- Bundled fallback image reads.

Concurrent configuration and asset calls share the same in-flight office configuration promise. Successful storage downloads are validated as PNG data before use. Errors log only sanitized asset kind and bucket information; storage keys and user-supplied receptor data are not logged.

A configured-asset download failure uses the existing fallback for 30 seconds. Assets are always revision-scoped, so a newly configured upload cannot reuse the previous revision's bytes.

The repository does not contain a bundled receipt-stamp image. To preserve the previous effective behavior when none is configured while still providing a valid authenticated preview, the fallback is a transparent 1x1 PNG. A configured receipt stamp is rendered normally.

All receipt, estampo preview, and estampo generation callers now provide a consistent PDF cache context containing office ID, office revision, and the appropriate receptor-name fallback.

## 5. Canonical PDF settings API and UI

An office-administrator-only **Configuración PDF** card and page were added under Ajustes.

Implemented endpoints:

```text
GET /api/ajustes/pdf
PUT /api/ajustes/pdf
GET /api/ajustes/pdf/assets/:kind
```

Supported asset kinds are `firma`, `sello`, and `reciboStamp`.

The PUT endpoint:

1. Validates all text, removal flags, file sizes, MIME types, and PNG signatures before mutation.
2. Rejects a replacement/removal conflict for the same asset.
3. Uploads replacements to unique office-scoped keys.
4. Removes newly uploaded objects best-effort if an upload or database transaction fails.
5. Updates configuration, increments the revision, and records one critical audit event in one transaction.
6. Records changed field names only; it excludes asset bytes, storage keys, and receptor text from audit metadata.
7. Deletes replaced/removed old objects best-effort after commit, using each old object's bucket.
8. Invalidates local office caches.
9. Returns the full authoritative settings representation and new revision.

The preview endpoint is authenticated, admin-only, returns `image/png`, and sets `Cache-Control: private, no-store`.

The page provides configured/fallback status, authenticated previews, replace/remove actions, client and server validation, duplicate-submit protection, authoritative response adoption, provider revision advancement, and a non-blocking four-second success notification.

## 6. Estampo and arancel catalog caching

Server-only loaders now cache these data sets independently:

- Active legacy estampos by office.
- Active global wizard bases and category counts.
- Active office-specific `EstampoCustom` overlays.
- Resolved wizard catalogs by office and category.
- Resolved active wizard templates by office and base ID.
- Active arancel rows by office, attorney, and normalized bank set.

Notification, ROL, execution, document, active-receipt, and historical-selection state remains live.

The consolidated receipt-workflow loader still performs one browser request. Its notification/document/receipt graph and historical inactive-selection lookup remain live, while static estampo options and arancel rows use revisioned server caches. The Prisma notification graph retains `relationLoadStrategy: 'join'`.

Wizard catalog, template, and category endpoints now share the same catalog source rather than duplicating Prisma queries. Catalog mutation clients advance the protected provider revision and invalidate only the relevant office-facing catalog/workflow queries while retaining their existing mutation response or targeted-refetch behavior.

## 7. Protected React Query lifetime

QueryClient ownership moved from the individual ROL page to a provider mounted by the protected layout. The protected server layout supplies office ID and the initial cache revision.

The provider:

- Persists while navigating between protected routes and ROLs.
- Is destroyed when the protected layout is left.
- Does not persist data to localStorage or IndexedDB.
- Keeps ordinary refetch-on-focus disabled.
- Uses five-minute catalog `staleTime` and 30-minute `gcTime`.
- Includes office ID and revision in catalog/workflow query keys.
- Makes old-revision queries unreachable immediately and eligible for normal garbage collection.

The per-ROL provider and confirmed-unused legacy settings/generation hooks were removed. No browser-side catalog fan-out was introduced.

## 8. Service-worker safety

The service-worker cache version is now `v1.1.0`. Activation removes prior caches.

Only these public static resources are cacheable:

- Manifest.
- Icons.
- Immutable `/_next/static/*` assets.

`/api/*`, navigation responses, React Server Component responses, protected pages, and all other requests are network-only. Dynamic pages were removed from precache, and no offline fallback can serve authenticated legal data.

The service-worker registration component is mounted in the root layout so fresh clients receive the new policy.

## 9. Authoritative stamp responses and wait removal

Custom and wizard stamp-generation endpoints now share the response envelope:

```ts
{
  documento: DocumentoItem
  notificacion: NotificacionItem | null
}
```

When a notification ID is present, the endpoint loads and serializes the notification using the same active-document filters and workflow-state derivation as the diligence list. Clients replace cached notification state with this server result instead of manufacturing completion flags, workflow status, or latest-document IDs.

Custom generation stores the submitted final text as `meta.estampoDraft` in the document-finalization transaction. The previous follow-up metadata PATCH is no longer needed. PDF rendering and upload remain outside the final database transaction; document finalization and the audit outbox entry remain transactional.

A shared typed client helper applies the response to role documents, role summary, diligence/notification lists, and relevant workflow/detail queries.

Four 1.5-second waits were removed:

- Execution-data save.
- Receipt generation without continuation.
- Draft save.
- Custom stamp generation.

Continue actions advance immediately after success. Terminal actions close immediately. The parent displays the typed completion message for four seconds, but that timer does not block modal closing or navigation. Mutation errors retain the open modal and entered form state.

The mobile execution modal now uses dynamic viewport height and internal overflow so its footer actions remain reachable at 390x844.

## 10. Automated verification

The required Prisma sequence was run before implementation and again after the migration. Final verification produced:

- `prisma migrate status`: 34 migrations found; database up to date.
- `prisma migrate deploy`: no pending migrations.
- `prisma generate`: Prisma Client 5.22.0 generated successfully.
- `prisma validate`: schema valid.
- `npm run check:utf8`: passed.
- `npm run lint`: passed with no warnings or errors.
- `npx tsc --noEmit`: passed.
- `npm run check:auth-audit`: passed across 285 files.
- `npm run test:integration`: 21 files and 92 tests passed.
- `npm run build`: production build passed.

The deterministic cache suite covers TTL expiration, in-flight deduplication, rejected loaders, entry LRU, binary byte-budget eviction, key/office isolation, local invalidation, 30-second fallback behavior, revision changes across simulated instances, out-of-band visibility after TTL, raw PDF fallback isolation, and architecture guards.

The final guarded QA command completed successfully, including seed, authentication refresh, integration checks, eight authenticated Playwright scenarios, and reset:

- PDF settings validation, upload, preview, revision invalidation, and restoration.
- Service-worker static caching and offline legal-data isolation.
- Consolidated workflow performance.
- End-to-end demand, diligence, notification, receipt, stamp, and export workflow.
- Receipt lifecycle idempotency/regeneration/correction.
- One-read execution wizard and local Step 1 continuation.
- Workflow safety status codes.
- Disabled authenticated-user enforcement.

Performance evidence from the guarded QA run:

| Measurement | Result |
| --- | ---: |
| Cold workflow read | 1,573.6 ms |
| Warm-up reads | 1,573.6 / 528.7 / 399.1 / 399.6 / 404.9 ms |
| Steady median, 20 reads | 389.7 ms |
| Steady p95, 20 reads | 406.1 ms |
| Steady range | 381.3–465.5 ms |

The required p95-below-500-ms gate passed.

## 11. Manual browser verification

Manual QA was performed with the authenticated office-admin QA account:

- Confirmed the PDF settings card/page is visible to the administrator.
- Changed receptor fields and observed immediate authoritative state and the four-second non-blocking success message.
- Confirmed all authenticated previews return valid images, including fallback states.
- Restored the baseline receptor configuration after the check.
- Opened a QA ROL and execution wizard and confirmed the consolidated workflow request supplies the catalog options without category/arancel browser fan-out.
- Checked the execution modal at 390x844, corrected the footer clipping, and reverified all controls remain within the scroll-safe modal.
- Checked console output; the only observed warning was injected by the Grammarly browser extension, not the application.

The controlled Chrome extension could not select a local upload file because Chrome did not grant that extension access to `file:` URLs. The equivalent real multipart upload/replacement/removal path was therefore verified through Playwright against the running QA application; all three asset kinds, previews, revision advancement, and final restoration passed.

Cache Storage inspection and offline transitions were also verified using a service-worker-enabled Playwright context, which has the required browser-context controls. API and protected navigation failed offline rather than returning cached business data; manifest/static caching remained available; activation removed the old cache.

The final guarded QA reset completed and left the QA office at its seeded baseline.

## 12. Deployment and monitoring notes

- Deploy the committed migration before application instances begin using `Office.cacheRevision`.
- Each process owns bounded cache memory; no cache entries are shared across instances.
- Cross-instance freshness depends on authenticated requests reading the current database revision.
- Out-of-band changes that do not increment the revision may remain stale until the five-minute TTL expires.
- PDF storage buckets must continue to permit the server-side upload, download, and delete operations used by the canonical endpoint.
- Old-asset deletion is deliberately best-effort after commit; failures should be monitored as storage hygiene warnings rather than rolling back an already valid configuration.
- Monitor sanitized configured-asset download failures, cache hit/miss behavior, cold-instance latency, revision growth, and storage cleanup failures after deployment.
- Browserslist/baseline-browser metadata is stale and produced non-blocking build warnings. Updating those development dependencies is separate maintenance work.
- Protected business data is intentionally unavailable offline.

## 13. Final repository state

The committed database migration was applied to the configured database as required by the repository startup rule. No files were staged or committed, no branch was pushed, and no application deployment was performed. The implementation and this report remain as working-tree changes for review.
