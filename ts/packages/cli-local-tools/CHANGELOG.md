# @composio/cli-local-tools

## 0.1.0

### Minor Changes

- 025a657: Drop CommonJS entrypoints and publish the TypeScript SDK packages as ESM-only packages. This is a breaking change within the existing 0.x release line: consumers must use Node.js 22.22.3 or newer. CommonJS callers can only rely on Node's native `require(esm)` interop, and the SDK no longer ships custom CommonJS compatibility machinery or `.cjs` artifacts.

### Patch Changes

- Updated dependencies [552859a]
- Updated dependencies [a0bef5d]
- Updated dependencies [23f9053]
- Updated dependencies [dfd7a08]
- Updated dependencies [507318d]
- Updated dependencies [025a657]
- Updated dependencies [6a4cb54]
- Updated dependencies [4b76dbf]
- Updated dependencies [cbbad15]
  - @composio/core@0.12.0

## 0.0.5

### Patch Changes

- Updated dependencies [22a9171]
- Updated dependencies [93b67e8]
- Updated dependencies [b69cef1]
- Updated dependencies [1ba66ca]
- Updated dependencies [a94715f]
- Updated dependencies [ce4b213]
- Updated dependencies [44e5458]
  - @composio/core@0.11.0

## 0.0.4

### Patch Changes

- Updated dependencies [42ebff3]
  - @composio/core@0.10.0

## 0.0.3

### Patch Changes

- Updated dependencies [84a3a07]
- Updated dependencies [c358ffa]
  - @composio/core@0.9.1

## 0.0.2

### Patch Changes

- 79ac220: Add the Beeper iMessage local toolkit, rebuildable sidecar binaries from the ComposioHQ platform-imessage submodule, and higher-level wrappers for compact thread discovery, contact-aware thread search, send verification, and primary-instance reaction preparation.
- 79ac220: Add first-class Chrome DevTools local tools backed by the official `chrome-devtools-mcp` package and its stateful `chrome-devtools` CLI daemon.
- 79ac220: Scaffold the CLI local-tools foundation package, wire it into Tool Router search/execute sessions, and expose `composio local-tools list|doctor|configure|meta` for discovery, readiness checks, setup hints, and local metadata state. Concrete app integrations are added in follow-up stack PRs.
- 79ac220: Add first-class Peekaboo macOS local tools backed by a bundled darwin-arm64 Peekaboo CLI binary.
- Updated dependencies [c9b6525]
- Updated dependencies [cc673b6]
- Updated dependencies [9f14971]
- Updated dependencies [81f8027]
- Updated dependencies [711a703]
- Updated dependencies [bccd32b]
- Updated dependencies [bccd32b]
- Updated dependencies [07c9bab]
- Updated dependencies [3ece424]
  - @composio/core@0.9.0
