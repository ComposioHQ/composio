---
'@composio/core': patch
---

Close a DNS-rebinding window in the SSRF guard: the address validated by `assertSafeFetchTarget` is now the address `ssrfSafeFetch` connects to, so a hostname is no longer resolved a second time between the check and the connection. Each redirect hop is re-validated and re-pinned. The request still carries the original hostname in `Host` and TLS SNI, so certificate verification is unchanged. Hops whose effective dispatcher is a configured route — a caller-supplied `dispatcher`, a global `ProxyAgent`/`EnvHttpProxyAgent`, or `NODE_USE_ENV_PROXY` env-proxy mode — keep the pre-flight check only, mirroring the Python guard's documented proxy residual.
