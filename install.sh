#!/usr/bin/env bash
set -euo pipefail

COMPOSIO_GITHUB_OWNER=${COMPOSIO_GITHUB_OWNER-"ComposioHQ"}
COMPOSIO_GITHUB_REPO=${COMPOSIO_GITHUB_REPO-"composio"}
COMPOSIO_GITHUB_URL=${COMPOSIO_GITHUB_URL-"https://github.com"}
COMPOSIO_GITHUB_API_BASE_URL=${COMPOSIO_GITHUB_API_BASE_URL:-}
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

if [[ -n "$COMPOSIO_GITHUB_API_BASE_URL" && ! "$COMPOSIO_GITHUB_API_BASE_URL" =~ ^https:// ]]; then
    echo "error: COMPOSIO_GITHUB_API_BASE_URL must start with https:// (got \"$COMPOSIO_GITHUB_API_BASE_URL\")" >&2
    exit 1
fi

github_repo="$COMPOSIO_GITHUB_URL/$COMPOSIO_GITHUB_OWNER/$COMPOSIO_GITHUB_REPO"

if [[ -n "$COMPOSIO_GITHUB_API_BASE_URL" ]]; then
    github_api_base="${COMPOSIO_GITHUB_API_BASE_URL%/}"
elif [[ "$COMPOSIO_GITHUB_URL" = "https://github.com" ]]; then
    github_api_base="https://api.github.com"
else
    github_api_base="${COMPOSIO_GITHUB_URL%/}/api/v3"
fi

github_api_repo="$github_api_base/repos/$COMPOSIO_GITHUB_OWNER/$COMPOSIO_GITHUB_REPO"

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

install_agent=false
install_plugins=true
version_arg=""

case "${COMPOSIO_INSTALL_PLUGINS:-1}" in
1) ;;
0) install_plugins=false ;;
*) error 'COMPOSIO_INSTALL_PLUGINS must be 1 or 0' ;;
esac

while [[ $# -gt 0 ]]; do
    case "$1" in
    --agent)
        install_agent=true
        shift
        ;;
    --no-plugins)
        install_plugins=false
        shift
        ;;
    -h|--help)
        echo 'Usage: install.sh [--agent] [--no-plugins] [version-tag]  (e.g. "@composio/cli@0.1.32")'
        echo '  --agent       After installing, sign up/log in as a Composio agent.'
        echo '  --no-plugins  Skip installing plugins for detected agent hosts.'
        echo '  Set COMPOSIO_INSTALL_PLUGINS=0 to skip plugin installation in automation.'
        exit 0
        ;;
    --*)
        error "Unknown option: $1"
        ;;
    *)
        if [[ -n "$version_arg" ]]; then
            error 'Too many arguments. Usage: install.sh [--agent] [--no-plugins] [version-tag]  (e.g. "@composio/cli@0.1.32")'
        fi
        version_arg=$1
        shift
        ;;
    esac
done

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

archive_name="composio-$target.zip"

resolve_latest_cli_release() {
    local page release_json release_line

    for page in 1 2 3 4 5; do
        release_json=$(curl --fail --silent --location "$github_api_repo/releases?per_page=100&page=$page") || return 1

        release_line=$(printf '%s\n' "$release_json" \
            | sed 's/"tag_name"/\
"tag_name"/g; s/"browser_download_url"/\
"browser_download_url"/g' \
            | awk -v asset_name="$archive_name" '
                BEGIN {
                    tag = ""
                    stable_cli_release = "^@composio/cli@[0-9]+\\.[0-9]+\\.[0-9]+$"
                }
                /"tag_name":[[:space:]]*"/ {
                    tag = $0
                    sub(/^.*"tag_name":[[:space:]]*"/, "", tag)
                    sub(/".*$/, "", tag)
                    if (tag !~ stable_cli_release) {
                        tag = ""
                    }
                }
                tag != "" && /"browser_download_url":[[:space:]]*"/ && index($0, "/" asset_name "\"") > 0 {
                    url = $0
                    sub(/^.*"browser_download_url":[[:space:]]*"/, "", url)
                    sub(/".*$/, "", url)
                    print tag "\t" url
                    exit
                }
            ')

        if [[ -n "$release_line" ]]; then
            printf '%s\n' "$release_line"
            return 0
        fi

        if ! printf '%s\n' "$release_json" | grep -q '"tag_name"'; then
            break
        fi
    done

    return 1
}

# --- Version resolution ---

if [[ -z "$version_arg" ]]; then
    info "Finding latest CLI release..."

    latest_release=$(resolve_latest_cli_release) ||
        error "Failed to determine the latest CLI release with a $archive_name asset. Please specify a version manually."

    version=${latest_release%%$'\t'*}
    archive_url=${latest_release#*$'\t'}

    info "Found latest version: $version"
else
    version=$version_arg
    archive_url="$github_repo/releases/download/$version/$archive_name"
fi

# --- Download into temp directory ---

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

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
release_tag_file="$COMPOSIO_INSTALL_DIR/release-tag.txt"

install_bundle_support_files() {
    local source_dir="$1"
    local installed_count=0

    while IFS= read -r -d '' source_path; do
        local relative_path=${source_path#"$source_dir"/}
        local target_path="$COMPOSIO_INSTALL_DIR/$relative_path"

        mkdir -p "$(dirname "$target_path")" ||
            error "Failed to create support file directory \"$(dirname "$target_path")\""

        mv "$source_path" "$target_path" ||
            error "Failed to install support file \"$relative_path\""

        installed_count=$((installed_count + 1))
    done < <(find "$source_dir" -mindepth 1 -type f ! -path "$source_dir/composio" -print0)

    if (( installed_count == 0 )); then
        warn "This release archive does not include any bundled support files beyond the main binary. Some CLI features may be unavailable in this version."
    fi
}

# Handle nested directory structure (composio-<target>/composio)
if [[ -f "$tmpdir/composio-$target/composio" ]]; then
    mv "$tmpdir/composio-$target/composio" "$exe"
    install_bundle_support_files "$tmpdir/composio-$target"
elif [[ -f "$tmpdir/composio" ]]; then
    mv "$tmpdir/composio" "$exe"
    install_bundle_support_files "$tmpdir"
else
    error 'Binary not found in extracted archive'
fi

chmod +x "$exe" ||
    error 'Failed to set permissions on executable'

printf '%s\n' "$version" > "$release_tag_file" ||
    error "Failed to write install metadata to \"$release_tag_file\""

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
            refresh_command="source $(tildify "$zsh_config")"
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

if [[ $install_plugins = true ]]; then
    echo
    info "Checking for supported agent hosts..."
    if ! "$exe" setup --target auto --yes --if-present; then
        error 'Composio CLI was installed, but agent plugin setup failed. Retry with `composio setup --target auto --yes`.'
    fi
fi

if [[ $install_agent = true ]]; then
    echo
    info "Setting up Composio agent login..."
    if ! "$exe" login --agent --no-skill-install; then
        error 'Failed to sign up/log in as a Composio agent. If this CLI is already signed in as a regular user, run `composio logout` and then `composio signup` or `composio agent login <composio_agent_key>`.'
    fi
fi

echo
info "To get started, run:"
echo

if [[ ${refresh_command:-} ]]; then
    info_bold "  $refresh_command"
fi

info_bold "  composio --help"
if [[ $install_agent = true ]]; then
    info_bold "  composio agent whoami"
else
    info_bold "  composio login"
fi
