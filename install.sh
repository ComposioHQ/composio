#!/bin/sh
set -eu

error() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}

warn() {
    printf 'warning: %s\n' "$*" >&2
}

is_true() {
    case ${1:-} in
        1 | true) return 0 ;;
        *) return 1 ;;
    esac
}

info() {
    if ! is_true "${COMPOSIO_QUIET:-}"; then
        printf '%s\n' "$*"
    fi
}

debug() {
    if is_true "${COMPOSIO_DEBUG:-}"; then
        printf '+ %s\n' "$*" >&2
    fi
}

tildify() {
    case $1 in
        "$HOME"/*) printf '%s/%s\n' '~' "${1#"$HOME"/}" ;;
        *) printf '%s\n' "$1" ;;
    esac
}

print_usage() {
    printf '%s\n' \
        'Usage: install.sh [--agent] [--no-plugins] [--shell zsh|bash|fish] [version-tag]' \
        '' \
        'Options:' \
        '  --agent          Sign up or log in as a Composio agent after installation.' \
        '  --no-plugins     Skip agent plugin installation (the default).' \
        '  --shell <shell>  Configure zsh, bash, or fish so the composio command is on PATH.' \
        '  -h, --help       Show this help.' \
        '' \
        'Version tags may be stable or beta, for example 0.3.1 or @composio/cli@0.3.1-beta.329.'
}

validate_identifier() {
    printf '%s\n' "$2" | grep -Eq '^[A-Za-z0-9._-]+$' ||
        error "$1 contains invalid characters (got \"$2\")"
}

url_authority() {
    printf '%s\n' "$1" | sed -e 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##' -e 's#[/?#].*$##'
}

is_allowed_http_authority() {
    case $1 in
        localhost | localhost:* | 127.0.0.1 | 127.0.0.1:* | '[::1]' | '[::1]':*) return 0 ;;
    esac

    if [ -n "${COMPOSIO_INSTALL_ALLOW_HTTP_HOST:-}" ]; then
        case $1 in
            "$COMPOSIO_INSTALL_ALLOW_HTTP_HOST" | "$COMPOSIO_INSTALL_ALLOW_HTTP_HOST":*) return 0 ;;
        esac
    fi

    return 1
}

validate_url() {
    validate_url_value=$1
    case $validate_url_value in
        *[![:print:]]* | *[[:space:]]*) return 1 ;;
    esac

    validate_url_authority=$(url_authority "$validate_url_value")
    [ -n "$validate_url_authority" ] || return 1
    case $validate_url_authority in
        *@*) return 1 ;;
    esac

    case $validate_url_value in
        https://*) return 0 ;;
        http://*) is_allowed_http_authority "$validate_url_authority" ;;
        *) return 1 ;;
    esac
}

# Callers must validate_url first, so the scheme is https, or http on an allowed host.
curl_proto_flags() {
    case $1 in
        https://*) printf '%s\n' '=https' ;;
        *) printf '%s\n' '=http,https' ;;
    esac
}

curl_fetch() {
    curl_fetch_url=$1
    validate_url "$curl_fetch_url" || error "Refusing unsafe URL \"$curl_fetch_url\""
    debug "curl GET $curl_fetch_url"
    curl --fail --silent --location --proto "$(curl_proto_flags "$curl_fetch_url")" \
        --proto-redir '=https' "$curl_fetch_url"
}

curl_download() {
    curl_download_url=$1
    curl_download_output=$2
    curl_download_quiet=${3:-0}
    validate_url "$curl_download_url" || error "Refusing unsafe URL \"$curl_download_url\""
    debug "curl GET $curl_download_url -> $curl_download_output"

    if [ "$curl_download_quiet" = 1 ] || is_true "${COMPOSIO_QUIET:-}"; then
        curl_download_ui=--silent
    else
        curl_download_ui=--progress-bar
    fi

    curl --fail --location "$curl_download_ui" --proto "$(curl_proto_flags "$curl_download_url")" \
        --proto-redir '=https' --output "$curl_download_output" "$curl_download_url"
}

normalize_version() {
    normalize_version_value=$1
    case $normalize_version_value in
        @composio/cli@*) normalize_version_bare=${normalize_version_value#@composio/cli@} ;;
        *) normalize_version_bare=$normalize_version_value ;;
    esac

    printf '%s\n' "$normalize_version_bare" |
        grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$' ||
        error "Invalid Composio CLI version \"$normalize_version_value\". Expected X.Y.Z or X.Y.Z-beta.N."

    printf '@composio/cli@%s\n' "$normalize_version_bare"
}

resolve_latest_cli_release() {
    resolve_page=1
    while [ "$resolve_page" -le 5 ]; do
        resolve_url="$github_api_repo/releases?per_page=100&page=$resolve_page"
        resolve_json=$(curl_fetch "$resolve_url") || return 1
        resolve_release=$(printf '%s\n' "$resolve_json" |
            sed 's/"tag_name"/\
"tag_name"/g; s/"browser_download_url"/\
"browser_download_url"/g' |
            awk -v asset_name="$archive_name" '
                BEGIN {
                    tag = ""
                    stable = "^@composio/cli@[0-9]+\\.[0-9]+\\.[0-9]+$"
                }
                /"tag_name":[[:space:]]*"/ {
                    tag = $0
                    sub(/^.*"tag_name":[[:space:]]*"/, "", tag)
                    sub(/".*$/, "", tag)
                    if (tag !~ stable) tag = ""
                }
                tag != "" && /"browser_download_url":[[:space:]]*"/ && index($0, "/" asset_name "\"") > 0 {
                    url = $0
                    sub(/^.*"browser_download_url":[[:space:]]*"/, "", url)
                    sub(/".*$/, "", url)
                    print tag
                    print url
                    exit
                }
            ')

        if [ -n "$resolve_release" ]; then
            printf '%s\n' "$resolve_release"
            return 0
        fi

        printf '%s\n' "$resolve_json" | grep -q '"tag_name"' || break
        resolve_page=$((resolve_page + 1))
    done

    return 1
}

detect_target() {
    platform=$(uname -ms)
    case $platform in
        'MINGW64'* | 'MSYS'* | 'CYGWIN'*)
            error 'Windows is not supported. Use WSL (https://learn.microsoft.com/windows/wsl/install) and run this script inside your WSL distribution.'
            ;;
        'Darwin x86_64') target=darwin-x64 ;;
        'Darwin arm64') target=darwin-aarch64 ;;
        'Linux aarch64' | 'Linux arm64') target=linux-aarch64 ;;
        'Linux x86_64') target=linux-x64 ;;
        *) error "Unsupported platform: $platform" ;;
    esac

    if [ "$target" = darwin-x64 ]; then
        translated=$(sysctl -n sysctl.proc_translated 2>/dev/null || printf '0')
        if [ "$translated" = 1 ]; then
            target=darwin-aarch64
            info "Your shell is running in Rosetta 2. Downloading for $target instead"
        fi
    fi
}

verify_checksum() {
    checksum_archive=$1
    checksum_manifest=$2
    checksum_name=$3
    checksum_expected=$(awk -v name="$checksum_name" '$2 == name || $2 == "*" name { print $1; exit }' "$checksum_manifest")

    if [ -z "$checksum_expected" ]; then
        warn "No checksum entry found for $checksum_name; continuing without verification"
        return 0
    fi
    printf '%s\n' "$checksum_expected" | grep -Eq '^[0-9a-fA-F]{64}$' ||
        error "Malformed checksum for $checksum_name"

    if command -v sha256sum >/dev/null 2>&1; then
        checksum_actual=$(sha256sum "$checksum_archive" | awk '{ print $1 }')
    elif command -v shasum >/dev/null 2>&1; then
        checksum_actual=$(shasum -a 256 "$checksum_archive" | awk '{ print $1 }')
    else
        warn 'No SHA-256 utility found; continuing without verification'
        return 0
    fi

    [ "$checksum_expected" = "$checksum_actual" ] ||
        error "Checksum mismatch for $checksum_name (expected $checksum_expected, got $checksum_actual)"
    info 'Checksum verified'
}

resolve_directory() {
    resolve_directory_value=$1
    mkdir -p "$resolve_directory_value" || error "Failed to create directory \"$resolve_directory_value\""
    (cd "$resolve_directory_value" && pwd -P)
}

install_bundle() {
    install_bundle_root=$1
    install_bundle_dir=$install_bundle_root/composio-$target

    if [ ! -f "$install_bundle_dir/composio" ]; then
        rm -f "$install_bundle_root/$archive_name" "$install_bundle_root/checksums.txt"
        install_bundle_dir=$install_bundle_root
    fi
    [ -f "$install_bundle_dir/composio" ] || error 'Binary not found in extracted archive'

    if ! find "$install_bundle_dir" -mindepth 1 ! -name composio -print -quit | grep -q .; then
        warn 'This release archive has no bundled support files. Some CLI features may be unavailable.'
    fi

    cp -Rp "$install_bundle_dir"/. "$resolved_install_dir/" ||
        error "Failed to install the CLI bundle to \"$resolved_install_dir\""
    chmod +x "$resolved_install_dir/composio" || error 'Failed to set permissions on executable'
    printf '%s\n' "$version" >"$resolved_install_dir/release-tag.txt" ||
        error "Failed to write install metadata to \"$resolved_install_dir/release-tag.txt\""
}

install_entry_point() {
    entry_point=$resolved_bin_dir/composio
    if [ "$resolved_bin_dir" = "$resolved_install_dir" ]; then
        return 0
    fi
    if [ -d "$entry_point" ]; then
        error "Cannot replace entry point \"$entry_point\" because it is a directory"
    fi
    ln -sf "$resolved_install_dir/composio" "$entry_point" ||
        error "Failed to create entry point \"$entry_point\""
}

path_contains_bin_dir() {
    case :${PATH:-}: in
        *:"$resolved_bin_dir":*) return 0 ;;
        *) return 1 ;;
    esac
}

is_unsafe_path() {
    case $1 in *':'* | *';'* | *'`'* | *'$'* | *'|'* | *'&'* | *'"'* | *"'"* | *'('* | *')'* | *\\*) return 0 ;; esac
    unsafe_path_cr=$(printf '\r')
    case $1 in *"$unsafe_path_cr"* | *'
'*) return 0 ;; esac
    return 1
}

render_bin_dir() {
    render_bin_dir_value=$1
    case $render_bin_dir_value in "$HOME"/*) render_bin_dir_value=\$HOME/${render_bin_dir_value#"$HOME"/} ;; esac
    printf '%s\n' "$render_bin_dir_value"
}

append_path_block() {
    append_path_file=$1
    append_path_shell=$2
    append_path_bin=$3
    mkdir -p "$(dirname "$append_path_file")"
    touch "$append_path_file"
    grep -Fqx '# Composio CLI' "$append_path_file" 2>/dev/null && return 0
    case $append_path_shell in
        fish) append_path_line="set --export PATH \"$append_path_bin\" \$PATH" ;;
        *) append_path_line="export PATH=\"$append_path_bin:\$PATH\"" ;;
    esac
    printf '\n# Composio CLI\n%s\n' "$append_path_line" >>"$append_path_file"
}

inline_shell_setup() {
    inline_setup_shell=$1
    inline_setup_bin_dir=$2
    is_unsafe_path "$inline_setup_bin_dir" && error "COMPOSIO_BIN_DIR contains unsafe characters"
    inline_setup_rendered=$(render_bin_dir "$inline_setup_bin_dir")
    case $inline_setup_shell in
        zsh) append_path_block "$HOME/.zshrc" zsh "$inline_setup_rendered" ;;
        fish) append_path_block "$HOME/.config/fish/config.fish" fish "$inline_setup_rendered" ;;
        bash)
            append_path_block "$HOME/.bashrc" bash "$inline_setup_rendered"
            if [ -f "$HOME/.bash_profile" ]; then
                append_path_block "$HOME/.bash_profile" bash "$inline_setup_rendered"
            elif [ -f "$HOME/.bash_login" ]; then
                append_path_block "$HOME/.bash_login" bash "$inline_setup_rendered"
            fi
            ;;
    esac
}

setup_requested_shell() {
    if "$exe" install --help 2>&1 | grep -q -- '--shell'; then
        debug "delegating shell setup to $exe install --shell $requested_shell"
        if COMPOSIO_CLI_INVOCATION_ORIGIN=installer COMPOSIO_BIN_DIR="$COMPOSIO_BIN_DIR" "$exe" install --shell "$requested_shell"; then
            shell_configured=cli
        else
            debug "falling back to inline $requested_shell shell setup"
            inline_shell_setup "$requested_shell" "$COMPOSIO_BIN_DIR"
            shell_configured=fallback
        fi
    else
        debug "falling back to inline $requested_shell shell setup"
        inline_shell_setup "$requested_shell" "$COMPOSIO_BIN_DIR"
        shell_configured=fallback
    fi

    info "Configured $requested_shell shell setup ($shell_configured)."
    case $requested_shell in
        zsh) info "Restart your shell or run \`source ~/.zshrc\`." ;;
        bash) info "Restart your shell or run \`source ~/.bashrc\`." ;;
        fish) info "Restart your shell or run \`source ~/.config/fish/config.fish\`." ;;
    esac
}

print_post_install_help() {
    [ "${COMPOSIO_INSTALL_HELP:-1}" != 0 ] || return 0
    is_true "${COMPOSIO_QUIET:-}" && return 0

    shell_name=${SHELL:-}
    shell_name=${shell_name##*/}
    shell_route=
    shell_config=
    case $shell_name in
        zsh)
            shell_route=zsh
            shell_config=~/.zshrc
            ;;
        bash)
            shell_route=bash
            shell_config=~/.bashrc
            ;;
        fish)
            shell_route=fish
            shell_config=~/.config/fish/config.fish
            ;;
    esac

    guidance_required=0
    path_contains_bin_dir || guidance_required=1
    if [ "$shell_name" = bash ] && { [ -f "$HOME/.bash_profile" ] || [ -f "$HOME/.bash_login" ]; }; then
        guidance_required=1
    fi

    printf '\n'
    if [ -n "$requested_shell" ]; then
        : # Shell setup already ran; skip the setup suggestion.
    elif [ -n "$shell_route" ]; then
        if [ "$guidance_required" = 1 ]; then
            printf 'Required next step for %s:\n\n' "$shell_name"
        else
            printf 'Optional shell setup for future PATH changes:\n\n'
        fi
        printf '  curl -fsSL https://composio.dev/install | sh -s -- --shell %s\n' "$shell_route"
        printf '\nThis configures %s.\n' "$shell_config"
    elif path_contains_bin_dir; then
        printf 'The composio command is available on PATH.\n'
    else
        printf 'Add %s to PATH, then start a new shell.\n' "$(tildify "$resolved_bin_dir")"
    fi
    printf "\nRun \`composio --help\` to get started.\n"
}

