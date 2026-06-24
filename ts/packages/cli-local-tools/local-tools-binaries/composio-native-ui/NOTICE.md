# Composio native UI sidecar

The `composio-native-ui` binaries are built from the in-repository Swift package at `ts/packages/cli-local-tools/native/composio-native-ui`.

- Purpose: native macOS UI surface that the Bun-compiled Composio CLI can spawn for auth flows, tool pickers, and other desktop affordances.
- Build command: `pnpm --filter @composio/cli-local-tools build:composio-native-ui -- --target <darwin-arm64|darwin-x64>`
- Underlying Swift build commands:
  - `swift build -c release --product composio-native-ui --arch arm64`
  - `swift build -c release --product composio-native-ui --arch x86_64`

The scaffold currently opens a small AppKit panel near the bottom-right corner of the active screen. Generated executables are intentionally not committed; release jobs rebuild them before packaging CLI artifacts.
