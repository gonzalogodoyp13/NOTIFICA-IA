# Windows signing agent release and pilot runbook

Current deployment decision (September 24, 2026): the owner will personally install
by remote control and has chosen **unsigned operator-managed distribution**.
Use [the managed installation guide](../../agents/windows/release/managed/INSTALACION.md)
and [GitHub publication guide](../../agents/windows/release/managed/GUIA_GITHUB.md).
A publisher certificate is not a prerequisite for that explicitly selected path.
It supports new installations and matching interrupted-installation resume; it is
not the signed bootstrapper below and does not update existing installations.
On September 28, actual elevated managed installations and manual hardware-token
signing/delivery were observed on one signer and one separate receiver, as recorded
below. This is partial pilot evidence; Phase 11 and production acceptance remain open.

The publisher-signed release sections below document the optional release
system retained in the repository. Its signature requirements apply to that
system, not to the selected operator-managed package. Do not mark the pilot
accepted using local simulated evidence.

## Observed managed pilot — September 28, 2026

### Installation and environment

The operator reported creating the GitHub repository and downloading
`NOTIFICA-Windows-0.12.0-managed.zip` onto the separate testing laptop. The ZIP
was extracted into a local Desktop folder named `notifica ia installer`.
This session did not independently audit the repository visibility or Release metadata.
The published reference hashes for the package used were:

- ZIP SHA-256: `5f429a0002b5efbf38f1a0dd685462115dabb6106a669c5838ca9b3c1ee12802`.
- Manifest SHA-256: `030e1d7638791d761a3318d0e373da36f1d483e5fdfee4a475c248e984cb53ce`.

Both computers were new agent installations. Installer preflight returned
`PREFLIGHT_PASSED_NO_INSTALLATION_PERFORMED`, and elevated installation ultimately
returned `INSTALLED_ENROLLMENT_REQUIRED` on each computer. The operator enrolled
them with separate ten-minute codes issued by the same office administrator and
confirmed both connected in Firmados.

| Computer / enrollment name | Role | Configuration and observation |
| --- | --- | --- |
| `JARVIS - Receiver` (`jarvis\clawb`) | `RECEIVER` | No token needed. Local PDF destination `C:\NotificaFirmados`. Connected and received the test PDFs automatically. |
| `GONZA - Signer` (`gonza\gonza`) | `SIGNER` | Existing USB token and signed x64 driver at `C:\Windows\System32\eTPKCS11.dll`. Remote signing session enabled locally with consent and the token PIN. |

The main laptop's public token probe reported `READY`; its certificate matched
the prior tests, with SHA-256
`67887678fae15909edc535e064368b78d0d65c0eeb70b314d4e9baccd16b1a01`
and expiry September 14, 2027. The probe did not log in to the token or sign.
The signer request was prepared under `output/windows-signer-installer/` using
the verified original package and public CA/TSA certificates. Installation used
the available PowerShell 7 runtime. Its TSA configuration reused the prior
controlled-test FreeTSA endpoint/policy; this is not production provider approval.

The web backend ran locally through the temporary HTTPS tunnel
`https://visitors-via-missed-remain.trycloudflare.com/`. Both agent requests used
this origin without `/login`. The tunnel is a testing endpoint, not a permanent
production address; replacement requires updating the server's public origin
setting and the agents' protected server configuration.

### Problems found and resolved

1. **`LOCAL_PATH_REQUIRED`:** the installer rejected the relative
   `-RequestFile .\install-request.json`. Resolving the request and installer to
   absolute paths corrected the invocation; no package integrity check was removed.
2. **`MANAGED_INSTALLATION_FAILED`:** a read-only diagnostic exposed a Windows
   SID translation failure. The receiver SID had been transcribed incorrectly.
   Replacing it with the exact output of `whoami /user` under the receiver's
   intended interactive account made preflight pass.
3. **`ADMINISTRATOR_REQUIRED`:** the first installation attempt was not elevated.
   It was rerun in an administrator PowerShell window.
