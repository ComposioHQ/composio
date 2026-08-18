---
'@composio/core': patch
---

Validate the URLs that come from API responses before fetching them. Tool-execution downloads (`s3Url`), S3 presigned uploads (`new_presigned_url`), Tool Router session file downloads (`RemoteFile.buffer()` / `blob()` / `text()` / `save()`) and session file uploads (`upload_url`) now go through the same SSRF guard that already covered user-supplied URLs, so a response naming a private, loopback, or link-local address is refused instead of fetched. Redirect hops are re-validated. Edge runtimes keep their current behavior: session file transfers are not blocked there, since a Worker cannot resolve DNS to check and its `fetch` does not originate inside the caller's network.
