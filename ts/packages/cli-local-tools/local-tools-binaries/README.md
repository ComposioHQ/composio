# Local tool binary assets

Platform-specific executable and dynamic-library assets for first-party local tool integrations and CLI native sidecars are generated into this directory during local-tool binary builds.

Do not commit generated executables. Keep notices/licenses in git, pin source with git submodules under `ts/packages/cli-local-tools/vendor/`, and regenerate binaries in CLI release jobs before packaging artifacts.

Current native binary sources:

- Beeper iMessage: `vendor/platform-imessage` (`https://github.com/ComposioHQ/platform-imessage`)
- Peekaboo: `vendor/peekaboo` (`https://github.com/steipete/Peekaboo`)
- Composio native UI sidecar: `native/composio-native-ui` (in-repository Swift package)

Build macOS sidecars for the current host/target with:

```bash
pnpm --filter @composio/cli-local-tools build:local-tool-binaries -- --target darwin-arm64
pnpm --filter @composio/cli-local-tools build:local-tool-binaries -- --target darwin-x64
```

Linux CLI artifacts skip these native sidecars. Chrome DevTools is an npm/npx-based integration and does not use this directory.
