# LIBRA Competition Analysis and FEA Implementation Plan

> Purpose: document how LIBRA appears to generate, sign, and distribute FEA-signed estampos, and define implementation phases for reproducing the same user-facing behavior in NOTIFICA IA.
>
> Evidence date: September 2026. No secrets, complete device IDs, API keys, private keys, PINs, certificate serial numbers, or remote IP addresses are included in this document.

## 1. LIBRA COMPETITION

### 1.1 Updated principal conclusion

LIBRA is using two separate technical pipelines that appear to the user as a single action:

1. **Central generation and FEA signing.** When the estampo workflow is completed, LIBRA generates the PDF and a Windows signing process uses a USB token to apply the electronic signature.
2. **File distribution.** After the signed PDF is written to a customer-specific server folder, Syncthing distributes it to every previously enrolled computer. SyncTrayzor is the Windows tray application used to run and present Syncthing.

The USB token is therefore not connected to every destination computer. It is connected only to the signing computer or signing server. Destination computers receive an already-signed PDF.

```text
Workflow completed in LIBRA
          |
          v
Unsigned estampo PDF generated
          |
          v
Windows signing process
JSignPdf + SafeNet/PKCS#11 + E-Cert USB token
          |
          v
Signed PDF written to a customer folder on the server
          |
          v
Syncthing detects and indexes the new file
          |
          v
TLS-protected transfer to enrolled computers
          |
          v
Signed PDF appears in the local customer folder
```

The likely design is not "the browser talks directly to the token." The browser action causes a server-side job, and software running on the Windows signing machine talks to the token.

### 1.2 Confidence levels

The following labels are used throughout this section:

- **Confirmed:** directly observed in a PDF, application configuration, process information, or active Syncthing status.
- **High-confidence inference:** strongly supported by multiple observations, but the signing server itself was not inspected.
- **Unknown:** cannot be proven without access to the signing server or an answer from LIBRA/E-Cert.

### 1.3 Components identified

| Component | Finding | Confidence |
|---|---|---|
| Certificate provider | E-CERTCHILE / E-Cert | Confirmed from the PDF certificate issuer `E-CERTCHILE CA FEA 02` |
| Likely hardware family | SafeNet/Thales eToken, probably 5110 or 5110+ | High-confidence inference |
| Token middleware | SafeNet Authentication Client / PKCS#11 driver | High-confidence inference |
| PDF signing software | JSignPdf 1.6.4 using iText 2.1.7 | Confirmed from signed PDF producer metadata |
| Web application | LIBRA, running PHP/Apache on Windows | Confirmed from the application and server headers previously inspected |
| File synchronization engine | Syncthing | Confirmed |
| Windows tray wrapper | SyncTrayzor 1.1.29 | Confirmed |
| Remote sync peer | Device named `Server` | Confirmed |
| Local sync peer | Device named `Gonza` | Confirmed |
| Destination folder | `FIRMADOS GONZALO GODOY` | Confirmed |
| Exact PIN mechanism | Stored PIN, cached middleware login, or persistent PKCS#11 session | Unknown |
| Physical relationship between web, signing, and sync servers | They may be one machine or several machines | Unknown |

E-Cert currently identifies SafeNet eToken 5110 and 5110+ as compatible e-token models and publishes SafeNet drivers for Windows. This supports, but does not prove, the precise hardware model used by LIBRA:

