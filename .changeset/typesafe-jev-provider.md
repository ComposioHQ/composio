---
'@composio/typesafe': minor
---

Add `@composio/typesafe`, a provider for TypeSafe's Jev model. Jev has no tool calling, so the provider compiles Composio tools into typed questions and `decide` returns a call, a partial call, or an abstention with a confidence. `execute` runs a decision for a user ID or a session and asks for explicit confirmation on destructive tools. `shortlistTools` and `confidenceGate` are companion helpers for other providers.
