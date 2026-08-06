---
'@composio/core': patch
---

Release unread response bodies on the paths the SDK knowingly abandons: cancel every intermediate redirect body in `ssrfSafeFetch`, and the response body before throwing on `!response.ok` in both URL-upload call sites, instead of leaving them for the garbage collector to reclaim.
