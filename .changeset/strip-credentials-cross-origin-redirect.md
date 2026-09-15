---
'@composio/core': patch
'@composio/slim': patch
---

Drop `Authorization`, `Proxy-Authorization`, and `Cookie` from the request headers when the SSRF guard follows a redirect to a different origin, as the Fetch standard does for automatic redirects. Same-origin redirects keep them.
