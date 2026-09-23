# Windows agent (Phases 4–9)

The x64 .NET 10 agent consists of a Windows service and a per-user tray process
from the same executable. It enrolls over HTTPS, maintains short-lived device
sessions and reports disk/token/certificate health every 30 seconds. Normal
signer foundation mode does not log into the E-Cert token or sign PDFs.
Enrolled receiver roles automatically mirror committed signed documents.
Phase 6 adds an explicit controlled-test mode with local batch approval
and protected PIN entry. Phase 7 connects an enrolled signer to immutable server
documents when `signingEngine` is explicitly configured. Enrollment codes and
token PINs use separate UI and protocol paths.

Build from this directory with `./build.ps1 -Dotnet <path-to-dotnet.exe>`.
The pinned SDK is in `global.json`; the published payload includes its runtime.
The direct NuGet dependency is Microsoft's `System.ServiceProcess.ServiceController`
10.0.12, which supplies the `ServiceBase` lifecycle. There are no third-party
NuGet packages. `--self-test` exercises Windows CNG,
key persistence/export denial, local IPC/DACL, and certificate-health boundaries.

From an administrator PowerShell 7, run `./install.ps1 -ServerUrl https://your-host/
-AllowedUserSid <interactive-user-SID> [-CertificateFingerprint <SHA-256>]`.
The installer creates the `NotificaSigningAgent` virtual service account,
protects the binary/configuration/state directories, sets automatic recovery,
and registers the user's tray at logon, including on battery power. Installation
resolves the configured SID to its Windows account for Task Scheduler and creates
the machine CNG key locally with administrative rights. Its protected key ACL
allows the virtual service to use it and retains SYSTEM/administrator management;
the interactive tray receives no private-key access. It refuses to overwrite
existing identity.
This development installer is not the signed production installer/update channel
specified for Phase 11. Do not distribute it as the production release.

Office administrators use `POST /api/signing/devices` with JSON
`{"action":"enroll","role":"SIGNER"}` (or `RECEIVER`/`SIGNER_RECEIVER`) and
their normal authenticated browser session, matching Origin and HTTPS.
The response contains a ten-minute one-use enrollment code. Paste it into the
tray's enrollment dialog and approve the device name. The agent generates its
RSA-3072 CNG key locally during installation, disallows private export, and submits only its public
identity with proof of possession. No web login credentials or infrastructure
secrets are stored in the agent. An uncertain enrollment response needs admin
inspection before issuing another code; enrollment must not be retried blindly.

`GET /api/signing/devices` lists office devices and derives OFFLINE after 90
seconds without heartbeat. POST actions `revoke` + `deviceId` and
`revoke-enrollment` + `enrollmentId` revoke devices/codes. Revocation invalidates
all sessions and challenges; an agent must be enrolled as a new identity to return.

The device API prefix is `/api/signing/device/`:

| POST action | Contract |
| --- | --- |
| enroll | One-use code, canonical base64 SPKI RSA-3072 key, name and signed proof |
| challenge | Device ID; returns nonce and challenge ID valid for 60 seconds |
| session / session-renew | RSA/SHA-256 proof of the one-use challenge; returns a five-minute bearer session |
| heartbeat | Strict public metadata only; certificate fingerprint is SHA-256 of DER |
| claim / renew / release / fail | Signer-only, office-scoped queue operations with fresh lease fences |
| input | Checks source/lease; returns exact version, size, SHA-256, profile, approval metadata and transfer availability |
| download | Authenticated PDF bytes for the exact current source and live lease; private storage stays server-side |
| start | Rechecks signer/source/lease and validator configuration before irreversible token work |
| recovery | Original device/attempt/lease only; releases an old journal after pre-signing termination or an explicitly reviewed administrator retry |
| result | Binary PDF plus X-Signing-Item/X-Signing-Lease headers; independent server validation and atomic version promotion; exact committed replay is idempotent |
| ack | Receiver-only acknowledgement of an existing DOWNLOADING delivery with matching checksum; creation/download is Phase 9 |

All request/response bodies are bounded. All actions require HTTPS. Behind a
trusted TLS-terminating reverse proxy, set server-only `SIGNING_TRUST_PROXY=true`
**only if it strips and overwrites client-supplied X-Forwarded-Proto and direct
access to the backend is blocked**. Next.js supplies this header and may derive
the request URL from it, so the default rejects forwarded requests even when
their URL says HTTPS. A normal Next.js deployment therefore needs this verified
TLS boundary and explicit opt-in before device actions can operate. Header-free
HTTPS requests from a direct TLS adapter are accepted. Do not bypass TLS
certificate verification in the agent.
Session tokens remain in process memory. Challenge/session records contain hashes
of random secrets. Rate limits are database-backed across API processes and
authenticated quotas follow device identity across session renewal.