4. **`SERVICE_CONFIGURATION_FAILED`:** the receiver had an `installing` record
   and verified files but no service (`sc.exe query/qc` returned error 1060).
   Service creation was retried with `sc.exe --%` to preserve the quoted program
   and configuration paths. `sc.exe qc` confirmed the intended executable,
   delayed automatic start and `NT SERVICE\NotificaSigningAgent` account.
   The original package/request was then resumed with `-Resume`, preserving its
   device identity and state. This was a recovery of the failed installation,
   not a clean success of the original PowerShell 5.1 service-creation command.
   The distributed installer was not patched or republished in this session.
5. **Enrollment `403 / ORIGIN_REQUIRED`:** Next.js reconstructed the internal
   listening origin while the browser used the public tunnel origin. An explicit
   server-only `SIGNING_BROWSER_ORIGIN` was added for the exact public HTTPS
   origin, with `SIGNING_TRUST_PROXY=true` on the loopback testing backend.
   The enrollment check retained HTTPS, exact-origin and authenticated-office
   checks; it did not trust arbitrary forwarded host headers. Fourteen relevant
   tests passed after this fix; an unauthenticated live request still returned 401.
6. **Validator-not-enabled warning:** this referred to server configuration,
   not an absent token PIN. The local `SIGNING_VALIDATOR_CONFIG` was enabled
   with the existing controlled-test Python/runtime and public trust configuration.
   Four fresh cryptographic checks and four worker HTTP checks passed: valid
   signatures were accepted, while revoked certificates, missing revocation
   evidence, altered documents and unauthorized worker requests were rejected.
   A retained older token-signed sample failed the current trust check despite
   an intact, valid signature; validation requirements were not relaxed to accept it.
7. **Signing-center `403 / La solicitud debe provenir de esta aplicación`:**
   the center had a separate origin comparison. It was updated to use the same
   pinned public origin policy while preserving direct local testing behavior.
   Twenty-two targeted tests passed, covering the center handler, origin checks,
   device protocol and center contracts. The restarted public site returned 200
   for login; an unauthenticated center mutation still returned 401. The rejected
   signing request had not entered the queue and was then resubmitted by the operator.

### Observed signing and delivery

With the token session active on GONZA, the operator authorized manual requests
from Firmados on JARVIS using `GONZA - Signer` and the guided PAdES-LT profile:

- **Single estampo:** the request completed; the operator located the automatically
  delivered PDF in `C:\NotificaFirmados` on JARVIS and confirmed that it opened.
- **Two-estampo batch:** the operator selected two additional estampoes in one
  request and reported that this batch also worked, during the ongoing signing session.

The server log corroborates two successful center requests and three successful
`start`, `result`, `delivery-begin`, `delivery-download` and `ack` sequences.
Together with the operator's observations, these establish real hardware signing,
server acceptance/independent validation and automatic delivery to a separate PC
for the three processed documents. The session's exact token-login count was not
independently instrumented. A separate comparison of authoritative/local SHA-256
values and a complete immutable evidence pack were not collected in this chat.

Local supporting evidence remains in:

- `.tools/temporary-test/app-enrollment.stdout.log`: enrollment, connection and
  initial origin-fix observations.
- `.tools/temporary-test/app-signing.stdout.log`: successful signing and delivery
  request sequences after the center fix.
- `.tools/temporary-test/validator-tests-1cc51469fa2b47febad613b207058e8f/results.json`
  and `.tools/temporary-test/validator-service-fresh-readiness.json`: fresh
  synthetic validator checks, separate from the real hardware observations.
- `output/windows-signer-installer/token-probe-result.json`: public token readiness.

These are local working records, not a completed `phase11-pilot.template.json`
or formal operator acceptance. Do not publish personalized requests, enrollment
codes, device credentials or PINs as part of an evidence export.

### October 1, 2026: signer also receives office PDFs

