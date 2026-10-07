# @composio/ts-builders

## 0.2.2

### Patch Changes

- 485c09d: Refresh runtime dependencies and support Anthropic SDK 0.127 in the Anthropic provider.

## 0.2.1

### Patch Changes

- 58bc93b: Refresh dependency ranges and lockfiles across the workspace.

## 0.2.0

### Minor Changes

- 025a657: Drop CommonJS entrypoints and publish the TypeScript SDK packages as ESM-only packages. This is a breaking change within the existing 0.x release line: consumers must use Node.js 22.22.3 or newer. CommonJS callers can only rely on Node's native `require(esm)` interop, and the SDK no longer ships custom CommonJS compatibility machinery or `.cjs` artifacts.
