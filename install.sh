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

GITHUB=${GITHUB-"https://github.com"}
github_repo="$GITHUB/ComposioHQ/composio"

exe_name=composio

# Determine version to install
if [[ $# = 0 ]]; then
    info "Finding latest CLI release..."
    
    # Get the last 20 releases and find the latest one with CLI binaries
    releases_json=$(curl -s "https://api.github.com/repos/ComposioHQ/composio/releases?per_page=20")
    if [[ -z "$releases_json" ]]; then
        error "Failed to fetch releases from GitHub"
    fi
    
    version=""
    # Extract tag names and check each release for CLI binaries
    for tag in $(echo "$releases_json" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' | head -20); do
        # Check if this release has CLI binaries by testing download URL
        test_url="$github_repo/releases/download/$tag/composio-$target.zip"
        if curl -s --head "$test_url" | grep -qE "(200 OK|302)"; then
            version="$tag"
            info "Found CLI release: $version"
            break
        fi
    done
    
    if [[ -z "$version" ]]; then
        error "No CLI release found in the last 20 releases. Please specify a version manually."
    fi
    
    composio_uri="$github_repo/releases/download/$version/composio-$target.zip"
else
    version=$1
    composio_uri="$github_repo/releases/download/$version/composio-$target.zip"
fi

info "Installing Composio CLI $version for $target"

# Set up installation directory
install_env=COMPOSIO_INSTALL
bin_env=\$COMPOSIO_INSTALL/bin

install_dir=${!install_env:-$HOME/.composio}
bin_dir=$install_dir/bin
exe=$bin_dir/composio

if [[ ! -d $bin_dir ]]; then
    mkdir -p "$bin_dir" ||
        error "Failed to create install directory \"$bin_dir\""
fi

# Download and extract
info "Downloading Composio CLI..."
curl --fail --location --progress-bar --output "$exe.zip" "$composio_uri" ||
    error "Failed to download Composio CLI from \"$composio_uri\""

info "Extracting Composio CLI..."
unzip -oqd "$bin_dir" "$exe.zip" ||
    error 'Failed to extract Composio CLI'

# Move binary to final location
if [[ -f "$bin_dir/composio-$target/$exe_name" ]]; then
    mv "$bin_dir/composio-$target/$exe_name" "$exe" ||
        error 'Failed to move extracted binary to destination'
    rm -r "$bin_dir/composio-$target"
elif [[ -f "$bin_dir/$exe_name" ]]; then
    mv "$bin_dir/$exe_name" "$exe" ||
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

# Check if composio is already in PATH
if command -v composio >/dev/null; then
    echo "Run 'composio --help' to get started"
    exit
fi

refresh_command=''

tilde_bin_dir=$(tildify "$bin_dir")
quoted_install_dir=\"${install_dir//\"/\\\"}\"

if [[ $quoted_install_dir = \"$HOME/* ]]; then
    quoted_install_dir=${quoted_install_dir/$HOME\//\$HOME/}
fi

echo

# Add to shell configuration
case $(basename "$SHELL") in
fish)
    commands=(
        "set --export $install_env $quoted_install_dir"
        "set --export PATH $bin_env \$PATH"
    )

    fish_config=$HOME/.config/fish/config.fish
    tilde_fish_config=$(tildify "$fish_config")

    # Create fish config directory and file if they don't exist
    if [[ ! -f $fish_config && -w $(dirname "$(dirname "$fish_config")") ]]; then
        mkdir -p "$(dirname "$fish_config")"
        touch "$fish_config"
    fi

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
        "export $install_env=$quoted_install_dir"
        "export PATH=\"$bin_env:\$PATH\""
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
        "export $install_env=$quoted_install_dir"
        "export PATH=\"$bin_env:\$PATH\""
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

        # Check if file is writable OR if parent directory is writable (so we can create the file)
        if [[ -w "$bash_config" ]] || [[ ! -e "$bash_config" && -w "$(dirname "$bash_config")" ]]; then
            # For .bashrc, prepend the exports before any interactive checks
            if [[ "$bash_config" == *".bashrc" ]] && [[ -f "$bash_config" ]] && grep -q "case.*-.*in" "$bash_config"; then
                # Create a temporary file with our exports at the top
                temp_file=$(mktemp)
                {
                    echo '# Composio CLI'
                    for command in "${commands[@]}"; do
                        echo "$command"
                    done
                    echo
                    cat "$bash_config"
                } > "$temp_file"
                mv "$temp_file" "$bash_config"
            else
                # For other configs or if no interactive check found, append as before
                {
                    echo -e '\n# Composio CLI'
                    for command in "${commands[@]}"; do
                        echo "$command"
                    done
                } >>"$bash_config"
            fi

            info "Added \"$tilde_bin_dir\" to \$PATH in \"$tilde_bash_config\""
            refresh_command="source $bash_config"
            set_manually=false
            break
        fi
    done

    if [[ $set_manually = true ]]; then
        echo "Manually add the directory to ~/.bashrc (or similar):"
        for command in "${commands[@]}"; do
            info_bold "  $command"
        done
    fi
    ;;
*)
    echo 'Manually add the directory to ~/.bashrc (or similar):'
    info_bold "  export $install_env=$quoted_install_dir"
    info_bold "  export PATH=\"$bin_env:\$PATH\""
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

