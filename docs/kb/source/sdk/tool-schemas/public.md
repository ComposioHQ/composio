---
type: "troubleshooting"
title: "TypeScript Tool Schema Definitions"
description: "Public guidance for dangling JSON Schema references in older TypeScript SDK versions."
category: "sessions-and-execution"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "typescript"
  - "sdk"
  - "json-schema"
---
# TypeScript Tool Schema Definitions

## Upgrade when `$ref` is present but root `$defs` is missing

Older `@composio/core` releases through 0.11.0 could preserve a nested `$ref` while stripping the root `$defs` or `definitions` block from raw tool schemas. Downstream schema parsers then see a dangling reference.

The shared fix shipped in `@composio/core` 0.12.0. Upgrade core to 0.12.0 or later and use a compatible provider-package version. That release line is ESM-only and requires Node.js 22.22.3 or later, so confirm runtime and provider compatibility before upgrading.

After upgrading, fetch the exact tool again and verify every internal `$ref` has a matching root definition.
