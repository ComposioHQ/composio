# Beeper platform-imessage CLI binary

These `imessage-cli` binaries are built from the Composio fork of Beeper platform-imessage.

- Upstream fork: `https://github.com/ComposioHQ/platform-imessage`
- Upstream version: `0.21.0`
- Upstream submodule commit: `364445a1b3089ad9fe293d5951efe160c5677c42`
- License: MIT (`license.txt` in the upstream repository)
- Build command: `pnpm --filter @composio/cli-local-tools build:beeper-imessage -- --target <darwin-arm64|darwin-x64>`
- Underlying Swift build commands:
  - `swift build -c release --product imessage-cli --arch arm64`
  - `swift build -c release --product imessage-cli --arch x86_64`

The binaries are stripped release builds for macOS arm64 and x64. They require local macOS Messages data and may prompt for Messages Data, Accessibility, Contacts, and Automation permissions depending on the command.