The token laptop was initially enrolled as `SIGNER`, so its configured
`C:\NotificaFirmados` folder stayed empty: only `RECEIVER` and
`SIGNER_RECEIVER` identities run the mirror. The operator requested both roles
on that same laptop. The managed pilot package has no supported uninstall or
in-place role-change operation, so the existing device was corrected in place
under operator supervision rather than reinstalled or re-enrolled.

Before the correction, the protected local identity and server agreed on device
`cmulokdp0001ycu3he44p564e`, office 1, role `SIGNER`; the local signing-work
journal was absent and the office had no active signing items. The server role
was changed to `SIGNER_RECEIVER` with an audit event and four already-committed
signatures were queued for that device. An Administrator PowerShell session on
the laptop backed up the protected identity file, changed only its role, and
restarted `NotificaSigningAgent`. The operator confirmed local role
`SIGNER_RECEIVER` and service `Running`; the server subsequently reported
`TOKEN_READY` and all four deliveries `DELIVERED`. The operator's elevated
folder check found four PDFs in `C:\NotificaFirmados`.

This was a one-time pilot repair, not a supported role-migration feature for
future installations. The service restart closed the remote PIN session; the
operator reopened **Sesión de firma remota** and confirmed it active again.
A fresh post-change signing request and formal file-hash comparison remain
unverified.

### Remaining acceptance work

**Explicit session closure was deferred by the operator for another time.**
Still verify that a new request remains queued after closing the remote session,
and completes only after local reactivation. Also verify service/PC restart,
session expiry, token removal/reconnection, failure and interrupted-transfer
recovery, duplicate completion, a partially failed batch, receiver offline/disk-full
behavior, local-file changes, device revocation and certificate renewal/retirement.

The successful two-document batch does not prove partial-batch failure recovery.
The validator's synthetic revoked-certificate tests do not establish the real
device/certificate lifecycle scenarios. Manual selection does not establish
automatic workflow enqueue or manual date-range filtering acceptance.

Only **one receiver** was installed in this session. The full pilot calls for a
signer and two separate receiver computers, matching authoritative/local hashes,
the reviewed evidence template and explicit operator sign-off. Managed-package
upgrade, rollback and removal need their separately reviewed procedure; the
optional signed-bootstrapper lifecycle was not exercised here. Stable production
HTTPS, validator/trust/TSA policy, minimum version, maintenance/log retention,
full release checks and production activation remain pending. **Phase 11 remains open.**

## Release model

The release is an Authenticode-signed `Notifica.Setup.exe`, a timestamped signed
`release.psd1`, and `payload.zip`. SHA-256 binds the payload to the manifest.
The setup executable pins the publisher certificate's SHA-256 in its compiled
resources; the manifest cannot introduce another trusted publisher. Windows must
trust the Authenticode signature and its timestamp. Missing signatures, mismatched
publishers, expired release authorizations, modified archives, traversal entries,
unapproved computers, unapproved source versions and ordinary downgrades fail closed.

Use an organization-owned CA-issued code-signing certificate with a protected
private key accessible through the Windows certificate store and SignTool. The
FEA document-signing certificate is a different credential and must not be assumed
to have code-signing authority. No test root or self-signed certificate is installed
by the release tools. Certificate procurement/account verification remains external.

The setup bootstrapper requires administrator elevation and contains its own
installation scripts. It uses Windows' .NET Framework 4.8 and PowerShell 5.1,
already present on the supported Windows 11 desktops. It has no adjacent executable
dependencies or runtime extraction into a user-writable temporary cache. Its scripts
are extracted into an administrator/SYSTEM-only directory. The agent bundles .NET 10.0.12;
the build SDK is pinned to 10.0.401 with roll-forward disabled. Java 21.0.12.1+1
and DSS 6.5 dependencies come from the two checksum-pinned archives documented in
`agents/windows/dss-engine/README.md`. The payload retains upstream redistribution
materials, runtime notices and the original JSignPdf distribution. Token drivers
are installed separately. No runtime download executes on a receiver.

