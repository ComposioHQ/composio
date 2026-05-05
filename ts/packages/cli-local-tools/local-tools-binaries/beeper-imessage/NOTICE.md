# Beeper platform-imessage CLI binary

These `imessage-cli` binaries are built from `https://github.com/beeper/platform-imessage`.

- Upstream version: `0.21.0`
- Upstream commit: `c2f552e9acab24c663622eda806b7c0afc7cf2f2`
- License: MIT (`license.txt` in the upstream repository)
- Build commands:
  - `swift build -c release --product imessage-cli`
  - `swift build -c release --product imessage-cli --arch x86_64`

The binaries are stripped release builds for macOS arm64 and x64. They require local macOS Messages data and may prompt for Messages Data, Accessibility, Contacts, and Automation permissions depending on the command.
