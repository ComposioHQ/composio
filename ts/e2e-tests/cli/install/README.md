# CLI installer E2E tests

This suite installs the published-style CLI bundle in a clean Debian container. The image has no preinstalled CLI, no `~/.local/bin`, and no host `~/.composio` mount.

## Local mode

Build a `@composio/cli@98.0.0` Linux fixture for the host architecture, then point the suite at the absolute directory containing `composio-linux-x64.zip` or `composio-linux-aarch64.zip` and `checksums.txt`:

```bash
COMPOSIO_INSTALL_E2E_MODE=local \
COMPOSIO_INSTALL_E2E_SHELL=bash \
COMPOSIO_INSTALL_E2E_RELEASE_DIR="$PWD/fixture" \
pnpm test:e2e:install
```

Run the same command with `COMPOSIO_INSTALL_E2E_SHELL=zsh` for the shell-variant and bundle-layout assertions. The host server serves the checked-out installer scripts and the local release fixture without publishing it.

## Production mode

Run the latest stable installer against the live routes:

```bash
COMPOSIO_INSTALL_E2E_MODE=prod \
COMPOSIO_INSTALL_E2E_SHELL=zsh \
COMPOSIO_INSTALL_E2E_VERSION=latest \
pnpm test:e2e:install
```

Set `COMPOSIO_INSTALL_E2E_VERSION=@composio/cli@0.3.1` to cover the shell-configuration fallback for a CLI release that predates `composio install --shell`.