cleanup() {
    if [ -n "${tmpdir:-}" ] && [ -d "$tmpdir" ]; then
        rm -rf "$tmpdir"
    fi
}

cleanup_on_signal() {
    cleanup_signal=$1
    trap - 0 1 2 3 15
    cleanup || :
    exit $((128 + cleanup_signal))
}

main() {
    install_agent=0
    install_plugins=${COMPOSIO_INSTALL_PLUGINS:-0}
    version_arg=
    requested_shell=

    case $install_plugins in
        0 | 1) ;;
        *) error 'COMPOSIO_INSTALL_PLUGINS must be 1 or 0' ;;
    esac

    while [ "$#" -gt 0 ]; do
        case $1 in
            --agent) install_agent=1 ;;
            --no-plugins) install_plugins=0 ;;
            --shell)
                [ "$#" -ge 2 ] || error '--shell requires a value: zsh, bash, or fish'
                case $2 in
                    zsh | bash | fish) requested_shell=$2 ;;
                    *) error "Invalid --shell value \"$2\". Expected zsh, bash, or fish." ;;
                esac
                shift
                ;;
            -h | --help)
                print_usage
                return 0
                ;;
            --*) error "Unknown option: $1" ;;
            *)
                [ -z "$version_arg" ] || error 'Too many arguments. Expected at most one version tag.'
                version_arg=$1
                ;;
        esac
        shift
    done

    COMPOSIO_GITHUB_OWNER=${COMPOSIO_GITHUB_OWNER-ComposioHQ}
    COMPOSIO_GITHUB_REPO=${COMPOSIO_GITHUB_REPO-composio}
    COMPOSIO_GITHUB_URL=${COMPOSIO_GITHUB_URL-https://github.com}
    COMPOSIO_GITHUB_API_BASE_URL=${COMPOSIO_GITHUB_API_BASE_URL:-}
    COMPOSIO_INSTALL_DIR=${COMPOSIO_INSTALL_DIR:-"$HOME/.composio"}
    COMPOSIO_BIN_DIR=${COMPOSIO_BIN_DIR:-"$HOME/.local/bin"}

    validate_identifier COMPOSIO_GITHUB_OWNER "$COMPOSIO_GITHUB_OWNER"
    validate_identifier COMPOSIO_GITHUB_REPO "$COMPOSIO_GITHUB_REPO"
    validate_url "$COMPOSIO_GITHUB_URL" ||
        error "COMPOSIO_GITHUB_URL must use https or an explicitly allowed test host (got \"$COMPOSIO_GITHUB_URL\")"
    if [ -n "$COMPOSIO_GITHUB_API_BASE_URL" ]; then
        validate_url "$COMPOSIO_GITHUB_API_BASE_URL" ||
            error "COMPOSIO_GITHUB_API_BASE_URL must use https or an explicitly allowed test host (got \"$COMPOSIO_GITHUB_API_BASE_URL\")"
    fi

    detect_target
    command -v curl >/dev/null 2>&1 || error 'curl is required to install Composio CLI'
    command -v unzip >/dev/null 2>&1 || error 'unzip is required to install Composio CLI'

    github_repo=${COMPOSIO_GITHUB_URL%/}/$COMPOSIO_GITHUB_OWNER/$COMPOSIO_GITHUB_REPO
    if [ -n "$COMPOSIO_GITHUB_API_BASE_URL" ]; then
        github_api_base=${COMPOSIO_GITHUB_API_BASE_URL%/}
    elif [ "$COMPOSIO_GITHUB_URL" = https://github.com ]; then
        github_api_base=https://api.github.com
    else
        github_api_base=${COMPOSIO_GITHUB_URL%/}/api/v3
    fi
    github_api_repo=$github_api_base/repos/$COMPOSIO_GITHUB_OWNER/$COMPOSIO_GITHUB_REPO
    archive_name=composio-$target.zip

    requested_version=$version_arg
    if [ -z "$requested_version" ]; then
        requested_version=${COMPOSIO_INSTALL_VERSION:-}
    fi

    if [ -n "$requested_version" ]; then
        version=$(normalize_version "$requested_version")
        archive_url=$github_repo/releases/download/$version/$archive_name
    else
        info 'Finding latest stable CLI release...'
        latest_release=$(resolve_latest_cli_release) ||
            error "Failed to determine the latest CLI release with a $archive_name asset. Specify a version manually."
        version=$(printf '%s\n' "$latest_release" | sed -n '1p')
        archive_url=$(printf '%s\n' "$latest_release" | sed -n '2p')
        [ -n "$version" ] && [ -n "$archive_url" ] || error 'The release API returned an incomplete CLI release'
        info "Found latest version: $version"
    fi
    validate_url "$archive_url" || error "Release API returned an unsafe archive URL \"$archive_url\""

    checksums_url=$github_repo/releases/download/$version/checksums.txt
    validate_url "$checksums_url" || error "Refusing unsafe checksum URL \"$checksums_url\""

    tmpdir=$(mktemp -d) || error 'Failed to create a temporary directory'
    trap cleanup 0
    trap 'cleanup_on_signal 1' 1
    trap 'cleanup_on_signal 2' 2
    trap 'cleanup_on_signal 3' 3
    trap 'cleanup_on_signal 15' 15
    debug "temporary directory: $tmpdir"

    info "Installing Composio CLI $version for $target"
    curl_download "$archive_url" "$tmpdir/$archive_name" 0 ||
        error "Failed to download from \"$archive_url\""

    if curl_download "$checksums_url" "$tmpdir/checksums.txt" 1; then
        verify_checksum "$tmpdir/$archive_name" "$tmpdir/checksums.txt" "$archive_name"
    else
        warn 'No checksums.txt in this release; continuing without verification'
    fi

    info 'Extracting bundle...'
    unzip -oqd "$tmpdir" "$tmpdir/$archive_name" || error 'Failed to extract archive'

    resolved_install_dir=$(resolve_directory "$COMPOSIO_INSTALL_DIR")
    resolved_bin_dir=$(resolve_directory "$COMPOSIO_BIN_DIR")
    install_bundle "$tmpdir"
    install_entry_point

    exe=$resolved_install_dir/composio
    "$exe" --version >/dev/null 2>&1 || error 'The installed Composio CLI failed its version check'
    info "Composio CLI was installed to $(tildify "$exe")"
    if [ "$resolved_bin_dir" != "$resolved_install_dir" ]; then
        info "The composio entry point is $(tildify "$resolved_bin_dir/composio")"
    fi

    if [ "$install_plugins" = 1 ]; then
        info 'Installing plugins for detected agent hosts...'
        COMPOSIO_CLI_INVOCATION_ORIGIN=installer "$exe" setup --target auto --yes --if-present ||
            error "Composio CLI was installed, but agent plugin setup failed. Retry with \`composio setup --target auto --yes\`."
    fi

    if [ "$install_agent" = 1 ]; then
        info 'Setting up Composio agent login...'
        COMPOSIO_CLI_INVOCATION_ORIGIN=installer "$exe" login --agent --no-skill-install ||
            error 'Failed to sign up or log in as a Composio agent.'
    fi

    if [ -n "$requested_shell" ]; then
        setup_requested_shell
    fi

    print_post_install_help
}

main "$@"
