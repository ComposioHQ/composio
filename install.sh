#!/usr/bin/env bash
set -euo pipefail

COMPOSIO_GITHUB_OWNER=${COMPOSIO_GITHUB_OWNER-"ComposioHQ"}
COMPOSIO_GITHUB_REPO=${COMPOSIO_GITHUB_REPO-"composio"}
COMPOSIO_GITHUB_URL=${COMPOSIO_GITHUB_URL-"https://github.com"}
COMPOSIO_INSTALL_DIR=${COMPOSIO_INSTALL_DIR:-$HOME/.composio}

# --- Input validation ---

# Only allow HTTPS URLs for the download source.
if [[ ! "$COMPOSIO_GITHUB_URL" =~ ^https:// ]]; then
    echo "error: COMPOSIO_GITHUB_URL must start with https:// (got \"$COMPOSIO_GITHUB_URL\")" >&2
    exit 1
fi

# Owner and repo must be safe identifiers (alphanumeric, hyphens, underscores, dots).
if [[ ! "$COMPOSIO_GITHUB_OWNER" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    echo "error: COMPOSIO_GITHUB_OWNER contains invalid characters (got \"$COMPOSIO_GITHUB_OWNER\")" >&2
    exit 1
fi
if [[ ! "$COMPOSIO_GITHUB_REPO" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    echo "error: COMPOSIO_GITHUB_REPO contains invalid characters (got \"$COMPOSIO_GITHUB_REPO\")" >&2
    exit 1
fi

github_repo="$COMPOSIO_GITHUB_URL/$COMPOSIO_GITHUB_OWNER/$COMPOSIO_GITHUB_REPO"

# --- Colors (only when interactive) ---

Color_Off='' Red='' Green='' Dim='' Bold_White='' Bold_Green=''

if [[ -t 1 ]]; then
    Color_Off='\033[0m'
    Red='\033[0;31m'
    Green='\033[0;32m'
    Dim='\033[0;2m'
    Bold_Green='\033[1;32m'
    Bold_White='\033[1m'
fi

error()     { echo -e "${Red}error${Color_Off}:" "$@" >&2; exit 1; }
warn()      { echo -e "${Red}warning${Color_Off}:" "$@" >&2; }
info()      { echo -e "${Dim}$*${Color_Off}"; }
info_bold() { echo -e "${Bold_White}$*${Color_Off}"; }
success()   { echo -e "${Green}$*${Color_Off}"; }

tildify() {
    if [[ $1 = $HOME/* ]]; then
        echo "~/${1#$HOME/}"
    else
        echo "$1"
    fi
}

# --- Prerequisites ---

command -v curl  >/dev/null || error 'curl is required to install Composio CLI'
command -v unzip >/dev/null || error 'unzip is required to install Composio CLI'
command -v git   >/dev/null || error 'git is required to install Composio CLI'

if [[ $# -gt 1 ]]; then
    error 'Too many arguments. Usage: install.sh [version-tag]  (e.g. "@composio/cli@0.1.32")'
fi

# --- Platform detection ---

platform=$(uname -ms)

case $platform in
'MINGW64'* | 'MSYS'* | 'CYGWIN'*)
    error 'Windows is not supported. Please use WSL or install via npm: npm install -g @composio/cli'
    ;;
esac

case $platform in
'Darwin x86_64')  target=darwin-x64     ;;
'Darwin arm64')   target=darwin-aarch64  ;;
'Linux aarch64' | 'Linux arm64')
                  target=linux-aarch64   ;;
'Linux x86_64')   target=linux-x64      ;;
*)                error "Unsupported platform: $platform" ;;
esac

# Rosetta 2 detection on macOS
if [[ $target = darwin-x64 ]]; then
    if [[ $(sysctl -n sysctl.proc_translated 2>/dev/null) = 1 ]]; then
        target=darwin-aarch64
        info "Your shell is running in Rosetta 2. Downloading for $target instead"
    fi
fi

# --- Version resolution ---

if [[ $# = 0 ]]; then
    info "Finding latest CLI release..."

    version=$(git ls-remote --tags "$github_repo" "@composio/cli@*" \
        | awk '{print $2}' \
        | sed 's#^refs/tags/##; s#\^{}$##' \
        | sort -V \
        | tail -1)

    if [[ -z "$version" ]]; then
        error "Failed to determine the latest version. Please specify a version manually."
    fi

    info "Found latest version: $version"
else
    version=$1
fi

# --- Download into temp directory ---

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

archive_name="composio-$target.zip"
archive_url="$github_repo/releases/download/$version/$archive_name"
checksums_url="$github_repo/releases/download/$version/checksums.txt"

info "Installing Composio CLI $version for $target"

info "Downloading..."
curl --fail --location --progress-bar --output "$tmpdir/$archive_name" "$archive_url" ||
    error "Failed to download from \"$archive_url\""

# --- Checksum verification ---

if curl --fail --silent --location --output "$tmpdir/checksums.txt" "$checksums_url" 2>/dev/null; then
    expected=$(grep "$archive_name" "$tmpdir/checksums.txt" | awk '{print $1}')

    if [[ -n "$expected" ]]; then
        if command -v sha256sum &>/dev/null; then
            actual=$(sha256sum "$tmpdir/$archive_name" | awk '{print $1}')
        elif command -v shasum &>/dev/null; then
            actual=$(shasum -a 256 "$tmpdir/$archive_name" | awk '{print $1}')
        else
            actual=""
            warn "No SHA-256 utility found — skipping verification"
        fi

        if [[ -n "$actual" && "$expected" != "$actual" ]]; then
            error "Checksum mismatch for $archive_name\n  Expected: $expected\n  Actual:   $actual"
        fi

        if [[ -n "$actual" ]]; then
            info "Checksum verified"
        fi
    else
        warn "No checksum entry found for $archive_name — skipping verification"
    fi
else
    info "No checksums.txt in release — skipping verification"
fi

# --- Extract and install ---

info "Extracting..."
unzip -oqd "$tmpdir" "$tmpdir/$archive_name" ||
    error 'Failed to extract archive'

mkdir -p "$COMPOSIO_INSTALL_DIR" ||
    error "Failed to create install directory \"$COMPOSIO_INSTALL_DIR\""

exe="$COMPOSIO_INSTALL_DIR/composio"
companion_modules=(
    "run-subagent-shared.mjs"
    "run-subagent-acp.mjs"
    "run-subagent-legacy.mjs"
)

install_companion_modules() {
    local source_dir="$1"
    local installed_count=0
    local missing=()

    for module in "${companion_modules[@]}"; do
        if [[ -f "$source_dir/$module" ]]; then
            mv "$source_dir/$module" "$COMPOSIO_INSTALL_DIR/$module"
            installed_count=$((installed_count + 1))
        else
            missing+=("$module")
        fi
    done

    if (( installed_count > 0 && installed_count < ${#companion_modules[@]} )); then
        error "Downloaded archive is incomplete; missing companion modules: ${missing[*]}"
    fi

    if (( installed_count == 0 )); then
        warn "This release archive does not include the companion modules required by 'composio run'. That command may be unavailable in this version."
    fi
}

# Handle nested directory structure (composio-<target>/composio)
if [[ -f "$tmpdir/composio-$target/composio" ]]; then
    mv "$tmpdir/composio-$target/composio" "$exe"
    install_companion_modules "$tmpdir/composio-$target"
elif [[ -f "$tmpdir/composio" ]]; then
    mv "$tmpdir/composio" "$exe"
    install_companion_modules "$tmpdir"
else
    error 'Binary not found in extracted archive'
fi

chmod +x "$exe" ||
    error 'Failed to set permissions on executable'

success "Composio CLI was installed successfully to $Bold_Green$(tildify "$exe")"

# --- Shell integration (PATH + completions) ---

# Delegate to the CLI's own install command, which handles:
#   - Idempotent PATH setup in the correct rc file
#   - Shell completions installation
# If the binary can't run (e.g. missing runtime), fall back to inline setup.

echo

install_err=$(mktemp)
if COMPOSIO_INSTALL_DIR="$COMPOSIO_INSTALL_DIR" "$exe" install 2>"$install_err"; then
    cat "$install_err" >&2  # Show CLI's TerminalUI output on success
else
    info "Setting up shell integration..."

    refresh_command=''
    quoted_install_dir=\"${COMPOSIO_INSTALL_DIR//\"/\\\"}\"

    if [[ $quoted_install_dir = \"$HOME/* ]]; then
        quoted_install_dir=${COMPOSIO_INSTALL_DIR/$HOME\//\$HOME/}
    fi

    shell_name=$(basename "${SHELL:-}")
    marker='# Composio CLI'

    case $shell_name in
    fish)
        commands=(
            "set --export COMPOSIO_INSTALL_DIR \"$COMPOSIO_INSTALL_DIR\""
            "set --export PATH \$COMPOSIO_INSTALL_DIR \$PATH"
        )
        fish_config=$HOME/.config/fish/config.fish
        if [[ -w $fish_config ]] || [[ -w $(dirname "$fish_config") ]]; then
            mkdir -p "$(dirname "$fish_config")"
            if ! grep -qxF "$marker" "$fish_config" 2>/dev/null; then
                { echo -e "\n$marker"; for cmd in "${commands[@]}"; do echo "$cmd"; done; } >>"$fish_config"
                info "Added \"$(tildify "$COMPOSIO_INSTALL_DIR")\" to \$PATH in \"$(tildify "$fish_config")\""
            else
                info "PATH already configured in \"$(tildify "$fish_config")\""
            fi
            refresh_command="source $(tildify "$fish_config")"
        else
            echo "Manually add the directory to $(tildify "$fish_config") (or similar):"
            for cmd in "${commands[@]}"; do info_bold "  $cmd"; done
        fi
        ;;
    zsh)
        commands=(
            "export COMPOSIO_INSTALL_DIR=\"$COMPOSIO_INSTALL_DIR\""
            "export PATH=\"\$COMPOSIO_INSTALL_DIR:\$PATH\""
        )
        zsh_config=$HOME/.zshrc
        if [[ ! -f $zsh_config && -w $(dirname "$zsh_config") ]]; then touch "$zsh_config"; fi
        if [[ -w $zsh_config ]]; then
            if ! grep -qxF "$marker" "$zsh_config" 2>/dev/null; then
                { echo -e "\n$marker"; for cmd in "${commands[@]}"; do echo "$cmd"; done; } >>"$zsh_config"
                info "Added \"$(tildify "$COMPOSIO_INSTALL_DIR")\" to \$PATH in \"$(tildify "$zsh_config")\""
            else
                info "PATH already configured in \"$(tildify "$zsh_config")\""
            fi
            refresh_command="exec $SHELL"
        else
            echo "Manually add the directory to $(tildify "$zsh_config") (or similar):"
            for cmd in "${commands[@]}"; do info_bold "  $cmd"; done
        fi
        ;;
    bash)
        commands=(
            "export COMPOSIO_INSTALL_DIR=$quoted_install_dir"
            "export PATH=\"\$COMPOSIO_INSTALL_DIR:\$PATH\""
        )
        bash_configs=("$HOME/.bashrc" "$HOME/.bash_profile")
        if [[ ${XDG_CONFIG_HOME:-} ]]; then
            bash_configs+=("$XDG_CONFIG_HOME/.bash_profile" "$XDG_CONFIG_HOME/.bashrc" "$XDG_CONFIG_HOME/bash_profile" "$XDG_CONFIG_HOME/bashrc")
        fi
        set_manually=true
        for bash_config in "${bash_configs[@]}"; do
            if [[ -w $bash_config ]]; then
                if ! grep -qxF "$marker" "$bash_config" 2>/dev/null; then
                    { echo -e "\n$marker"; for cmd in "${commands[@]}"; do echo "$cmd"; done; } >>"$bash_config"
                    info "Added \"$(tildify "$COMPOSIO_INSTALL_DIR")\" to \$PATH in \"$(tildify "$bash_config")\""
                else
                    info "PATH already configured in \"$(tildify "$bash_config")\""
                fi
                refresh_command="source $bash_config"
                set_manually=false
                break
            fi
        done
        if [[ $set_manually = true ]]; then
            echo "Manually add the directory to ~/.bashrc (or similar):"
            for cmd in "${commands[@]}"; do info_bold "  $cmd"; done
        fi
        ;;
    *)
        echo 'Manually add the directory to ~/.bashrc (or similar):'
        info_bold "  export COMPOSIO_INSTALL_DIR=$quoted_install_dir"
        info_bold "  export PATH=\"\$COMPOSIO_INSTALL_DIR:\$PATH\""
        ;;
    esac

fi
rm -f "$install_err"

echo
info "To get started, run:"
echo

if [[ ${refresh_command:-} ]]; then
    info_bold "  $refresh_command"
fi

info_bold "  composio --help"
info_bold "  composio login"
