# Authenticated cloud signature validator

The Vercel Python entrypoint wraps the same isolated pyHanko worker used by the
local pilot. It receives PDF bytes and public signature metadata only. No token
PIN, private key, database credential, or storage credential belongs in this project.

Prepare a deployment directory using `prepare.ps1 -TrustConfiguration <existing-validator.json>
-Output <new-directory>`. The trusted configuration must list the approved E-Cert
root first and the pilot FreeTSA root second. Only those public certificates are
copied; configuration credentials and document fixtures are not packaged.

Deploy that directory as a separate Vercel project with Python 3.12 and a
server-only `SIGNING_VALIDATOR_TOKEN` (43–128 random base64url characters).
The production `/validate` route requires this bearer on every request.
Set the web project's `SIGNING_VALIDATOR_URL` to that HTTPS route and provision
the matching token there, then redeploy the web project. Updating environment
variables alone does not update an existing deployment.

The constrained subprocess uses the deployed dependency directory explicitly
because `python -I` ignores Vercel's runtime import-path injection. Validation
retains source-preservation, signer, trust, revocation, timestamp, profile, and
resource-limit checks. Request bodies and credentials are never logged by the worker.

Vercel's request-body limit applies to the combined unsigned and signed PDF.
The existing remote protocol sends both in one request; large pairs exceeding
the platform limit require a different hosting/transport arrangement. Do not
disable validation or reduce the requested signature profile to work around it.

Verification must cover unauthorized rejection, a fresh valid signature,
tampering rejection, and an end-to-end staging signature before declaring the
rollout complete. Older LT fixtures may fail current revocation checks; their
historical acceptance is not evidence of current validator health.
