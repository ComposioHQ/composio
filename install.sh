#!/usr/bin/env bash
set -euo pipefail

platform=$(uname -ms)

# Check for unsupported platforms
case $platform in
'MINGW64'* | 'MSYS'* | 'CYGWIN'*)
    echo "Windows installation is not supported yet. Please use WSL or install via npm:"
    echo "  npm install -g @composio/cli"
    exit 1
    ;;
esac

# Reset
Color_Off=''

# Regular Colors
Red=''
Green=''
Dim='' # White

# Bold
Bold_White=''
Bold_Green=''

if [[ -t 1 ]]; then
    # Reset
    Color_Off='\033[0m' # Text Reset

    # Regular Colors
    Red='\033[0;31m'   # Red
    Green='\033[0;32m' # Green
    Dim='\033[0;2m'    # White

    # Bold
    Bold_Green='\033[1;32m' # Bold Green
    Bold_White='\033[1m'    # Bold White
fi

error() {
    echo -e "${Red}error${Color_Off}:" "$@" >&2
    exit 1
}

info() {
    echo -e "${Dim}$@ ${Color_Off}"
}

info_bold() {
    echo -e "${Bold_White}$@ ${Color_Off}"
}

success() {
    echo -e "${Green}$@ ${Color_Off}"
}

# Check for required tools
command -v unzip >/dev/null ||
    error 'unzip is required to install Composio CLI'

command -v curl >/dev/null ||
    error 'curl is required to install Composio CLI'

if [[ $# -gt 1 ]]; then
    error 'Too many arguments, only 1 is allowed. You can specify a specific version to install. (e.g. "v0.1.24")'
fi

# Determine platform and architecture
case $platform in
'Darwin x86_64')
    target=darwin-x64
    ;;
'Darwin arm64')
    target=darwin-aarch64
    ;;
'Linux aarch64' | 'Linux arm64')
    target=linux-aarch64
    ;;
'Linux x86_64' | *)
    target=linux-x64
    ;;
esac

# Check for musl on Linux
case "$target" in
'linux'*)
    if [ -f /etc/alpine-release ]; then
        target="$target-musl"
    fi
    ;;
esac

# Special handling for Rosetta on macOS
if [[ $target = darwin-x64 ]]; then
    # Is this process running in Rosetta?
    # redirect stderr to devnull to avoid error message when not running in Rosetta
    if [[ $(sysctl -n sysctl.proc_translated 2>/dev/null) = 1 ]]; then
        target=darwin-aarch64
        info "Your shell is running in Rosetta 2. Downloading Composio CLI for $target instead"
    fi
fi

COMPOSIO_GITHUB_OWNER=${COMPOSIO_GITHUB_OWNER-"ComposioHQ"}
COMPOSIO_GITHUB_REPO=${COMPOSIO_GITHUB_REPO-"composio"}
COMPOSIO_GITHUB_URL=${COMPOSIO_GITHUB_URL-"https://github.com"}
github_repo="$COMPOSIO_GITHUB_URL/$COMPOSIO_GITHUB_OWNER/$COMPOSIO_GITHUB_REPO"

exe_name=composio

# Determine version to install
if [[ $# = 0 ]]; then
    info "Finding latest CLI release..."
    
    # Get the latest version tag using OS-specific grep patterns
    case $platform in
    'Darwin'*)
        # BSD/MacOS: Use extended regex with -E
        version=$(git ls-remote --tags "$github_repo" \
            | awk -F'/' '{print $3}' \
            | grep -E "^v\d+\.\d+\.\d+.*" \
            | sort -V \
            | tail -n1)
        ;;
    *)
        # Unix/Linux: Use Perl-compatible regex with -P
        version=$(git ls-remote --tags "$github_repo" \
            | awk -F'/' '{print $3}' \
            | grep -P "^v\d+\.\d+\.\d+.*" \
            | sort -V \
            | tail -n1)
        ;;
    esac
    
    if [[ -z "$version" ]]; then
        error "Failed to determine the latest version. Please specify a version manually."
    fi
    
    info "Found latest version: $version"
    
    composio_uri="$github_repo/releases/download/$version/composio-$target.zip"
else
    version=$1
    composio_uri="$github_repo/releases/download/$version/composio-$target.zip"
fi

info "Installing Composio CLI $version for $target"

COMPOSIO_INSTALL_DIR=${COMPOSIO_INSTALL_DIR:-$HOME/.composio}
exe=$COMPOSIO_INSTALL_DIR/composio

if [[ ! -d $COMPOSIO_INSTALL_DIR ]]; then
    mkdir -p "$COMPOSIO_INSTALL_DIR" ||
        error "Failed to create install directory \"$COMPOSIO_INSTALL_DIR\""
fi

# Download
info "Downloading Composio CLI..."
curl --fail --location --progress-bar --output "$exe.zip" "$composio_uri" ||
    error "Failed to download Composio CLI from \"$composio_uri\""

# Extract
info "Extracting Composio CLI..."
unzip -oqd "$COMPOSIO_INSTALL_DIR" "$exe.zip" ||
    error 'Failed to extract Composio CLI'

