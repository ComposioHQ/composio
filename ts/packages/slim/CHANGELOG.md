# @composio/slim

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
