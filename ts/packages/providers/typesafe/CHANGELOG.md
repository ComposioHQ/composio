# @composio/typesafe

## 0.1.1

### Patch Changes

- dafe138: Reject root schema composition that can hide required arguments, require explicitly supplied values for prototype-named arguments, and preserve `__proto__` as caller data during execution.

## 0.1.0

### Minor Changes

- d36048f: Add `@composio/typesafe`, a provider for TypeSafe's Jev model. Jev has no tool calling, so the provider compiles Composio tools into typed questions and `decide` returns a call, a partial call, or an abstention with a confidence. `execute` runs a decision for a user ID or a session and asks for explicit confirmation on destructive tools. `shortlistTools` and `confidenceGate` are companion helpers for other providers.
