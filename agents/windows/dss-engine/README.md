# Phase 6 controlled PDF engine

The adapter calls EU DSS directly. Java receives public certificates, document
metadata and the RSA signature returned by the native worker. Java never receives
the token PIN or private key. The C# worker owns one PKCS#11 login for one approved
batch; it clears the PIN immediately after that login and never retries it.

## Pinned development dependencies

The verified development environment uses Microsoft OpenJDK
`21.0.12.1+1` and DSS `6.5` from the checksum-verified JSignPdf `3.2.0` portable
package (PDFBox `3.0.8`, Bouncy Castle `1.84`). These portable tools do not change
the system PATH or Java installation.

| Archive | SHA-256 |
| --- | --- |
| `microsoft-jdk-21.0.12.1-windows-x64.zip` | `192441a9d27da813bada974bb88b4cf64d37a9589ed37f204374d411ca5ce07f` |
| `jsignpdf-3.2.0-windows-x64.zip` | `41574211c00b4f7b97c672760fa9f58749d3828b869c7f0dfcce82cddc66e349` |

Verify these archive hashes before extracting. The configured library directory
must contain the complete dependency set from that release. Production installer
packaging, redistribution notices and update signing belong to Phase 11; the
current paths are explicit local development configuration.

Build from the repository root:

```powershell
pwsh -NoProfile -File agents/windows/dss-engine/build.ps1 `
  -Jdk '.tools/java21/jdk-21.0.12.1+1' `
  -Libraries '.tools/signing-engine/JSignPdf/app'
```

## Controlled batch configuration

Phase 6 controlled mode requires an unenrolled agent, `machineKey: false`, a
loopback HTTPS server origin, the actual interactive user's SID and an explicit
certificate fingerprint. It rejects enrollment while enabled. It does not claim
server jobs, change production document versions, or distribute files.

Add `controlledSigning` to a separate test agent configuration:

```json
{
  "manifestPath": "C:\\controlled-test\\batch.json",
  "officeId": 1,
  "role": "SIGNER",
  "engine": {
    "javaExecutable": "C:\\portable-jdk\\bin\\java.exe",
    "bridgeJar": "C:\\agent\\notifica-dss-6.5.jar",
    "librariesDirectory": "C:\\portable-engine\\app",
    "outputDirectory": "C:\\controlled-test\\signed",
    "trustedCertificateFiles": ["C:\\controlled-test\\issuer-root.pem", "C:\\controlled-test\\tsa-root.pem"],
    "timestampUrl": "https://freetsa.org/tsr",
    "timestampPolicyOid": "1.2.3.4.1"
  }
}
```

The manifest is a `SigningBatch` JSON record: `id` (UUID), `officeId`,
`officeName`, `requester`, `signerName`, `signerFingerprint`, `profile`, and
`documents` containing `id`, absolute `sourcePath` and lowercase `sourceSha256`.
Profiles currently serialize as `0` (B), `1` (LT), `2` (LTA). B needs no TSA.
LT/LTA require the configured TSA and validation evidence; there is no fallback
to a lower profile. FreeTSA is the controlled test service, not a production
provider agreement.

Start the worker with `--console --config <absolute-test-config>` and the tray
with `--show-signing --config <same-config>`. Review the displayed batch, enter
the PIN locally, check the authorization box, then select **Autorizar y firmar**.
The PIN entry supports printable ASCII and deliberately disables paste. An
unsupported character or overflow prevents submission; Delete clears the field.
Never put a PIN in configuration, a shell command, environment, JSON or chat.

The approval expires five minutes after the worker loads the manifest. One
approval can start one batch. A separate five-minute worker deadline includes
driver and PDF processing. A Windows kill-on-close job terminates the worker and
its children if their owner exits. Health probes wait while the signing session
owns the token. Failed/consumed batches require a deliberate new local session;
there is no automatic PIN retry.

PIN bytes pass through the verified, SID-restricted local pipe and the owned
worker's redirected stdin. The tray, service and worker clear their buffers.
The process suppresses system WER invocation and applies Windows Error Reporting
no-heap/no-snapshot flags; the child
also disables .NET diagnostics and inherited runtime dump settings. Error output
contains fixed codes. No DPAPI PIN persistence is implemented.

These process settings follow Microsoft's
[SetErrorMode documentation](https://learn.microsoft.com/en-us/windows/win32/api/errhandlingapi/nf-errhandlingapi-seterrormode)
and [WerSetFlags documentation](https://learn.microsoft.com/en-us/windows/win32/api/werapi/nf-werapi-wersetflags).
Public batch status records operation counts, never PIN material. A successful
batch must report one login and one private-key signature operation per document.

## Verification commands

Use the published executable so child-process identity checks use the same image:

```powershell
Notifica.Agent.exe --signing-self-test
Notifica.Agent.exe --controlled-self-test C:\controlled-test\engine.json
Notifica.Agent.exe --signing-dialog-self-test C:\controlled-test\engine.json
Notifica.Agent.exe --dss-self-test C:\controlled-test\engine.json
Notifica.Agent.exe --signing-preflight --config C:\controlled-test\config.json
```

The session suite uses simulated tokens and a real process-lifetime test. The
controlled-channel suite uses the actual secured pipe and worker with a
deliberately nonexistent driver, so its synthetic PIN cannot reach hardware.
The dialog suite briefly displays a synthetic WinForms batch and verifies that
public status polling preserves focus/input and that consent remains required.
It uses a missing provider and never authorizes a hardware session.
The DSS suite uses a newly generated software RSA key; it exercises B and, when
a TSA is configured, LT/LTA, as well as checksum mismatch and missing-TSA
rejection. The preflight opens only an unauthenticated public-certificate session.

`verify_pdf.py` independently checks LT/LTA outputs with pyHanko 0.37.0, offline,
using explicit trust roots and mandatory leaf/intermediate revocation checking.
Its scope is current-time validation, not an archival proof-of-existence verdict.
Supply `--dependencies`, one or more `--root` paths, `--output`, and PDF paths.
It exits nonzero on missing evidence or a failed cryptographic check.
