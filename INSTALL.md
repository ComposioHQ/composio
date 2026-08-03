# Composio CLI installation

Install the CLI bundle in `~/.composio` and its entry point in `~/.local/bin`:

```bash
curl -fsSL https://composio.dev/install | sh
```

The default installer changes no shell files and installs no agent plugins. If it reports that `~/.local/bin` is not available on `PATH`, run the shell-specific command it prints:

```bash
curl -fsSL https://composio.dev/install | sh -s -- --shell zsh
curl -fsSL https://composio.dev/install | sh -s -- --shell bash
curl -fsSL https://composio.dev/install | sh -s -- --shell fish
```

Shell setup delegates to `composio install --shell <shell>` and falls back to writing the same `# Composio CLI` PATH block inline when the installed CLI release predates that flag.

Pin a stable or beta release with `COMPOSIO_INSTALL_VERSION`, or pass the tag as a positional argument:

```bash
curl -fsSL https://composio.dev/install | COMPOSIO_INSTALL_VERSION=0.3.1 sh
curl -fsSL https://composio.dev/install | sh -s -- @composio/cli@0.3.1-beta.329
```

The positional argument takes precedence over `COMPOSIO_INSTALL_VERSION`.

| Variable or argument | Description | Default |
|---|---|---|
| `COMPOSIO_INSTALL_DIR` | Complete CLI bundle directory. | `$HOME/.composio` |
| `COMPOSIO_BIN_DIR` | `composio` entry-point directory. | `$HOME/.local/bin` |
| `COMPOSIO_INSTALL_VERSION` | Stable or beta version, with or without the package prefix. | Latest stable release |
| `COMPOSIO_QUIET` | Set to `1` or `true` to hide progress output. | Unset |
| `COMPOSIO_DEBUG` | Set to `1` or `true` to print installer traces. | Unset |
| `COMPOSIO_INSTALL_HELP` | Set to `0` to hide post-install guidance. | `1` |
| `COMPOSIO_INSTALL_PLUGINS` | Set to `1` to install plugins for detected agent hosts. | `0` |
| `--agent` | Log in as a Composio agent after installation. | Off |
| `--no-plugins` | Skip plugin setup. Kept for compatibility. | Off |
| `--shell` | Configure the requested shell (`zsh`, `bash`, or `fish`) after installation. | Off |

## Manual Installation

Download the archive for your platform from [GitHub Releases](https://github.com/ComposioHQ/composio/releases):

- `composio-linux-x64.zip`
- `composio-linux-aarch64.zip`
- `composio-darwin-x64.zip`
- `composio-darwin-aarch64.zip`

Extract and install the complete bundle. The CLI loads support files beside the executable, so do not copy only the nested `composio` file.

```bash
bundle=composio-linux-x64
COMPOSIO_INSTALL_DIR=${COMPOSIO_INSTALL_DIR:-"$HOME/.composio"}
COMPOSIO_BIN_DIR=${COMPOSIO_BIN_DIR:-"$HOME/.local/bin"}

unzip "$bundle.zip"
mkdir -p "$COMPOSIO_INSTALL_DIR"
cp -Rp "$bundle"/. "$COMPOSIO_INSTALL_DIR/"
chmod +x "$COMPOSIO_INSTALL_DIR/composio"
mkdir -p "$COMPOSIO_BIN_DIR"
if [ "$COMPOSIO_BIN_DIR" != "$COMPOSIO_INSTALL_DIR" ]; then
  ln -sf "$COMPOSIO_INSTALL_DIR/composio" "$COMPOSIO_BIN_DIR/composio"
fi
export PATH="$COMPOSIO_BIN_DIR:$PATH"
```

## Verification

```bash
composio --version
which composio
```

## Uninstall

Remove the entry point and release artifacts without deleting credentials, configuration, or caches. The file list below matches the current release layout; if you installed a different version, compare it against the contents of that release's archive.

```bash
install_dir=${COMPOSIO_INSTALL_DIR:-"$HOME/.composio"}
bin_dir=${COMPOSIO_BIN_DIR:-"$HOME/.local/bin"}

rm -f \
  "$bin_dir/composio" \
  "$install_dir/composio" \
  "$install_dir/release-tag.txt" \
  "$install_dir/run-helpers-runtime.mjs" \
  "$install_dir/run-subagent-shared.mjs" \
  "$install_dir/run-subagent-acp.mjs" \
  "$install_dir/run-subagent-legacy.mjs" \
  "$install_dir/run-subagent-output-mcp.mjs"
rm -rf \
  "$install_dir/services" \
  "$install_dir/acp-adapters" \
  "$install_dir/local-tools-binaries"
```

Remove `# Composio CLI` PATH blocks from `~/.zshrc`, `~/.bashrc`, `~/.bash_profile`, `~/.bash_login`, or `~/.config/fish/config.fish` if you used a shell-specific installer. Blocks written by older installers contain an extra `export COMPOSIO_INSTALL_DIR=...` line after the marker; remove that line too.

To purge credentials, configuration, caches, and every other CLI file, run `rm -rf "${COMPOSIO_INSTALL_DIR:-$HOME/.composio}"`. This is a complete reset and cannot be undone.

## Supported platforms

- Linux x64
- Linux ARM64
- macOS Intel
- macOS Apple Silicon
- Windows: use [WSL](https://learn.microsoft.com/windows/wsl/install) and run the installer inside your WSL distribution
