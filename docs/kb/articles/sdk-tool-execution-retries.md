## Current SDKs do not automatically retry non-idempotent tool executions

Python SDK 0.16.0 and TypeScript SDK 0.14.0 changed tool execution and Proxy Execute so non-idempotent writes are not automatically retried after timeouts, rate limits, or server errors. Upgrade to at least those versions before diagnosing duplicate sends or writes as current SDK retry behavior.

An ambiguous client timeout still does not prove that the provider-side action failed. Before manually retrying a send, create, update, or delete action, inspect the execution log or provider state to determine whether the first attempt completed. If duplicates persist on a current SDK, collect the SDK version, execution log IDs, and timestamps for support.

Suggested guidance:

```text
Current Composio SDKs do not automatically retry non-idempotent tool executions. A timeout can still be ambiguous, so check the execution log or provider state before manually retrying an action that may have completed.
```