The named pipe DACL permits the service, SYSTEM and the configured user's SID,
denies network logons, and checks the connected client identity. Requests have a
size limit and deadline. Foundation mode supports status and enrollment. Configured
signing mode adds batch inspection and one-use local approval; see
[`dss-engine/README.md`](dss-engine/README.md) for its isolated configuration and
verification commands. Its binary PIN frame is separate from public JSON metadata.
Installed tray clients check the server executable path and SCM process identity. Installation directories are
writable only by administrators/SYSTEM; state is writable by the service.
The service grants the configured user only limited process-query access needed
to inspect its image path; this adds no memory-reading or process-control rights.

PKCS#11 probing runs in a bounded child process, loading the administrator-chosen
absolute DLL with restricted dependency search. It enumerates public certificates
without `C_Login`. A configured fingerprint selects the certificate; multiple
eligible certificates without a selection report `CERT_AMBIGUOUS`. Expiration
and key usage are checked. Trust, revocation and signature validation belong to
Phases 6/7, not this readiness signal. Health never means the PIN is unlocked.

Development diagnostics: `Notifica.Agent.exe --probe --config <absolute-json>`
performs read-only token inspection; `--console` runs the worker/pipe without SCM;
`--status` reads local pipe status. Use a separate config/key/data directory for
tests. The installed service uses `--service`. Graceful service stop cancels network
and pipe operations and closes the child probe; startup reuses the same CNG identity
and proves access by signing/verifying a random software-device-key challenge.
This does not operate the USB key. Startup failures leave a fixed error code and
numeric HRESULT in the protected state's `service-error.json`, without raw errors
or credentials. `--status --status-output <absolute-json>` additionally records the
calling user's SID/elevation and public status for installed-client verification.

From the repository root, `npm run test:signing:database` exercises the backend
against disposable schemas. To verify the compiled agent with a connected token:

```powershell
$env:SIGNING_AGENT_TESTS = '1'
node node_modules/vitest/vitest.mjs run tests/integration/signing-agent.test.ts
Remove-Item Env:SIGNING_AGENT_TESTS
```

This uses an ephemeral loopback HTTPS CA, a temporary user CNG key and disposable
database fixtures. It verifies enrollment, heartbeat, process restart, revocation
and an independent client's authorized fake-work claims over actual TLS. It does
not install a service or change the Windows trust store.

If several signing certificates are visible, set
`SIGNING_AGENT_TEST_CERTIFICATE_FINGERPRINT` to the intended public certificate's
lowercase SHA-256 fingerprint before running this integration test. The test then
checks that exact identity. Without an explicit selection, multiple eligible
certificates correctly produce `CERT_AMBIGUOUS`; the agent never guesses which
certificate to use. This variable affects only the disposable test configuration.

The separate administrator PowerShell 7 check `./verify-service.ps1` (from this
directory) temporarily installs the built payload under its virtual service
account, probes the connected token, queries the installed pipe through a temporary
task running as the normal non-administrator user, then performs three service
restarts and checks the persisted machine CNG identity. It also terminates only
the verified test-service process to prove configured SCM recovery, and verifies
a final graceful stop. It removes its test service,
both tray/verification tasks, key and installation files. It refuses any existing installation.
Evidence is written to `artifacts/service-verification.json`. Run it as the same
interactive user as the tray, elevated, or supply that user's `-AllowedUserSid`.
This test remains required before accepting the installed-service foundation.

Removal: revoke the device in the web API first, stop/delete the service using
Windows service management, and remove its scheduled tray task. Keep the identity
and CNG key until revocation is verified. Document archives are never touched.

## Phase 7 signing and recovery

Set `signingEngine` in the protected agent configuration to the DSS adapter options
documented in `dss-engine/README.md`, including absolute Java/bridge/library/trust
paths and a protected output directory. Set the exact `certificateFingerprint`.
`signingEngine` and `controlledSigning` are mutually exclusive. A receiver cannot
sign. An enrolled signer without `signingEngine` retains foundation-only behavior.
The backend also needs an independent validator; setup and runtime/deployment
choices are in [`../../scripts/signing/README.md`](../../scripts/signing/README.md).

The worker claims one document per approval, downloads to a unique `.part` file,
checks length and SHA-256, flushes and renames without overwriting existing files.
Use the tray's pending-signature action to review the requester, office, certificate,
profile and document before entering the PIN locally. The backend receives no PIN.
The lease is renewed while approval/signing is active. The selected profile must
validate before a signed file can be promoted; the authenticated web transport
currently limits each PDF to 4 MiB.

`signing-work.json` records the original lease and exact output path/hash before
upload. If a response is lost or the process restarts, the agent submits that same
artifact without invoking the token again. The server accepts committed replay
only for the original successful device/lease and identical output bytes. Source
and signed files are retained locally for recovery; the journal contains no PIN.
An uncertain interrupted token operation remains for operator investigation. Do
not delete its journal and blindly retry signing. Operator recovery controls and
bulk web selection are Phase 8; retry scheduling/alerts are Phase 10. Receiver
delivery remains Phase 9.

`--transfer-self-test` verifies checksum, length, collision, partial-file ownership
and upload integrity without a token login. The opt-in real Phase 7 test and
independent validator tests are documented in the validator README. Phase 7's
accepted real-token run, including restart recovery after a lost commit response,
is recorded in `docs/FIRMAR DIGITAL IMPLEMENTATION.md` at the repository root.

