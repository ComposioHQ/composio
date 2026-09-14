---
'@composio/core': patch
---

Apply the Fetch standard's redirect rules in `ssrfSafeFetch`, which following redirects manually meant `fetch` never applied: a `303` now retries as a bodiless `GET` instead of replaying an upload's method and body at a result URL, a `301`/`302` does the same for a `POST`, and `307`/`308` keep replaying both. Only `301`, `302`, `303`, `307` and `308` count as redirects to follow, so a `304` or `305` carrying a `Location` is returned to the caller rather than followed.
