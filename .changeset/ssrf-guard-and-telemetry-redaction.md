---
'@composio/core': patch
---

Close two secret/SSRF exposure surfaces in the TypeScript SDK:

- **SSRF guard on URL file inputs.** `composio.files.upload(url)` and automatic file upload during tool execution previously did a raw `fetch()` on user-supplied URLs with no guard. They now resolve the host and refuse private, loopback, link-local (incl. the `169.254.169.254` cloud-metadata endpoint), CGNAT, and reserved addresses, reject non-`http(s)` schemes, and follow redirects manually so each hop is re-validated (blocking a public URL that redirects into internal space). Blocked requests throw `ComposioBlockedInternalUrlError`. Node-only; behaviour for public URLs is unchanged.
- **Telemetry redaction.** Error telemetry previously shipped `error.message` / `error.stack` verbatim. They are now passed through a redactor that strips URL query strings, `Authorization` bearer/basic credentials, and secret-like `key=value` pairs (API keys, tokens, client secrets, passwords) before transport.
