# Independent Phase 7 PDF validation

The backend validates the **bytes** independently of the signing device. The
worker is pinned to pyHanko 0.37.0; it receives no PIN, token private key, database
password or Supabase credential. It refuses invalid signatures, wrong signer
identities, changed source content, missing required timestamps, and missing or
invalid revocation evidence. Trust roots come exclusively from server configuration.

## Runtime choices

For the repository's Vercel deployment, provision the private Python worker on a
host that supports Python subprocesses, behind an HTTPS reverse proxy. Configure
server-only `SIGNING_VALIDATOR_URL=https://<private-validator>/validate` and a
random `SIGNING_VALIDATOR_TOKEN` (43–128 base64url characters). The same token is
provided to the Python service. The agent never receives this token or URL.
Restrict ingress to the application infrastructure where available and configure
the proxy's request timeout above 95 seconds and body limit at least 8 MiB.

On a Node host with Python available locally, omit the URL/token and instead set
`SIGNING_VALIDATOR_CONFIG` to an absolute configuration path. Both transports use
the same independent validator. With no validator configuration, input metadata
reports `transferAvailable: false` and the start-signing action fails closed.
Provisioning/deploying the production validation host remains rollout work; no
production endpoint or paid service was created by Phase 7.

Install the pinned dependencies from `requirements.txt` in an isolated Python
environment. The tested Windows runtime was Python 3.12.14. A configuration file:

```json
{
  "python": "C:/validator/python/python.exe",
  "dependencies": "C:/validator/python-packages",
  "roots": ["C:/validator/trust/ecert-root.pem", "C:/validator/trust/tsa-root.pem"],
  "certificates": ["C:/validator/trust/ecert-issuer.pem"],
  "crls": ["C:/validator/evidence/current-signer.crl", "C:/validator/evidence/root.crl"]
}
```

Use absolute local paths with access restricted to the runtime account and
administrators. `dependencies` is optional if packages are installed in that
Python environment. Configure production roots explicitly; the FreeTSA root used
for controlled tests is not automatically installed or approved for production.

Run the private worker with:

```text
python -I scripts/signing/validator_service.py /absolute/config.json 8789
```

The listener binds only to `127.0.0.1`; the reverse proxy provides HTTPS. It
authenticates before consuming PDF bytes and runs at most two validation children.
Each child has a 90-second wall-clock timeout, 45-second CPU allowance, and a
memory limit (768 MiB on Windows; 1 GiB on Unix). No arbitrary URLs or filesystem
paths can be submitted over its protocol. Requests, headers and PDF content are
not logged. Scratch files are removed after each validation.

The two PDF streams are concatenated in an `application/octet-stream` request,
with the source length, source SHA-256, signer SHA-256 and requested level in
fixed headers. The service returns a bounded report. The web backend independently
binds that report to its own source/output hashes before the commit.

## Profiles and source preservation

All profiles require SHA-256 document signatures, the expected certificate,
trusted chain and current revocation checks. `PADES_B` uses operator-provisioned
CRLs and intermediate certificates from the config; they must be refreshed before
expiry. LT/LTA validate offline using **embedded** evidence, so a network fetch
cannot conceal missing long-term material. The validator never follows PDF/AIA/
OCSP/CRL URLs. A timestamp's message imprint must use SHA-256; its TSA's internal
CMS signature may use a different accepted digest.

Every original source byte must remain as the output prefix. The validator also
compares every PDF revision from the exact source onward, allowing only signing
and validation-maintenance changes. A valid signature over an appended alteration
to the original page content is rejected. Missing AcroForm dictionaries are
normalized as an empty signature form in memory for pyHanko's comparison; original
PDF bytes are never changed.

LTA additionally requires verified document timestamps and a final timestamp
covering the complete artifact including its validation store. This is current
cryptographic/profile validation, not a claim of archival validation after future
certificate or revocation-evidence expiry. Preservation renewal remains a separate
production policy.

## Transfer and commit

Each source and output is limited to **4 MiB** on the authenticated web transport,
below [Vercel's 4.5 MB function payload limit](https://vercel.com/docs/functions/limitations).
Larger PDFs are explicitly rejected; they are never truncated. The Windows engine
retains its separate 32 MiB parser bound. This implementation uses authenticated
streaming rather than outstanding signed storage URLs, allowing a fresh device,
role, lease and revocation check on each request.

The bucket must be private. Uploads use unique reserved keys and `upsert: false`.
The backend rereads the uploaded object and verifies its SHA-256 before atomically
committing the signed version, signature evidence, attempt, current-version
pointer, immutable validation report and canonical audit.

`signing_artifacts` tracks every reserved output. Pending rows expire after two
hours. Signer claim requests sweep up to 20 expired reservations, fence them as
`CLEANING`, refuse objects referenced by any document version, remove only those
specific keys and mark them `DELETED`. Interrupted cleanup resumes on the next
claim. Committed rows cannot be mutated/deleted by application SQL. Sites without
active claim requests can invoke the internal `cleanupArtifacts(officeId)` from
their maintenance runner; scheduling and alerting are Phase 10 work. Uncertain
uploads/commits remain tracked rather than risking deletion of a committed file.

## Verification

`npm run test:signing:database` runs transaction, isolation, collision, corruption,
revocation, expiry, replay and cleanup tests against disposable schemas. It does
not use signing hardware.

`test_validator.py` exercises the real parser/cryptography with retained Phase 6
fixtures and freshly generated software certificates. It accepts config, real
fixture request JSON, the Phase 6 DSS profiles result JSON, and an output directory.
`test_validator_service.py` accepts config, real fixture request JSON and a results
path, and tests the real private worker over loopback HTTP. HTTPS enforcement and
bounded responses are also covered by `signing-validator-transport.test.ts`.

`SIGNING_ARTIFACT_LIVE=1` opts into `signing-artifact-live.test.ts`. It also needs
`SIGNING_VALIDATOR_CONFIG`, `SIGNING_AGENT_TEST_CERTIFICATE_FINGERPRINT`, the pinned
agent/engine, and the prior controlled-test engine config. It generates a clearly
marked estampo with the application's real PDF generator, uses private test
storage/disposable database rows, and opens the real local approval dialog. The
user enters the PIN only there. It drops a successful response and restarts the
agent to prove same-byte recovery without another signature. Temporary cloud
objects, schema, CNG identity and TLS private material are removed; signed samples
and public acceptance evidence remain under `agents/windows/artifacts/phase7`.