# Move binary to final location
if [[ -f "$COMPOSIO_INSTALL_DIR/composio-$target/$exe_name" ]]; then
    mv "$COMPOSIO_INSTALL_DIR/composio-$target/$exe_name" "$exe" ||
        error 'Failed to move extracted binary to destination'
    rm -r "$COMPOSIO_INSTALL_DIR/composio-$target"
elif [[ -f "$COMPOSIO_INSTALL_DIR/$exe_name" ]]; then
    mv "$COMPOSIO_INSTALL_DIR/$exe_name" "$exe" ||
        error 'Failed to move extracted binary to destination'
else
    error 'Binary not found in extracted archive'
fi

chmod +x "$exe" ||
    error 'Failed to set permissions on Composio CLI executable'

rm "$exe.zip"

tildify() {
    if [[ $1 = $HOME/* ]]; then
        local replacement=\~/
        echo "${1/$HOME\//$replacement}"
    else
        echo "$1"
    fi
}

success "Composio CLI was installed successfully to $Bold_Green$(tildify "$exe")"

refresh_command=''

tilde_bin_dir=$(tildify "$COMPOSIO_INSTALL_DIR")
quoted_install_dir=\"${COMPOSIO_INSTALL_DIR//\"/\\\"}\"

if [[ $quoted_install_dir = \"$HOME/* ]]; then
    quoted_install_dir=${COMPOSIO_INSTALL_DIR/$HOME\//\$HOME/}
fi

echo

# Add to shell configuration
case $(basename "$SHELL") in
fish)
    commands=(
        "set --export COMPOSIO_INSTALL_DIR $COMPOSIO_INSTALL_DIR"
        "set --export PATH $COMPOSIO_INSTALL_DIR \$PATH"
    )

    fish_config=$HOME/.config/fish/config.fish
    tilde_fish_config=$(tildify "$fish_config")

    if [[ -w $fish_config ]]; then
        {
            echo -e '\n# Composio CLI'

            for command in "${commands[@]}"; do
                echo "$command"
            done
        } >>"$fish_config"

        info "Added \"$tilde_bin_dir\" to \$PATH in \"$tilde_fish_config\""

        refresh_command="source $tilde_fish_config"
    else
        echo "Manually add the directory to $tilde_fish_config (or similar):"

        for command in "${commands[@]}"; do
            info_bold "  $command"
        done
    fi
    ;;
zsh)
    commands=(
        "export COMPOSIO_INSTALL_DIR=$COMPOSIO_INSTALL_DIR"
        "export PATH=\"$COMPOSIO_INSTALL_DIR:\$PATH\""
    )

    zsh_config=$HOME/.zshrc
    tilde_zsh_config=$(tildify "$zsh_config")

    # Create .zshrc if it doesn't exist and directory is writable
    if [[ ! -f $zsh_config && -w $(dirname "$zsh_config") ]]; then
        touch "$zsh_config"
    fi

    if [[ -w $zsh_config ]]; then
        {
            echo -e '\n# Composio CLI'

            for command in "${commands[@]}"; do
                echo "$command"
            done
        } >>"$zsh_config"

        info "Added \"$tilde_bin_dir\" to \$PATH in \"$tilde_zsh_config\""

        refresh_command="exec $SHELL"
    else
        echo "Manually add the directory to $tilde_zsh_config (or similar):"

        for command in "${commands[@]}"; do
            info_bold "  $command"
        done
    fi
    ;;
bash)
    commands=(
        "export COMPOSIO_INSTALL_DIR=$quoted_install_dir"
        "export PATH=\"\$COMPOSIO_INSTALL_DIR:\$PATH\""
    )

    bash_configs=(
        "$HOME/.bashrc"
        "$HOME/.bash_profile"
    )

    if [[ ${XDG_CONFIG_HOME:-} ]]; then
        bash_configs+=(
            "$XDG_CONFIG_HOME/.bash_profile"
            "$XDG_CONFIG_HOME/.bashrc"
            "$XDG_CONFIG_HOME/bash_profile"
            "$XDG_CONFIG_HOME/bashrc"
        )
    fi

    set_manually=true
    for bash_config in "${bash_configs[@]}"; do
        tilde_bash_config=$(tildify "$bash_config")

        if [[ -w $bash_config ]]; then
            {
                echo -e '\n# Composio CLI'

                for command in "${commands[@]}"; do
                    echo "$command"
                done
            } >>"$bash_config"

            info "Added \"$tilde_bin_dir\" to \$PATH in \"$tilde_bash_config\""

            refresh_command="source $bash_config"
            set_manually=false
            break
        fi
    done

    if [[ $set_manually = true ]]; then
        echo "Manually add the directory to $tilde_bash_config (or similar):"

        for command in "${commands[@]}"; do
            info_bold "  $command"
        done
    fi
    ;;

*)
    echo 'Manually add the directory to ~/.bashrc (or similar):'
    info_bold "  export COMPOSIO_INSTALL_DIR=$quoted_install_dir"
    info_bold "  export PATH=\"\$COMPOSIO_INSTALL_DIR:\$PATH\""
    ;;
esac

echo
info "To get started, run:"
echo

if [[ $refresh_command ]]; then
    info_bold "  $refresh_command"
fi

info_bold "  composio --help"
info_bold "  composio login"
