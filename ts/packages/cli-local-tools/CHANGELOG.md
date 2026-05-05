# @composio/cli-local-tools

## 0.0.2

### Patch Changes

- 79ac220: Add the Beeper iMessage local toolkit, rebuildable sidecar binaries from the ComposioHQ platform-imessage submodule, and higher-level wrappers for compact thread discovery, contact-aware thread search, send verification, and primary-instance reaction preparation.
- 79ac220: Add first-class Chrome DevTools local tools backed by the official `chrome-devtools-mcp` package and its stateful `chrome-devtools` CLI daemon.
- 79ac220: Scaffold the CLI local-tools foundation package, wire it into Tool Router search/execute sessions, and expose `composio local-tools list|doctor|configure|meta` for discovery, readiness checks, setup hints, and local metadata state. Concrete app integrations are added in follow-up stack PRs.
- 79ac220: Add first-class Peekaboo macOS local tools backed by a bundled darwin-arm64 Peekaboo CLI binary.