- [E-Cert FEA e-token](https://www.ecertla.com/firma-electronica-avanzada-e-token/)
- [E-Cert manuals and drivers](https://www.ecertla.com/manuales-y-drivers/)

### 1.4 What was verified on the enrolled laptop

The installed configuration was inspected in read-only mode. No application setting, folder, file, connection, device, scan, or synchronization state was changed.

| Setting or state | Observed value |
|---|---|
| SyncTrayzor version | 1.1.29 |
| Syncthing version | 1.30.0 |
| SyncTrayzor process | Running and configured to start Syncthing automatically |
| Local GUI | Bound to `127.0.0.1:8384` |
| Local GUI TLS | Disabled, but bound only to loopback |
| Local GUI username/password | Not configured |
| Local API key | Present; value intentionally not read out or recorded |
| Local device name | `Gonza` |
| Remote device name | `Server` |
| Active connection | Non-local TCP client connection protected by TLS 1.3 |
| Folder label | `FIRMADOS GONZALO GODOY` |
| Effective local path | `C:\Users\<Windows user>\FIRMADOS GONZALO GODOY` |
| Folder type | `sendreceive` |
| Full rescan interval | 60 seconds |
| Filesystem watcher | Enabled |
| Watcher delay | 10 seconds |
| Pull order | `newestFirst` |
| Paused | No |
| Pause on metered networks | Disabled |
| Failed-transfer alerts | Disabled |
| Conflict alerts | Disabled |
| Active file versioning | Not detected |
| Syncthing indexed entries | 6,565 local and 6,565 global |
| Pending entries | 0 |
| Pull errors | 0 |
| Approximate synchronized size | 1.0 GB |
| PDFs observed by aggregate extension count | 6,074 |

The amount of data received during the observed initial synchronization was much larger than the amount sent. This supports the conclusion that `Server` holds the main copy and the laptop primarily acts as a receiving mirror.

SyncTrayzor is not the synchronization protocol and does not perform the signature. It is a Windows tray wrapper that starts and displays Syncthing. The original SyncTrayzor repository was archived in August 2025 and recommends evaluating a maintained fork for new installations:

- [SyncTrayzor repository](https://github.com/canton7/SyncTrayzor)
- [SyncTrayzor 1.1.29 release](https://github.com/canton7/SyncTrayzor/releases/tag/v1.1.29)

### 1.5 Reconstructed automatic signing sequence

The most likely background behavior when a user generates or completes an estampo is:

1. The user completes the applicable workflow in LIBRA.
2. LIBRA validates the workflow data and creates the final unsigned PDF.
3. LIBRA creates a signing request, launches a signing command, or writes the PDF to a watched signing queue.
4. A process running on a Windows signing machine selects the configured SafeNet PKCS#11 provider.
5. The process locates the E-Cert signing certificate on the connected USB token.
6. The process authenticates to the token using a PIN that is already available to the process or through an already-open token session.
7. The token performs the private-key operation internally. The private key should not leave the token.
8. JSignPdf writes the signed PDF to a customer-specific output folder.
9. Syncthing detects the new file through its filesystem watcher, normally after its configured 10-second delay. The 60-second full scan provides a fallback if a filesystem event is missed.
10. Because the pull order is `newestFirst`, recently created signed documents are prioritized when multiple files are pending.
11. The remote and local devices authenticate using their configured device identities and transfer the file over TLS.
12. The already-signed file appears in the local folder on every computer sharing that customer's folder.

Syncthing device-to-device traffic is protected by TLS, and device identities are derived from certificate fingerprints. See [Syncthing security principles](https://docs.syncthing.net/users/security).

### 1.6 Why connecting the USB appears to be sufficient

Physically connecting the token is only one requirement. A protected token normally also requires a PIN. Since LIBRA does not display a PIN field during each normal generation, one of the following must be true on the signing machine:

1. **The PIN is stored in the signing configuration or an enclosing script.** This is considered the most likely explanation for fully unattended signing.
2. **A PKCS#11 session remains open.** An operator enters the PIN once, after which multiple documents can be signed until logout, disconnection, restart, or timeout.
3. **SafeNet middleware caches the login.** The middleware maintains an authenticated token session that the signing process reuses.

The inspected destination laptop does not contain the signing token and cannot reveal which mechanism is used. Determining the exact mechanism requires inspection of the signing server.

If the token is disconnected, the expected outcomes are a pending queue, a signing error, or later manual reprocessing. This likely explains why LIBRA can have both an automatic path and a manual "Centro de firmado" for a selected date range.

### 1.7 Relationship between automatic and manual signing

The two observed user experiences can coexist:

- **Normal path:** completing the workflow automatically generates and signs the estampo.
- **Recovery path:** the manual center signs a date range or retries files that were not signed because the token, PIN session, driver, or signing service was unavailable.

Both paths likely use the same signing component and output folder.

### 1.8 What Syncthing contributes

Syncthing contributes only distribution and local availability:

- It recognizes explicitly configured device identities.
- It indexes files and their blocks.
- It detects new or changed files.
- It transfers those blocks through a TLS-protected connection.
- It verifies the transferred content.
- It materializes the file in the configured local folder.
- It resumes after network interruptions.

The configured `newestFirst` option controls the order of pending downloads, not the initial detection time. The filesystem watcher performs fast detection and the full rescan is a fallback. See [Syncthing configuration](https://docs.syncthing.net/users/config.html).

### 1.9 Important weaknesses or risks in the observed design

The following behavior should not be copied without modification:

#### Bidirectional destination folder

The laptop folder is configured as `sendreceive`. That means local modifications can be announced to the cluster. Whether the remote server accepts those changes depends on its own folder type, which could not be inspected.

For a legal-document delivery mirror, the central source should be `sendonly` and destination computers should be `receiveonly`. Syncthing documents `receiveonly` as the appropriate mode for mirrors or destinations where local changes should not be propagated. See [Syncthing folder types](https://docs.syncthing.net/users/foldertypes.html).

#### Disabled failure and conflict alerts

The local user receives fewer distracting notifications, but failures may go unnoticed. A new system should report errors to a central operations dashboard even if local balloon notifications remain disabled.

#### No detected local versioning

Without file versioning, accidental deletion or replacement may be harder to recover. The authoritative signed copy should be immutable in NOTIFICA IA, with the local folder treated only as a mirror.

#### Unmaintained SyncTrayzor version

SyncTrayzor 1.1.29 should not be introduced as a new critical production dependency. A maintained fork, official Syncthing process, or a NOTIFICA IA-owned Windows agent should be used instead.

#### Legacy signing format

The inspected competitor PDF used an older JSignPdf generation and did not demonstrate the modern SHA-256/PAdES-LT/TSA/OCSP target required for NOTIFICA IA. The competitor behavior should be reproduced, but not its legacy cryptographic choices.

### 1.10 Facts that remain unknown

The following must not be presented as confirmed facts:

- Exact SafeNet token model.
- Exact PKCS#11 DLL path on the signing server.
- Exact PIN storage or session mechanism.
- Whether the web server and signing server are the same physical machine.
- Whether the Syncthing `Server` device is also the token-signing machine.
- Server-side Syncthing folder type and versioning policy.
- The trigger implementation: direct command, queue, scheduled task, Windows service, or watched folder.
- The number of tokens and signing certificates operated by LIBRA.

## 2. IMPLEMENTATION

### 2.1 Target behavior in NOTIFICA IA

The required end-user behavior is:

1. A user completes the estampo workflow in the Rol Workspace.
2. NOTIFICA IA generates an immutable PDF version.
3. A signing job is created automatically.
4. The authorized Windows signing device signs the PDF with the configured E-Cert token.
5. The signed file is validated and becomes the authoritative current document version.
6. Every enrolled destination computer for the office receives the signed PDF in a configured local folder.
7. The user can see signing and delivery status in NOTIFICA IA.
8. A manual center permits bulk signing, retry, and recovery without creating duplicate signatures.

The destination computer does not require a USB token. Only a device performing the cryptographic signature requires the token.

### 2.2 Target architecture

```text
NOTIFICA IA web application
  |
  |-- PostgreSQL / Prisma
  |     |-- signing jobs and items
  |     |-- enrolled devices
  |     |-- certificate metadata
  |     |-- delivery acknowledgements
  |     `-- audit events
  |
  |-- Private Supabase Storage
  |     |-- immutable unsigned versions
  |     `-- immutable signed versions
  |
  `-- HTTPS device API
         |
         |-- Signer role
         |     `-- Windows service + tray + SafeNet/PKCS#11 + USB token
         |
         `-- Receiver role
               `-- Windows service that mirrors signed PDFs locally
```

The recommended baseline is a NOTIFICA IA-owned Windows agent using outbound HTTPS. Syncthing can remain an optional distribution track, but the product must not depend on SyncTrayzor 1.1.29.

### 2.3 Decisions that should remain stable across phases

Coding agents should treat these as project constraints unless the product owner explicitly changes them:

- The authoritative copy remains in private Supabase Storage.
- Signed output never overwrites the unsigned input object.
- Every input and output has a SHA-256 checksum.
- The initial production target is PAdES-LT with SHA-256, TSA, and OCSP/CRL evidence.
- Failure to obtain mandatory TSA or revocation evidence must not silently downgrade the signature level.
- The Windows agent communicates outbound over HTTPS; no public inbound port or DDNS is required.
- The agent never receives a Supabase `service_role`, database password, or unrestricted storage credential.
- Every database entity is scoped to an office.
- Every exposed table has appropriate grants and RLS policies; `TO authenticated` must also include an ownership/office predicate.
- The USB token's private key never leaves the token.
- The PIN is never written to logs, database rows, API requests, environment variables, analytics, crash reports, or process arguments.
- The first release uses a session PIN. DPAPI storage is optional and must remain behind an explicit policy decision.
- Bulk signing means one independent PAdES signature per PDF, processed during one authorized token session.
- Local destination folders are mirrors, not the authoritative archive.
- Repeated requests and retries must be idempotent.

### 2.4 Rules for coding-agent phase execution

**Owner-authorized sequencing exception (September 2026):** Phases 1 through 3 may
be implemented and verified before Phase 0 completes because their generic
database, queue and feature-gated enqueue contracts do not depend on signing hardware. Real token and
PAdES-LT execution still require Phase 0 evidence. See
[the implementation record](<FIRMAR DIGITAL IMPLEMENTATION.md>) for
the backend contracts, verification and decisions that later phases must preserve.

Each phase below is intended to be one bounded coding assignment. A coding agent should:

1. Read this complete document before beginning its assigned phase.
2. Inspect current code and migrations rather than relying only on this plan.
3. Implement only the named phase and its necessary supporting changes.
4. Preserve unrelated user changes in the worktree.
5. Add automated tests for the phase's state transitions and authorization boundaries.
6. Run the listed verification before reporting completion.
7. Record any changed assumption in this document or a phase implementation record.
8. Not start the next phase until the current phase's exit criteria are proven.

Before implementation work that touches Prisma or depends on the database schema, run in this order:

```powershell
prisma migrate status
prisma migrate deploy
prisma generate
```

Do not use `prisma migrate dev` unless the user explicitly authorizes it.

Before implementing a Supabase feature, re-check the current Supabase changelog and the relevant current documentation. Supabase behavior and security recommendations can change.

### Phase 0 — Provider confirmation and local signing proof of concept

**Goal:** prove that the chosen E-Cert token can create the required signature before changing the production workflow.

**Scope:**

- Obtain a non-production or controlled E-Cert token and certificate.
- Install the official SafeNet middleware on an isolated Windows test machine.
- Identify the correct 64-bit PKCS#11 library path.
- Confirm certificate enumeration without exposing the PIN.
- Confirm the certificate subject, issuer, usage, validity, chain, OCSP/CRL endpoints, and supported key algorithm.
- Obtain the TSA URL, authentication requirements, policy OID, limits, and production terms.
- Select and pin the signing engine version. Preferred options are current JSignPdf with the DSS engine or direct EU DSS integration.
- Produce one PAdES-LT PDF using SHA-256 and a SHA-256 TSA request.
- Validate the output using at least two independent validators.
- Ask E-Cert to confirm whether batch signing can reuse one authenticated token session and whether unattended DPAPI-based PIN access is permitted.

**Not in scope:** application UI, production database changes, bulk workflow, or automatic signing.

**Deliverables:**

- A short technical record containing middleware version, signing-engine version, PKCS#11 configuration shape, TSA requirements, trust-chain files, and validation results.
- A sample document containing no customer data.
- A decision: `SESSION_PIN_ONLY` or `DPAPI_ALLOWED_WITH_CONTROLS`.

**Exit criteria:**

- The sample validates as PAdES-LT.
- Signature digest is SHA-256.
- TSA timestamp validates.
- OCSP or CRL material is embedded and validates.
- The private key is confirmed to remain inside the token.

### Phase 1 — Signing domain model, migration, indexes, and RLS

**Goal:** create the persistent foundation for signing without yet starting any signature.

**Scope:**

- Add enums for device role, device health, job status, item status, signature level, attempt result, and delivery status.
- Add the following models with office-scoped relations:
  - `SigningDevice`
  - `DeviceEnrollment`
  - `SigningJob`
  - `SigningItem`
  - `SigningAttempt`
  - `DocumentSignature`
  - `DocumentDelivery`
- Relate `SigningItem` to the exact source `DocumentoVersion`.
- Relate `DocumentSignature` to the source and signed versions.
- Add uniqueness constraints for job idempotency and one successful signature per exact source version/signer combination.
- Add indexes for office/status/creation time, device/lease expiry, pending deliveries, and document signature history.
- Add RLS and grants appropriate to the repository's current Supabase exposure model.
- Ensure cross-office foreign-key relationships cannot be constructed.

**Not in scope:** queue processing, agent APIs, UI, or Windows code.

**Deliverables:** schema changes, committed migration, RLS policies, model-level validation helpers, and migration tests.

**Verification:**

- Prisma validation/generation succeeds.
- Migration deploys on the configured database.
- Integration tests prove that office A cannot read, create, update, or attach rows belonging to office B.
- Duplicate idempotency keys and duplicate successful signature records are rejected.

**Exit criteria:** the data model supports all required states without storing PINs or private credentials.

### Phase 2 — Backend signing state machine and queue service

**Goal:** implement deterministic job transitions independently of HTTP routes and signing hardware.

**Scope:**

- Create server-only signing types and status-transition rules.
- Implement job creation from a set of eligible document versions.
- Implement atomic item claim with `leaseOwner` and `leaseExpiresAt`.
- Implement lease renewal and safe release.
- Implement success, retryable failure, permanent failure, cancellation, and partial-batch aggregation.
- Prevent an item from being signed twice after success.
- Prevent a stale worker from committing after its lease has expired and been reassigned.
- Sanitize technical errors before storage.
- Emit canonical audit events for each critical transition.

**Suggested code area:** `lib/signing/` with pure state-machine logic separated from Prisma orchestration.

**Not in scope:** public APIs, automatic triggering, Windows agent, and PDF cryptography.

**Verification:**

- Unit tests cover every allowed and forbidden transition.
- Concurrent claim test proves only one worker receives an item.
- Expired-lease test proves safe reassignment.
- Retry tests prove that a completed signature is not duplicated.

**Exit criteria:** a fake in-process worker can take a job from `QUEUED` through `COMPLETED` without hardware.

### Phase 3 — Automatic enqueue on workflow completion

**Goal:** automatically request signing when a diligence reaches the completed state.

**Scope:**

- Integrate with the existing completion transaction in `app/api/diligencias/[id]/complete/route.ts`.
- After the derived workflow state is confirmed as completed, find all current, non-voided `Estampo` documents applicable to that diligence/notification.
- Capture each exact `currentVersionId` and `checksumSha256`.
- Create one signing job containing the eligible estampos.
- Use a deterministic idempotency key derived from office, diligence, completion event, and source versions.
- Record why documents were excluded: missing PDF, voided, already signed, already queued, or invalid state.
- Return signing status metadata without blocking the completion response until signature execution finishes.

**Not in scope:** token communication, device assignment UI, manual date-range signing, or distribution.

**Verification:**

- Completing an eligible diligence creates exactly one job.
- Repeating the same request creates no duplicate job.
- Cross-office and voided documents are excluded.
- A failed transaction creates neither a completion update nor an orphaned signing job.
- Existing completion workflow tests continue to pass.

**Exit criteria:** every newly completed eligible estampo has a traceable pending signing item.

### Phase 4 — Device enrollment and device-authenticated HTTPS API

**Goal:** securely authorize Windows devices without giving them user or infrastructure secrets.

**Scope:**

- Add an office-admin action to create a short-lived, one-use enrollment code.
- Store only a hash of the enrollment secret.
- Have the agent generate a device key pair locally.
- Register only the public device identity with the backend.
- Protect the private device credential with Windows CNG/DPAPI.
- Issue short-lived device sessions or use signed device challenges.
- Add device endpoints for enrollment, session renewal, heartbeat, job claim, lease renewal, input authorization, result submission, and delivery acknowledgement.
- Enforce office and device-role checks on every endpoint.
- Add device revocation and ensure revoked devices cannot renew, claim, download, upload, or acknowledge.
- Rate-limit enrollment, authentication, PIN-independent health, and claim endpoints.

**Not in scope:** tray UI, token operations, or PDF signing.

**Verification:**

- Expired/reused enrollment codes fail.
- A receiver cannot claim signing work.
- A signing device cannot access another office.
- Revocation invalidates subsequent access.
- No endpoint returns a Supabase service key or direct database credential.

**Exit criteria:** a test client can enroll, authenticate, heartbeat, and claim only authorized fake work over HTTPS.

### Phase 5 — Windows agent foundation, heartbeat, and token health

**Goal:** create an installable agent that can be monitored before it is allowed to sign.

**Scope:**

- Create a Windows service responsible for background connectivity and work processing.
- Create a per-user tray process for local status, approval, and PIN UI.
- Define a secured named-pipe protocol between the tray and service.
- Add startup recovery and graceful shutdown.
- Implement device enrollment and secure credential persistence.
- Implement heartbeat containing agent version, role, last successful contact, disk status, and sanitized error codes.
- Detect SafeNet middleware and configured PKCS#11 library.
- Detect token presence, certificate availability, subject, issuer, thumbprint, allowed usage, and expiration without performing a signature.
- Do not automatically try PIN values or consume token retry attempts during health checks.

**Not in scope:** final PDF signing, TSA/OCSP, document download, or local delivery.

**Verification:**

- Service survives restart and reconnects.
- Tray accurately shows service online/offline.
- Token insertion/removal changes health status.
- An expired certificate produces `CERT_EXPIRED`.
- Missing middleware produces `DRIVER_MISSING`.
- Heartbeats contain no PIN, full certificate export, private key, or service secrets.

**Exit criteria:** NOTIFICA IA can distinguish `OFFLINE`, `AGENT_ONLINE_TOKEN_MISSING`, `TOKEN_READY`, `CERT_EXPIRING`, `CERT_EXPIRED`, and `DRIVER_ERROR`.

### Phase 6 — PAdES-LT signing engine and PIN session

**Goal:** sign controlled inputs using the real token while keeping the PIN local.

**Scope:**

- Implement a signer adapter behind a stable interface so the underlying DSS/JSignPdf implementation can be replaced.
- Configure PKCS#11 without hard-coding machine-specific paths into the web application.
- Add local batch-approval UI showing requester, office, signer, document count, and document identifiers.
- Implement session PIN entry in the tray application.
- Send the PIN only through the secured local channel to the signing process.
- If a CLI process is used, provide the PIN through standard input, never command-line arguments.
- Keep PIN material in memory only, minimize copies, and clear buffers after use.
- Bind the authenticated token session to one batch and a short maximum lifetime.
- Produce PAdES-LT with SHA-256, TSA SHA-256, and online OCSP/CRL collection.
- Fail closed when the requested signature level cannot be produced.
- Never retry an incorrect PIN automatically.

**Optional subphase 6B — DPAPI PIN provider:**

- Implement only after the Phase 0 decision explicitly allows it.
- Use `DataProtectionScope.CurrentUser`, additional installation entropy, restrictive ACLs, explicit local opt-in, revocation, and a clear "Forget PIN" action.
- Do not use `LocalMachine` for a signer PIN.
- Prefer requiring local approval or Windows Hello before DPAPI decryption.

**Not in scope:** production document version updates, bulk web UI, or destination-folder distribution.

**Verification:**

- Test PDF validates as PAdES-LT.
- SHA-256 is used for the document signature and TSA request.
- Revocation material is embedded.
- PIN does not appear in logs, process listings, database, crash data, or environment.
- Wrong PIN stops without automatic repetition.

**Exit criteria:** the agent can safely sign a controlled file during one authorized local session.

### Phase 7 — Secure artifact transfer, server validation, and document versioning

**Goal:** connect the signing engine to real immutable NOTIFICA IA document versions.

**Scope:**

- Authorize download only after a valid claim and active lease.
- Use short-lived signed URLs or an authenticated streaming endpoint; keep the bucket private.
- Recalculate the unsigned PDF SHA-256 in the agent before signing.
- Reject mismatches before invoking the token.
- Upload the signed output under a new storage key with `upsert: false`.
- Recalculate the signed SHA-256 in the backend.
- Independently validate signature integrity, PAdES level, certificate identity, TSA, and revocation evidence.
- Create a new `DocumentoVersion` for the signed artifact.
- Create `DocumentSignature` and `SigningAttempt` evidence records.
- Update `Documento.currentVersionId` only after validation and database commit.
- Preserve the unsigned version and its storage object.
- Clean up uncommitted uploads safely after failure without deleting authoritative versions.

**Not in scope:** local receiver distribution or full control-center UI.

**Verification:**

- Tampered input is rejected before signing.
- Tampered output is rejected by the backend.
- Storage collision cannot overwrite an existing object.
- Failed validation does not change `currentVersionId`.
- Successful validation creates one signed version and one evidence record.
- Retrying a committed result is idempotent.

**Exit criteria:** one real NOTIFICA IA estampo can travel from queued source version to validated signed current version.

### Phase 8 — Firmados control center and manual recovery

**Goal:** provide operational visibility and reproduce LIBRA's manual date-range recovery behavior.

**Scope:**

- Implement the existing `app/(protected)/firmados/page.tsx` route.
- Show signer-device health, token status, certificate expiration, queue totals, failures, and delivery state.
- Add date filtering using the legal/business execution date rather than only `Documento.createdAt`.
- List eligible estampos with selection and select-all behavior.
- Add manual bulk queue creation with a confirmation modal.
- Display automatic jobs and manual jobs consistently.
- Permit retry only for eligible failed items.
- Permit cancellation only before irreversible signature work begins.
- Display sanitized business errors and a separate admin-only diagnostic code.
- Add polling or approved real-time updates without making the browser responsible for processing.

**Not in scope:** changing the local PIN policy, installing agents, or implementing the receiver filesystem mirror.

**Verification:**

- Office isolation is enforced server-side, not only through UI filters.
- Date filters use the defined business date and Chilean timezone rules.
- Manual bulk creation is idempotent.
- Completed items cannot be retried into duplicate signatures.
- Responsive behavior is covered by end-to-end tests.

**Exit criteria:** office administrators can understand and recover the signing pipeline without server access.

### Phase 9 — Receiver role and local signed-document mirror

**Goal:** make validated signed PDFs appear automatically in a local Windows folder on every enrolled computer.

**Recommended scope — NOTIFICA IA HTTPS mirror:**

- Add `RECEIVER` as an agent role; receiver devices never access signing or PIN functions.
- Configure a local destination folder during enrollment.
- Create delivery rows only after a signed document version is committed.
- Let the receiver request pending deliveries using a durable cursor.
- Download over HTTPS using short-lived authorization.
- Write to a temporary `.part` path.
- Verify expected length and SHA-256.
- Atomically rename to the final filename.
- Never overwrite a different existing file silently; use deterministic collision handling.
- Acknowledge delivery only after successful verification and final rename.
- Resume safely after interruption or restart.
- Maintain an optional local manifest containing document ID, signed version ID, checksum, and delivery time, but no PIN or private signing data.
- Treat local deletion as a local mirror issue; never delete the authoritative storage object in response.

**Optional alternative — Syncthing:**

- Use maintained Syncthing, not the archived SyncTrayzor 1.1.29 wrapper.
- Use one unique shared folder per office/customer.
- Configure the central folder as `sendonly`.
- Configure client folders as `receiveonly`.
- Enable server-side and/or destination versioning.
- Keep filesystem watcher enabled, use a 60-second fallback rescan, and use `newestFirst` if recent delivery priority is desired.
- Report Syncthing health centrally instead of silently suppressing all failures.
- Protect Syncthing `config.xml`, `cert.pem`, and `key.pem` because they establish device identity and access.

**Verification:**

- Two enrolled receivers obtain the same signed PDF.
- A third non-enrolled device cannot obtain it.
- Local modification does not propagate to the authoritative copy.
- Interrupted download resumes or restarts safely without a corrupt final file.
- A checksum mismatch never produces a final `.pdf` filename.
- Revoked receiver stops receiving new files.

**Exit criteria:** a signed estampo appears automatically and correctly on all active authorized receiver computers.

### Phase 10 — Failure policy, retries, monitoring, and audit completeness

**Goal:** make the complete workflow operable without hidden failures.

**Scope:**

- Define retryability for network, storage, TSA, OCSP/CRL, driver, token, PIN, validation, and disk errors.
- Use exponential backoff with limits for retryable infrastructure errors.
- Never automatically retry an incorrect PIN.
- Keep TSA/OCSP outages pending rather than silently downgrading PAdES.
- Aggregate job state as complete, partial, failed, or waiting for operator action.
- Create alerts for agent offline, token missing, certificate expiring, certificate expired/revoked, queue age, repeated TSA failure, repeated validation failure, delivery lag, and receiver disk failure.
- Add structured logs with correlation IDs and sanitized error details.
- Record canonical audit events for request, assignment, local approval, claim, signature attempt, validation, commit, retry, cancellation, delivery, device enrollment, and device revocation.
- Add retention rules for technical logs and long-lived signature evidence.

**Not in scope:** changing the signing format or building the installer.

**Verification:**

- Failure-injection tests cover every error class.
- Partial batches can complete remaining items.
- Operators can distinguish user action required from automatic retry pending.
- Audit history reconstructs who requested, which certificate signed, which version was signed, and where the result was delivered.
- No audit or error record contains the PIN or an unrestricted credential.

**Exit criteria:** no critical signing or delivery failure can remain invisible to the central dashboard.

### Phase 11 — Installer, upgrade path, pilot, and production rollout

**Goal:** deploy the system safely to real Windows computers and prove the complete behavior.

**Scope:**

- Produce a signed installer for the Windows service and tray application.
- Support `SIGNER`, `RECEIVER`, or combined roles through controlled enrollment.
- Install prerequisites or bundle the required pinned runtime safely.
- Set Windows service recovery behavior.
- Add signed update packages, staged rollout, rollback, and minimum supported agent version.
- Document token-driver installation separately from the NOTIFICA IA installer.
- Provide an administrative runbook for enrollment, certificate renewal, token replacement, PIN reset, device revocation, failed batches, TSA outage, and recovery.
- Pilot with one office, one signer token, and at least two receiver computers.
- Compare the local signed PDF against the authoritative signed storage version by SHA-256.
- Obtain operator acceptance before broader rollout.

**Mandatory pilot scenarios:**

- Normal automatic signing after workflow completion.
- Manual date-range signing.
- Token disconnected before claim.
- Token disconnected during processing.
- Incorrect PIN without automatic retry.
- Certificate expired and certificate revoked.
- TSA unavailable.
- OCSP unavailable or status unknown.
- Internet interruption during download and upload.
- Duplicate completion request.
- Agent restart with an active lease.
- Partial multi-document batch.
- Receiver offline and later reconnected.
- Receiver disk full.
- Local file modified or deleted.
- Device revoked.
- Certificate renewed and old certificate retired.

**Verification:**

- Build, lint, integration, and end-to-end suites pass.
- Installer/uninstaller tests preserve documents and revoke credentials appropriately.
- Security review finds no service-role exposure, cross-office access, PIN leakage, or unsigned-update path.
- Pilot users observe the required behavior: complete the workflow, wait for signing, and see the signed PDF appear locally without manual downloading.

**Exit criteria:** the pilot proves the complete automatic generation, FEA signing, authoritative storage, monitoring, and local delivery chain.

### 2.5 Final definition of done

The overall initiative is complete only when all of the following are demonstrated with real end-to-end evidence:

- Completing an eligible estampo workflow automatically creates one signing job.
- The exact immutable source version is bound to the job by SHA-256.
- Only an authorized signing device for the same office can claim the job.
- The configured E-Cert token produces a valid PAdES-LT signature using SHA-256.
- TSA and OCSP/CRL evidence validate and are retained.
- The PIN never leaves the Windows signing environment and is absent from all logs and process arguments.
- The signed artifact is stored as a new immutable document version.
- The backend independently validates the result before making it current.
- Repeated requests cannot create duplicate signed versions.
- Every authorized receiver computer obtains the same bytes and verifies the same SHA-256.
- Local receiver changes cannot modify or delete the authoritative copy.
- Cross-office access is rejected at API, database, and storage boundaries.
- Administrators can see device, token, certificate, signing, validation, and delivery health.
- Manual bulk signing can recover failed or historical work safely.
- All required failure scenarios have automated or documented acceptance evidence.

Achieving this definition reproduces the useful LIBRA behavior—automatic signing and local delivery—while improving cryptographic strength, tenant isolation, operational visibility, recoverability, and control of the signing credential.
