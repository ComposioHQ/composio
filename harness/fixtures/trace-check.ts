// Selftest fixture: makes one unauthenticated request against the backend so
// the fetch shim must record a non-2xx composio line in COMPOSIO_TRACE_FILE.
const base = process.env.COMPOSIO_BASE_URL ?? 'https://staging-backend.composio.dev';
const res = await fetch(`${base}/api/v3/toolkits`, {
  headers: { 'x-api-key': 'selftest-invalid-key' },
});
console.log(`trace-check: status ${res.status}`);
