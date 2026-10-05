# Shared office signed archive (agent 0.13.0)

## User behavior

The Windows tray action **Abrir firmados de la oficina** opens
`<configured Firmados directory>\Oficina-<officeId>`. Every enrolled role
(`SIGNER`, `RECEIVER`, `SIGNER_RECEIVER`) sees the same office catalog. The signing
laptop needs no receiver role, connected token, or open PIN session to read it.

This is a read-only Cloud Files view of the canonical archive. Listing refreshes
metadata, not PDF bytes. Explorer creates native placeholders with names, sizes
and signature dates; opening/copying a file hydrates and verifies its SHA-256.
The service must run and have HTTPS access for uncached documents. Already opened
documents can remain in Windows' local cache; ordinary exported copies are outside
the provider's control. Windows may also request content for previews/scanning.

The view includes all server-validated, committed PDF signatures whose signature
record was created within the last **50 elapsed days**, including the lower
boundary, regardless of document type, source date, originating PC, or current
document version. This uses server UTC, not notification execution dates. All pages
are fetched before missing entries are removed. Failed/incomplete listing requests
preserve the last complete view. Normal polling is 15 seconds, with failure backoff.

When a signature leaves the window, only its managed placeholder/local cache is
removed. There is no retention deletion of its signed version, evidence, object,
or metadata. Open files may delay local cleanup until Windows releases them.
An offline PC displays its last successful catalog until reconnection.

**Firmados → Archivo de la oficina** searches the entire signed history by document
name, ROL, document ID, or signed-version ID, and downloads the exact signed version.
This remains true when another version is current. The existing document download
route also uses the same storage adapter.

## Security and invariants

- `office-folder` and `office-folder-download` use device challenge/session auth,
  office-scoped queries, session expiry and revocation checks. No client-supplied
  office ID is accepted. No storage path, storage URL or provider credential is
  returned to a device.
- The download endpoint checks age, exact committed artifact/version/hash, PDF
  header and byte length, and repeats authorization after storage I/O.
- Browser archive routes require an active member of the office and have no
  50-day filter. Responses are private/no-store and download activity is audited.
- Production folder ACLs grant the virtual service account maintenance rights and
  the enrolled Windows user read/execute rights. Rename/delete requests from
  consumers are denied. Neither local edits nor local deletion propagate upstream.
- Cleanup identifies native placeholders by provider identity. Unrelated files,
  conflicting filenames, legacy copies, and other offices' directories are not
  overwritten or recursively deleted. Local administrators remain trusted.
- Revocation and agent retirement clear managed caches where Windows permits;
  a restarted revoked agent also loads its protected manifest to clear stale
  caches. Already open files, exported copies and offline PCs cannot be recalled
  immediately. No new download is authorized for a revoked device.
- Database evidence and storage locators remain immutable. No schema migration or
  new Supabase Data API grants/policies are required.

## Upgrade and rollback

1. Build and deploy the web backend plus UI. Signing completion/enrollment no
   longer fan out delivery records. Old pending/failed deliveries are retained as
   history and not restarted. A transfer already `DOWNLOADING` may finish/ack.
2. Build/package agent **0.13.0** with the existing operator-managed distribution
   process and upgrade each authorized computer, including signer-only laptops.
   The release ZIP includes `Update-Notifica.ps1` for managed 0.12.0 installations;
   see [the PC upgrade steps](../../agents/windows/release/managed/ACTUALIZACION.md).
   It preserves enrollment/settings/documents, retains the previous payload and
   restores failed switches. `-Preflight` makes no changes; `-Recover` handles an
   interrupted update. New PCs continue to use `Install-Notifica.ps1`.
   This source change does not replace the currently installed agent or publish
   a production release. Coordinate the backend and agent rollout so legacy PCs
   do not remain without the new folder view.
3. The managed distribution requires Windows 11 x64 with an NTFS local volume and
   the Windows Cloud Files platform available. FAT/exFAT, UNC shares and folders within another
   cloud provider's sync root are not supported. Registration failure is visible
   in agent status; it never silently falls back to downloading every PDF.
4. Keep the existing configured folder. The new office subfolder deliberately
   leaves the old flat delivery copies intact. Review/archive those copies
   separately after rollout; no automatic deletion of user-owned legacy files.
5. Verify the tray folder on a signer and a receiver; open the same signature and
   compare hashes; search/download a signature older than 50 days in the web app.
6. Raise `SIGNING_MIN_AGENT_VERSION` to `0.13.0` after the coordinated rollout if
   desired. Keep the existing release rollback controls. Rolling the agent back
   does not re-enable backend fan-out; retained evidence and cloud objects survive.

## Storage provider boundary and future local server

