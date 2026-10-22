# @composio/slim

## 1.0.0-beta.2

No changes in this release.

## 1.0.0-beta.1

### Patch Changes

- 7055914: Move published dependency ranges to their current upstream releases: zod 4.5, openai 7.10, typebox 1.3.27, @mastra/schema-compat 1.3.8, and @cloudflare/workers-types 5.20260905. `@composio/anthropic` also accepts `@anthropic-ai/sdk` 0.124 as a peer, the line it is now tested against.
- 85996c4: Drop `Authorization`, `Proxy-Authorization`, and `Cookie` from the request headers when the SSRF guard follows a redirect to a different origin, as the Fetch standard does for automatic redirects. Same-origin redirects keep them.
- Updated dependencies [b4b9fc4]
  - @composio/json-schema-to-zod@0.3.3-beta.0

## 1.0.0-beta.0

## 0.18.1

### Patch Changes

- Updated dependencies [ab289d6]
  - @composio/json-schema-to-zod@0.3.2

## 0.18.0

### Patch Changes

- db7b576: Declare Node.js 22.22.3 as the minimum supported runtime for every published TypeScript package so package managers surface incompatible runtimes before users encounter ESM loading failures.
- Updated dependencies [db7b576]
  - @composio/json-schema-to-zod@0.3.1

## 0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [5e57815]
  - @composio/json-schema-to-zod@0.3.0

## 0.15.0

### Patch Changes

- e5c9ada: Refresh the OpenAI runtime dependency to version 7.
- Updated dependencies [1503786]
  - @composio/json-schema-to-zod@0.2.2

## 0.14.1

### Patch Changes

- 503b50a: Refresh runtime dependencies across the TypeScript SDK packages.

## 0.14.0

### Patch Changes

- 58bc93b: Refresh dependency ranges and lockfiles across the workspace.
- fa933a6: Fix the `homepage` links in these packages' `package.json`. They pointed at `github.com/ComposioHQ/composio/tree/main/...`, but the default branch is `next` and no `main` branch exists, so every link 404'd on npm and in editor tooltips. They now point at `tree/next/...`.
- Updated dependencies [58bc93b]
- Updated dependencies [fa933a6]
  - @composio/json-schema-to-zod@0.2.1

## 0.13.1

## 0.13.0

### Minor Changes

- d17a268: Add a slim Composio core package that mirrors the built `@composio/core` runtime and types without publishing the packaged `docs/` or `src/` trees.
