---
'@composio/core': patch
---

Make Session update version preconditions opt-in. `session.update()` no longer adds `expected_config_version` automatically, so default updates work with backends that reject this field. Pass a positive `expectedConfigVersion` only when your backend supports it. The SDK preserves explicit preconditions, surfaces API errors, and never retries PATCH without the requested check.

Remove experimental annotations from the top-level Session config read methods. Applying a config and reading its source metadata remain under `experimental`.
