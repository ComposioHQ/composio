---
'@composio/core': patch
---

Replace the backtracking leading/trailing-slash-trim regexes in the Cloudflare Workers/Edge platform path helpers with index-walk loops, closing a polynomial-time regular expression denial-of-service (CodeQL js/polynomial-redos) on long runs of slash characters. Output is unchanged for every input.