`lib/documents/objectStore.ts` owns the `DocumentObjectStore` contract:
`assertPrivate`, `download`, immutable `upload`, and idempotent `remove`.
Logical bucket/key identities stay in existing version/artifact records. The
application exposes stable signature/document IDs, never physical hostnames.
The default `DOCUMENT_STORAGE_PROVIDER=supabase` uses private Supabase storage
with server-only credentials. The provided `archive-http` adapter is ready for a
dedicated HTTPS archive service implementing this contract:

| Request | Result |
| --- | --- |
| `GET /v1/buckets/<bucket>` | JSON `{ "private": true }`, authenticated access only |
| `GET /v1/objects/<bucket>/<key segments>` | Exact immutable PDF bytes |
| `PUT /v1/objects/<bucket>/<key segments>` | Durable creation; enforce `If-None-Match: *`, reject replacement |
| `DELETE /v1/objects/<bucket>/<key segments>` | Idempotent deletion (404 is accepted) |

All requests use `Authorization: Bearer <DOCUMENT_ARCHIVE_TOKEN>`, never a browser
or device credential. The server must enforce authentication/private namespaces,
path confinement, durable writes, TLS, backups, and immutable object creation.
The adapter forbids HTTP endpoints, URL credentials, redirects and unsafe key
segments; downloads are bounded to 32 MiB for historical PDFs. New signing input
limits remain unchanged. Do not expose an unauthenticated SMB share as this API.

For cutover, inventory **all referenced objects**, including older signatures,
source versions, and pending artifacts. Copy their exact logical bucket/key and
bytes to the dedicated server; verify length and SHA-256 against database records.
Briefly pause document/signature writes, copy and verify the final delta, and then
set `DOCUMENT_STORAGE_PROVIDER=archive-http`, `DOCUMENT_ARCHIVE_ORIGIN` (HTTPS
origin only) and `DOCUMENT_ARCHIVE_TOKEN` on the application server. Confirm reads,
writes and private access before resuming. No Windows-folder or UI changes and no
rewriting append-only evidence are needed. This is a whole-store cutover, not an
automatic tiering/migration job. Keep the prior provider for rollback, and copy
new writes back before reverting provider configuration.

## Verification

- `vitest run tests/integration/document-object-store.test.ts`
- `SIGNING_DATABASE_TESTS=1 vitest run tests/integration/signing-office-folder.test.ts tests/integration/signing-deliveries.test.ts`
  uses disposable PostgreSQL schemas, including 54 historical signatures.
- `Notifica.Agent.exe --office-folder-self-test` tests the real Windows driver,
  placeholders, hydration in a separate process, corruption rejection, restart,
  expiration and preservation of unrelated local files. It uses synthetic PDFs,
  a temporary folder and a temporary CNG key, without a token login.
- `playwright test e2e/firmados.spec.ts` covers archive search/download links and
  mobile layout alongside signing controls.
- `SIGNING_RECEIVER_AGENT_TESTS=1 vitest run tests/integration/signing-receiver-agent.test.ts`
  runs two real agent processes (signer and receiver), a loopback HTTPS service,
  a disposable database schema and temporary private Supabase objects. It reuses
  the previously accepted signed-PDF fixture; no USB token login is performed.

Validation on 2026-10-01: 345 regular tests passed; 39 database tests passed across
the office-folder, retired-delivery, artifact, center and operations suites;
12 native Cloud Files checks passed. Six browser tests passed, including the new
archive/mobile test. The separate real-center browser check reached a QA database
without `signing_devices`, `signing_items`, `document_signatures` or
`signing_artifacts` and returned 503; this is an existing QA schema prerequisite.
The database integration tests use the migrated application schema as their
template and verify the new service behavior independently.
The optimized Next.js production build, TypeScript, targeted ESLint, auth/audit
static verification and UTF-8 checks passed. A self-contained Windows build is
available locally in `output/office-folder-agent-0.13.0`; deploy the complete
directory through the managed update process, not just the EXE. It is a local
build, not a published or installed release.
The two-agent HTTPS/private-storage acceptance test also passed: zero downloads
during listing, identical signed bytes on both roles, interrupted-transfer retry,
agent restart, revocation cache removal, preservation of a legacy local copy,
unchanged source bytes and successful cleanup of test resources.

API references: [Microsoft Cloud Files registration](https://learn.microsoft.com/en-us/windows/win32/api/cfapi/nf-cfapi-cfregistersyncroot),
[Microsoft cfapi.h](https://github.com/microsoft/win32metadata/blob/main/generation/WinSDK/RecompiledIdlHeaders/um/cfapi.h),
[Supabase private storage](https://supabase.com/docs/guides/storage/serving/downloads).
