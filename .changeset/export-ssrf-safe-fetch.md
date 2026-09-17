---
'@composio/core': patch
---

Export `ssrfSafeFetch` from the package entry. It was already the guard behind
`composio.files.upload(url)` and Tool Router file mounts, but only reachable
inside the package, so downstream packages fetching a server-supplied URL had no
way to reuse it. Exporting it is additive; no existing behaviour changes.
