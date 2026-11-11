# System email via Resend

Daily, monthly, and custom report deliveries use `createSystemMailAdapter`.
Receipt sending and reply sync continue to use their existing mailbox configuration.

Configure the application project's server environment:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | Secret sending key restricted to `notificaia.cl` |
| `SYSTEM_MAIL_PROVIDER` | `resend` |
| `SYSTEM_MAIL_FROM_EMAIL` | `contacto@notificaia.cl` |
| `SYSTEM_MAIL_FROM_NAME` | `NOTIFICA IA` |

Deploy the code after saving variables. A redeployment of older code alone does not
add Resend support. Never use a `NEXT_PUBLIC_` variable for the key.

Before enabling delivery, verify the sending domain in Resend. Test a report with
an authorized test recipient and inspect its delivery history and Resend delivery
event. API acceptance is not proof of inbox delivery. This setup does not create
an incoming mailbox or change authentication-provider email configuration.

Provider retries reuse a per-recipient idempotency key; Resend retains these keys
for 24 hours. Intentional new delivery attempts have new recipient rows and keys.
The free plan's daily/monthly quotas still apply. Delivery failures remain visible
in the existing report history. No bounce webhook is configured by this change.

If `SYSTEM_MAIL_PROVIDER` is empty, legacy provider behavior is preserved. Set it
to `dry-run` explicitly to simulate system delivery without sending messages.

Manual jobs start immediately with Vercel `waitUntil` and retain their durable job
history and atomic leases. A generation job also runs its own chained delivery.
Existing queued jobs can be processed with an authenticated POST to
`/api/internal/reports/tick` using `{ "officeId": 77, "jobId": "the-job-id" }`.
This targeted operation does not run other offices or enqueue schedules.
Automatic schedules, delayed retries, and expired-lease recovery still require an
external scheduler calling the same endpoint with `{ "maxJobs": 5 }` and the
`REPORT_AUTOMATION_SECRET` bearer credential. `waitUntil` is bounded by the
function timeout and does not replace that recovery scheduler.
