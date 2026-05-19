# Composio native UI sidecar

The `composio-native-ui` binaries are built from the in-repository Swift package at `ts/packages/cli-local-tools/native/composio-native-ui`.

- Purpose: native macOS UI surface that the Bun-compiled Composio CLI can spawn for auth flows, tool pickers, and other desktop affordances.
- Build command: `pnpm --filter @composio/cli-local-tools build:composio-native-ui -- --target <darwin-arm64|darwin-x64>`
- Underlying Swift build commands:
  - `swift build -c release --product composio-native-ui --arch arm64`
  - `swift build -c release --product composio-native-ui --arch x86_64`

The sidecar opens a small AppKit approval panel. On built-in Mac displays with a camera housing, it appears top-center and animates out from the notch; on other displays it falls back to the bottom-right corner of the active screen. Generated executables are intentionally not committed; release jobs rebuild them before packaging CLI artifacts.
