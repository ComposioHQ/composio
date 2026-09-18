---
'@composio/core': minor
---

Add `userApiKey` and `orgApiKey` to `ComposioConfig`. Both are forwarded to the underlying API client, which sends each one only on operations whose security scheme requires it (organization, consumer, and user-scoped endpoints reached through `getClient()`), never alongside the project key. They fall back to `COMPOSIO_USER_API_KEY` and `COMPOSIO_ORG_API_KEY`. A project `apiKey` is still required.
