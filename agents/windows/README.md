# Windows agent (Phases 4–6)

The x64 .NET 10 agent consists of a Windows service and a per-user tray process
from the same executable. It enrolls over HTTPS, maintains short-lived device
sessions and reports disk/token/certificate health every 30 seconds. Normal
foundation mode does not log into the E-Cert token, sign PDFs or download
documents. Phase 6 adds an explicit controlled-test mode with local batch approval
and protected PIN entry; its acceptance status is recorded in the implementation
report. Enrollment codes and token PINs use separate UI and protocol paths.

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
| input | Checks source/lease and returns version, size, checksum and authorization expiry; transfer remains Phase 7 |
| result | Checks signer/lease and fails closed until independent Phase 7 PDF validation is connected |
| ack | Receiver-only acknowledgement of an existing DOWNLOADING delivery with matching checksum; creation/download is Phase 9 |

All request/response bodies are bounded. JSON actions require HTTPS. Behind a
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
size limit and deadline. Normal mode supports status and enrollment. Explicit
Phase 6 controlled mode adds batch inspection and one-use local approval; see
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