## Firmados recovery (Phase 8)

Agent 0.8.0 checks the authenticated `recovery` action when retained work is no
longer actively signing. A started attempt remains blocked until Firmados records
an administrator's reviewed retry for that exact attempt number. Stop the old work
and inspect the local journal and any output before authorizing a new operation.
If a committed output exists, use its same-byte recovery; do not authorize another
signature. The service keeps source/output files, clears only the resolved active
journal, and requests a fresh lease and local approval. It never reuses the PIN.

An assignment cancelled or released before signing can be cleared automatically.
A different device or lease cannot resolve that journal. If the device is revoked,
authentication fails and recovery cannot proceed. The web control center does not
change the local PIN policy, token configuration or receiver distribution.

`Notifica.Agent.exe --recovery-self-test <absolute-engine-json>` verifies the real
coordinator and owned worker with a deliberately missing provider and synthetic
PIN: retained failure, reviewed resolution, fresh lease/approval, no automatic
second operation and preserved source. No USB login is possible in this test.

## Receiver mirror (Phase 9)

Agent **0.9.0** runs the HTTPS mirror for `RECEIVER` and `SIGNER_RECEIVER` identities.
A receiver never invokes signing/PIN functions. A combined device runs both
processors independently; signing retains its explicit local approval policy.

During enrollment, choose the destination with **Elegir…** in the tray. The
service verifies a local absolute path and write access before consuming the
code, then saves the folder in protected device state. It rejects UNC paths,
alternate data streams and reparse points. The folder must be writable by
`NT SERVICE\NotificaSigningAgent` for an installed agent, and readable by the
intended Windows user. Provision that folder and its permissions during machine
setup; selecting a folder does not grant the service additional permissions.
Controlled console tests use the current user's permissions. `receiverDirectory`
in configuration supplies the initial choice; without an explicit choice, the
fallback is `Firmados` inside the agent state directory. That fallback may not
be readable by the interactive user in an installed configuration.

The backend schedules deliveries in the same transaction that promotes validated
signed output. Enrollment also adds existing committed signatures for the new
receiver. Revoked receivers are excluded. Five-minute device sessions authorize
each request, with receiver/office/assignment checks; no storage URL/key is exposed.
Endpoints under `/api/signing/device/` are:

- `deliveries`: `{ cursor: string | null }` returns up to 20 pending metadata rows.
- `delivery-begin` and `delivery-download`: `{ deliveryId, checksumSha256 }` authorize
  the copy and return the signed PDF. Access is checked again after storage I/O.
- `ack`: the same identity/checksum acknowledges a verified local final file.
- `delivery-fail`: adds a bounded code (`NETWORK`, `DISK`, `CHECKSUM_MISMATCH`,
  `LOCAL_CONFLICT`, `UNKNOWN`) and schedules a delayed retry.

The protected `receiver-state.json` persists office/device/folder, cursor and
pending assignments. An exhausted cursor wraps so delayed failures and concurrent
insertions cannot be skipped forever. Transfers use protected staging `.part`
files, verify length/SHA-256, then copy to a temporary file on the destination
volume and atomically rename. Final filenames combine document and signed-version
IDs. Different existing bytes keep their file; a stable checksum suffix, followed
by a numeric suffix when needed, selects another name. A checksum mismatch never
publishes a final PDF. Abrupt crashes can leave an unreferenced `.part` in the
destination; it is not a PDF and is never treated as delivered.

Acknowledgement happens only after the final file is verified and held open
against concurrent modification. Lost replies replay the same local file;
no new signing operation occurs. `receiver-manifest/<deliveryId>.json` records
document/version/checksum, filename and acknowledgement time without credentials.
Local edits and deletions never upload changes or delete authoritative storage.
Already acknowledged local deletions are local mirror issues; this phase does not
implement continuous filesystem reconciliation of previously delivered files.
Retain the manifest and recover the affected copy from the authoritative document.

Delivery failures appear in Firmados and the local tray; retries use bounded
backoff up to one hour. Full alerting/retention policy remains Phase 10. The mirror
polls every 15 seconds and retains pending work across network failures/restarts.
Stop the agent before changing an enrolled folder; move existing files and inspect
the protected state first. A mismatched folder/identity fails closed rather than
silently treating another directory as the same mirror.

Verification: `Notifica.Agent.exe --receiver-self-test` tests actual native files
and recovery with simulated transport, without token access. Set
`SIGNING_RECEIVER_AGENT_TESTS=1` and run
`npx vitest run tests/integration/signing-receiver-agent.test.ts` from the repository
root for two compiled receiver processes, real HTTPS, private storage, and a
disposable database. It reuses the exact Phase 7 accepted synthetic signed PDF;
the setup's injected validation report is a transport fixture, not new signature
validation. It removes its cloud objects, schema, keys and temporary credentials.
Public evidence and both received PDFs remain in `agents/windows/artifacts/phase9`.
