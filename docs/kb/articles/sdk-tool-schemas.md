## Upgrade when `$ref` is present but root `$defs` is missing

Older `@composio/core` releases through 0.11.0 could preserve a nested `$ref` while stripping the root `$defs` or `definitions` block from raw tool schemas. Downstream schema parsers then see a dangling reference.

The shared fix shipped in `@composio/core` 0.12.0. Upgrade core to 0.12.0 or later and use a compatible provider-package version. That release line is ESM-only and requires Node.js 22.22.3 or later, so confirm runtime and provider compatibility before upgrading.

After upgrading, fetch the exact tool again and verify every internal `$ref` has a matching root definition.