Reference behavior: [SignTool](https://learn.microsoft.com/en-us/dotnet/framework/tools/signtool-exe),
[Authenticode timestamps](https://learn.microsoft.com/en-us/windows/win32/seccrypto/time-stamping-authenticode-signatures),
[PowerShell signature timestamp transport limitation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/set-authenticodesignature).
The release builder uses SignTool's RFC 3161 HTTPS timestamping for executable,
assembly and PowerShell data-file signatures; it does not rely on the cmdlet's
legacy timestamp API.

## Build a pilot release

Build on the controlled release workstation using PowerShell 7. Supply the exact
certificate thumbprint and the CA's RFC 3161 HTTPS timestamp endpoint. Private
keys and passwords are never command arguments or repository files.

```powershell
./agents/windows/release/build-release.ps1 `
  -CertificateThumbprint '<code-signing-certificate-thumbprint>' `
  -TimestampUrl 'https://<publisher-timestamp-endpoint>' `
  -SignTool 'C:\<Windows-SDK>\signtool.exe' `
  -Dotnet 'C:\<pinned-SDK>\dotnet.exe' `
  -JdkArchive 'C:\<verified-archives>\microsoft-jdk-21.0.12.1-windows-x64.zip' `
  -DssArchive 'C:\<verified-archives>\jsignpdf-3.2.0-windows-x64.zip' `
  -Output 'C:\Releases\notifica-0.12.0-pilot' `
  -Ring pilot -Computers 'SIGNER-PC','RECEIVER-A','RECEIVER-B'
```

The output directory must be new. Keep its `build` subdirectory on the controlled
build host; distribute only the signed setup, signed manifest and payload. Launch
them from a fresh administrator-controlled release staging directory, with no
adjacent configuration or executable files supplied by other users. Review
dependency redistribution obligations with the release owner before distribution.
Without a certificate, `-PrepareOnly` produces `candidate.json` with
`distributable=false` and an executable with no publisher provisioned. It deliberately
does not produce `release.psd1` and cannot be installed through the release path.
Never distribute a candidate as a signed release.

## Install and enroll

Start with supported, patched Windows x64 machines. Use a separate pilot office
in QA, synthetic estampoes and a validated HTTPS endpoint before production data.
The signing computer has the USB token; receivers need no token or vendor driver.

For the signer, obtain the current E-Cert/SafeNet driver from the token provider,
verify its publisher in Windows, install it with the provider's instructions, and
reboot if requested. Identify the correct x64 PKCS#11 DLL and the exact signing
certificate SHA-256. The NOTIFICA installer neither downloads nor replaces drivers.
Install provider updates separately from agent releases. Do not reuse the token's
PIN as an enrollment code or save it in configuration.

Copy `agents/windows/release/install-request.example.json` to a private local
working file, replace the placeholders, and invoke:

```powershell
.\Notifica.Setup.exe --request C:\Pilot\install-request.json
```

The request is public configuration only. `allowedUserSid` selects the interactive
operator; obtain it as that user with `whoami /user`. `receiverDirectory` must be a
new local directory. Setup grants the service write access and the operator read
access without changing permissions on an existing document folder. For a signer,
set `enableSigning=true`, the exact fingerprint, trusted public CA/TSA certificates
and the approved production TSA endpoint/policy. The example's receiver-only setup
has signing disabled. The service runs under its virtual account, with delayed
automatic start and recovery after 10, 30 and 60 seconds. The tray runs as the
specified ordinary user at logon and immediately after successful installation.

Installation creates a non-exportable machine CNG device key and protects
configuration, versioned binaries and state. It requires a startup marker from the
current SCM process/version, not merely a RUNNING service state. The marker follows
device-key initialization and creation of the authenticated local pipe.
Setup serializes operations with a protected exclusive file lock. It validates
the operator, HTTPS origin, separate receiver directory and signing configuration
before creating installation directories. Public trust inputs must be certificate
files; private-key containers are rejected.

An office administrator creates a ten-minute one-use code through
`POST /api/signing/devices` with `{"action":"enroll","role":"SIGNER"}`,
`RECEIVER`, or `SIGNER_RECEIVER`, using the same-origin authenticated browser
session. Open the tray enrollment dialog, choose the receiver directory when
applicable, enter the code, and confirm the device name. Server enrollment fixes
the office and role; changing an install request cannot grant another role.
Confirm the device, certificate, destination and heartbeat in Firmados.

## Upgrade, rollback and interrupted setup

Build the next version from its reviewed source. Supply `-FromVersions` with the
exact installed versions permitted to upgrade. Pilot packages list their computer
names. Distribute the signed files to those computers and run a request containing:

```json
{"action":"update","releaseDirectory":"C:\\Releases\\next-pilot"}
```

Setup stages verified bytes in a new protected version directory, stops the tray
and service, checks again for an active signing journal, updates service/tray
paths, and checks startup readiness. Identity, manifests, receiver copies and
signing output stay in their existing locations. An unresolved `signing-work.json`
blocks upgrade, rollback and uninstall; resolve it through the existing reviewed
recovery flow. Do not delete it to bypass this guard.

The switch writes a durable transaction record before stopping the old version.
An activation failure restores the previous configuration, executable and tray.
If recovery fails or Windows stops during the switch, retain the transaction and
use `{"action":"repair"}` with the same trusted publisher bootstrapper. Repair
restores the recorded previous version and checks readiness. It verifies the
recorded service image/account and tray command before stopping them. It does not
sign a document or clear an unresolved signing journal.

First installation writes `installation-initial.json` after configuration
validation and before service/key provisioning. If provisioning or activation
fails, use the same `repair` request to resume that checkpoint. Repair verifies
the publisher again, preserves the recorded key identity, reapplies the service
key ACL, and requires readiness before clearing the checkpoint. It refuses to
replace a missing key for an enrolled device. Failures before checkpoint creation
retain files for administrator inspection; do not delete existing document/state
directories or blindly rerun installation. The complete installed recovery path
still requires elevated testing with the signed release during pilot acceptance.

For a deliberate downgrade, build the old reviewed source with `-Kind rollback`,
the exact newer `-FromVersions`, and its approved minimum version. Use
`{"action":"rollback","releaseDirectory":"C:\\Releases\\approved-rollback"}`.
An ordinary upgrade cannot downgrade. A rollback cannot go below the installation's
stored minimum. Existing state/configuration formats must remain compatible; do
not authorize a rollback solely because its signature verifies.

Set server-only `SIGNING_MIN_AGENT_VERSION=0.12.0` before enabling the remote-session pilot. Older
or unknown versions cannot claim/start new signatures or begin new transfers.
Heartbeat, failure reporting, lease renewal, in-progress transfer completion,
commit recovery and retirement remain available. Firmados shows an update alert.
When unset the compatibility gate retains the pre-rollout behavior; provisioning
the floor is mandatory for rollout. Malformed policy fails closed. The agent
version is reported by the enrolled device; it is compatibility control, not remote
binary attestation. Publisher pin rotation needs a separately reviewed transition.

## Removal

Use `{"action":"uninstall"}` with the trusted setup executable. The service stops
before retirement. The agent proves ownership of its software CNG key with a
purpose-bound retirement signature. The server revokes only that device, deletes
its sessions/challenges and records one canonical revocation event. Replaying the
same retirement after a lost response is safe. Only after confirmation does the
agent delete its software device key and setup remove the service/tray task.

If the server is unreachable or revocation cannot be confirmed, removal stops and
preserves the installation for retry. An administrator can separately revoke the
device in Firmados/API immediately if it is lost or compromised. A revoked device
cannot be restored by rolling back its binaries; reenroll with a new identity.
The uninstaller preserves binaries/configuration, PDFs, manifests and recovery
evidence. It never recursively deletes the receiver directory or removes the
vendor token key. Archival/removal of these retained files is a separate operator
decision after evidence retention requirements are satisfied.

## Day-to-day administrative recovery

| Situation | Action |
| --- | --- |
| Certificate renewal | Pause automatic enqueue for the pilot office, drain or review outstanding work, select the new certificate SHA-256 in protected configuration, restart and verify heartbeat. Change the office automatic-signing fingerprint, validate a new LT signature, and retire the old fingerprint from new requests. Keep historical evidence. |
| Token replacement | Close the remote session, review active journal/output, install the approved replacement driver separately, configure the replacement certificate, enable its session locally and test a web-authorized signature. Never assume an uncertain old attempt failed. |
| Incorrect/locked PIN | Stop after the first rejection; there is no automatic retry. Use the issuer's verified PIN reset/unlock process locally. Do not transmit the PIN through support, chat, web fields or logs. |
| Device revocation | Revoke the exact same-office device through the admin API. Verify session rejection and central status. Revoke outstanding enrollment codes if the administrator/device was compromised. |
| Failed/partial batch | Inspect each item's source/output hash and attempt. Allow remaining runnable items to complete. Use reviewed recovery only after inspecting the old machine and retained output. |
| TSA outage | Leave LT/LTA pending; verify the configured provider/status and firewall. Restore that service or deliberately configure an approved equivalent. Never downgrade to B to make the queue green. |
| OCSP/CRL failure | Verify connectivity, certificate chain and responder status. Unknown/revoked status cannot become a validated signature. Retain current failure evidence. |
| Receiver offline/disk full | Restore service/network or free space and repair folder permissions. Review/retry the delivery in Firmados. It copies the committed signature and cannot create another signature. |
| Lost upload/ack response | Keep exact local bytes and journal; allow committed-result/ack reconciliation. Do not sign again merely because the network response was lost. |
| Local PDF edited/deleted | Recover a copy from the authoritative version and compare SHA-256. Local changes never propagate to the archive; acknowledged files are not continuously repaired by the mirror. |
| Expired lease/interrupted token | Inspect journal/output and central attempt history. Require reviewed recovery for uncertain signing outcomes. |

## Pilot and production gate

Use `phase11-pilot.template.json` to record **actual** evidence. Two processes on
this PC do not fulfill the two-computer requirement. Record the two computers'
independent identities, delivery manifests and SHA-256s, the signer certificate,
immutable source/output IDs and the independent LT validation report. Every
mandatory scenario in the template remains pending until observed and reviewed.
Tests with synthetic failure injection are useful preparation, not operator acceptance.

The operator must enable **Sesión de firma remota…** once with the local PIN, then
authorize work from an ordinary active office account on another computer without
another local approval. Verify at least two requests use one token login, explicit
closure and restart disable new signing, and foreign/inactive accounts are rejected.
The operator must see eligible workflow completion enqueue one job and the independently validated signed PDF appear on
both receivers without manual downloading. Exercise date-range recovery and all
listed interruption, token, certificate, TSA/OCSP, disk and revocation scenarios.
Do not risk locking the real token by repeatedly entering an incorrect PIN; the
pilot plan must coordinate safe failure injection with the token owner.

Run `verify-pilot.ps1 -Evidence <completed-record.json>`. It validates record
completeness; a release owner must still inspect the actual evidence and operator
acceptance. A broad release requires this completed record and binds its hash into
the publisher-signed release manifest. Do not substitute two local receiver instances,
invented computer names or an automated test account for operator acceptance.

Before activation: complete the installer/uninstaller and rollback checks under
Windows elevation, security review, full build/lint/integration/browser checks,
and the signed pilot. Configure the private validator and trust/TSA policy,
verified TLS proxy boundary, five-minute maintenance and restricted 30-day server
technical-log retention. Provision the minimum version. Enable automatic enqueue
only for the accepted office first; preserve the explicit office fingerprint/profile.
Observe queue, audit, device and delivery health before broadening rollout.
Rollback the agent package if needed; do not roll back the authoritative database
or erase audit/signature evidence to undo a release.
