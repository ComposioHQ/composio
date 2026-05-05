# Peekaboo bundled CLI

This directory contains a macOS arm64 Peekaboo CLI binary built from the upstream
`steipete/Peekaboo` project for local Composio CLI tools.

- Upstream repository: https://github.com/steipete/Peekaboo
- Upstream commit researched: 31e66e8d02656141d18f60bf3b46b24c2b9bc785
- Upstream package version: 3.0.0-beta4
- License: MIT (see LICENSE.txt)

The binary is bundled as a sidecar asset and resolved at runtime by
`@composio/cli-local-tools`. If it is unavailable, users may install Peekaboo
separately with `brew install steipete/tap/peekaboo` and use `peekaboo` from PATH.
