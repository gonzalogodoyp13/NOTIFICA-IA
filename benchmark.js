// Automated Benchmark Script
// Stress-tests the /api/ping endpoint to measure latency
const URL = "http://localhost:3000/api/ping";

async function pingOnce() {
  const start = performance.now();
  const res = await fetch(URL);
  const json = await res.json().catch(() => ({}));
  const end = performance.now();

  return {
    clientLatency: +(end - start).toFixed(1),
    serverLatency: json.serverTimeMs ?? null,
  };
}

async function runBenchmark() {
  console.log("\n--- Running Ping Benchmark (20 requests) ---\n");

  const results = [];

  for (let i = 0; i < 20; i++) {
    const r = await pingOnce();
    results.push(r);
    console.log(`#${i + 1}`, r);
  }

  const avgClient = (
    results.reduce((a, b) => a + b.clientLatency, 0) / results.length
  ).toFixed(1);

  const avgServer = (
    results.reduce((a, b) => a + (b.serverLatency ?? 0), 0) / results.length
  ).toFixed(1);

  console.log("\n--- BENCHMARK SUMMARY ---");
  console.log("Avg Client Latency:", avgClient, "ms");
  console.log("Avg Server Latency:", avgServer, "ms\n");
}

runBenchmark();

