# Peekaboo CLI binary

These `peekaboo` binaries are built from the upstream Peekaboo repository.

- Upstream repository: `https://github.com/steipete/Peekaboo`
- Upstream version: `3.0.0-beta4`
- Upstream submodule commit: `31e66e8d02656141d18f60bf3b46b24c2b9bc785`
- License: MIT (`LICENSE` in the upstream repository)
- Build command: `pnpm --filter @composio/cli-local-tools build:peekaboo -- --target <darwin-arm64|darwin-x64>`
- Underlying Swift build command: `swift build --arch <arm64|x86_64> -c release -Xswiftc -Osize -Xswiftc -wmo -Xlinker -dead_strip` from `Apps/CLI`

The binaries are release builds for macOS. Peekaboo requires macOS 15+, Screen Recording permission for capture/read tools, and Accessibility/Automation permissions for GUI control tools.
