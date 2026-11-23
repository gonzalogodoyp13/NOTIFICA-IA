# Stress testing

Run the local public-route baseline with the app already running:

```powershell
npm run dev
# In another terminal:
node scripts/stress-local.mjs
```

The runner warms `/api/ping` and `/login`, then mixes equal numbers of requests
at 1, 5, 10, 25 and 50 concurrent in-flight requests for five seconds each.
These are concurrent requests, not simulated logged-in users. It reads complete
responses, requires HTTP 200, checks the ping payload and login HTML, and reports
throughput, p50/p95/p99 latency, errors and status counts. Warmup permits 60 seconds
for development compilation; measured requests time out after five seconds.
Redirects are not followed. A stage with more than 5% failures stops escalation;
any measured failure returns a nonzero exit code. Reports are saved under
`reports/stress/`. `STRESS_BASE_URL` can select another local HTTP port; remote
targets are rejected.

This short closed-loop test is a baseline, not a capacity certification. Development
compilation, logging, and running the generator on the same computer affect results.
It does not exercise authenticated reads, database load, PDF generation, email,
signing, browser rendering, or long-term resource leaks. Successful login-page
responses do not demonstrate successful authentication.

For a realistic capacity test:

1. Use an isolated QA deployment and database with synthetic office records and
   separate test accounts. Use a production build and a separate load-generator
   machine. Disable real email delivery and external signing side effects.
2. Define representative journeys: dashboard, role search, workflow reads, and
   separately controlled document-generation and write workloads. Validate response
   content and office isolation, not just status codes. Give each simulated user
   an independent session and realistic pauses.
3. Agree on latency and error budgets. The existing workflow performance test uses
   a p95 target of 500 ms; choose targets separately for expensive operations.
4. Run a low-load baseline, then hold increasing user counts for several minutes
   each. Track p95/p99, successful requests per second, errors, CPU, memory,
   database connections and query latency, and background queue depth.
5. Stop at the agreed error/latency threshold, reduce load to verify recovery, then
   run a longer soak below the measured sustainable limit. Include an arrival-rate
   test: this runner slows request arrivals when responses slow, which can hide
   overload compared with a fixed incoming request rate.

The existing `e2e/workflow-performance.spec.ts` checks 20 sequential authenticated
workflow reads using QA fixtures. It is useful validation but is not a concurrent
stress test.
