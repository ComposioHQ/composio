---
'@composio/core': patch
---

Stop reporting every failed tool lookup as `ComposioToolNotFoundError`. `tools.getRawComposioToolBySlug`, and the `tools.get` / `tools.execute` paths that call it, now raise `ComposioToolNotFoundError` only when the API answers 404 or 400. Any other failure, such as an invalid API key (401), a server error, or a network fault, raises the new `ComposioToolFetchError` with the client error preserved as `cause`. `toolkits.get(slug)` now applies its 404/400 check against the Composio client's `APIError` instead of the OpenAI one, so an unknown toolkit raises `ComposioToolkitNotFoundError` as documented.
