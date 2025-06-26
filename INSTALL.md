# Composio CLI Installation Guide

This guide provides multiple ways to install the Composio CLI on your system.

## Quick Install (Recommended)

### One-line Install
```bash
curl -fsSL https://raw.githubusercontent.com/ComposioHQ/composio/main/install.sh | bash
```

### Install specific version
```bash
curl -fsSL https://raw.githubusercontent.com/ComposioHQ/composio/main/install.sh | bash -s -- v0.1.24
```

### What the install script does:
- Detects your platform and architecture automatically
- Downloads the appropriate binary from GitHub releases
- Installs to `~/.composio/bin/composio`
- Updates your shell configuration (.bashrc, .zshrc, or .config/fish/config.fish)
- Adds the binary to your PATH

## Manual Installation

### From GitHub Releases

1. Go to the [releases page](https://github.com/ComposioHQ/composio/releases)
2. Download the appropriate binary for your platform:
   - `composio-linux-x64.zip` - Linux 64-bit
   - `composio-linux-aarch64.zip` - Linux ARM64
   - `composio-darwin-x64.zip` - macOS Intel
   - `composio-darwin-aarch64.zip` - macOS Apple Silicon

3. Extract and install:
```bash
# Extract the binary
unzip composio-*.zip

# Move to a directory in your PATH
sudo mv composio /usr/local/bin/

# Make it executable
chmod +x /usr/local/bin/composio
```

## Package Manager Installation

### npm
```bash
npm install -g @composio/cli
```

### pnpm
```bash
pnpm add -g @composio/cli
```

### yarn
```bash
yarn global add @composio/cli
```

## Verification

After installation, verify it works:

```bash
composio --version
composio --help
```

## Getting Started

1. **Login to Composio:**
   ```bash
   composio login
   ```

2. **Generate types for your project:**
   ```bash
   # Auto-detect project type and generate
   composio generate
   
   # Generate for TypeScript
   composio ts generate
   
   # Generate for Python  
   composio py generate
   ```

3. **Check your account:**
   ```bash
   composio whoami
   ```

## Supported Platforms

✅ **Fully Supported:**
- Linux x86_64
- Linux ARM64 (aarch64)
- macOS x86_64 (Intel)
- macOS ARM64 (Apple Silicon)

❌ **Not Supported:**
- Windows (use WSL or npm installation)

## Troubleshooting

### Permission Denied
If you get permission errors:
```bash
chmod +x ~/.composio/bin/composio
```

### Command Not Found
If `composio` is not found after installation:

1. **Restart your shell:**
   ```bash
   exec $SHELL
   ```

2. **Or manually source your profile:**
   ```bash
   # For bash
   source ~/.bashrc
   
   # For zsh  
   source ~/.zshrc
   
   # For fish
   source ~/.config/fish/config.fish
   ```

3. **Check if the binary exists:**
   ```bash
   ls -la ~/.composio/bin/composio
   ```

4. **Manually add to PATH:**
   ```bash
   export PATH="$HOME/.composio/bin:$PATH"
   ```

### Download Failures
If the download fails:

1. **Check your internet connection**
2. **Try again with verbose output:**
   ```bash
   curl -v -fsSL https://raw.githubusercontent.com/ComposioHQ/composio/main/install.sh | bash
   ```

3. **Manual download:**
   ```bash
   # Download the install script first
   curl -O https://raw.githubusercontent.com/ComposioHQ/composio/main/install.sh
   
   # Review the script
   cat install.sh
   
   # Run it
   bash install.sh
   ```

## Uninstallation

To remove Composio CLI:

```bash
# Remove the binary
rm -rf ~/.composio

# Remove from shell configuration
# Edit ~/.bashrc, ~/.zshrc, or ~/.config/fish/config.fish
# and remove the lines that were added by the installer:
# export COMPOSIO_INSTALL="$HOME/.composio"
# export PATH="$COMPOSIO_INSTALL/bin:$PATH"
```

## Environment Variables

The installer respects these environment variables:

- `COMPOSIO_INSTALL` - Installation directory (default: `~/.composio`)
- `GITHUB` - GitHub base URL (default: `https://github.com`)

Example:
```bash
export COMPOSIO_INSTALL="/usr/local"
curl -fsSL https://raw.githubusercontent.com/ComposioHQ/composio/main/install.sh | bash
```

## Development

To build the CLI binary locally:

```bash
cd ts/packages/cli
pnpm install
pnpm build:bin
```

The binary will be created at `dist/composio`.

## Support

- 📖 [Documentation](https://docs.composio.dev)
- 💬 [Discord Community](https://discord.gg/composio)
- 🐛 [Report Issues](https://github.com/ComposioHQ/composio/issues)
- 📧 [Email Support](mailto:support@composio.dev)