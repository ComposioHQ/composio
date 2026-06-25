---
'@composio/experimental': patch
---

Add `proxy_execute` to the experimental local workbench helper. The in-sandbox helper from `experimental_createLocalWorkbenchSession` (`@composio/experimental/workbench`) now exposes `proxy_execute(method, endpoint, toolkit, query_params=None, body=None, headers=None)` alongside `run_composio_tool`, `invoke_llm`, and `web_search`, so a local sandbox can make authenticated direct API calls to a connected toolkit when no pre-built tool exists. It posts to the public `…/session/{id}/proxy_execute` route with the session's project API key, and always returns a `(data, error)` tuple.
