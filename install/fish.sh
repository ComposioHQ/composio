#!/bin/sh
set -eu

requested_shell() { printf '%s\n' fish; }

error() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}
is_true() { case ${1:-} in 1 | true) return 0 ;; *) return 1 ;; esac }
info() { is_true "${COMPOSIO_QUIET:-}" || printf '%s\n' "$*"; }
debug() { is_true "${COMPOSIO_DEBUG:-}" && printf '+ %s\n' "$*" >&2 || :; }

url_authority() {
    printf '%s\n' "$1" | sed -e 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##' -e 's#[/?#].*$##'
}

is_allowed_http_authority() {
    case $1 in
        localhost | localhost:* | 127.0.0.1 | 127.0.0.1:* | '[::1]' | '[::1]':*) return 0 ;;
    esac
    if [ -n "${COMPOSIO_INSTALL_ALLOW_HTTP_HOST:-}" ]; then
        case $1 in "$COMPOSIO_INSTALL_ALLOW_HTTP_HOST" | "$COMPOSIO_INSTALL_ALLOW_HTTP_HOST":*) return 0 ;; esac
    fi
    return 1
}

validate_url() {
    variant_url=$1
    case $variant_url in *[![:print:]]* | *[[:space:]]*) return 1 ;; esac
    variant_authority=$(url_authority "$variant_url")
    [ -n "$variant_authority" ] || return 1
    case $variant_authority in *@*) return 1 ;; esac
    case $variant_url in
        https://*) return 0 ;;
        http://*) is_allowed_http_authority "$variant_authority" ;;
        *) return 1 ;;
    esac
}

download_installer() {
    variant_url=$1
    variant_output=$2
    validate_url "$variant_url" || error "Refusing unsafe installer URL \"$variant_url\""
    debug "curl GET $variant_url -> $variant_output"
    case $variant_url in
        https://*) curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --output "$variant_output" "$variant_url" ;;
        http://*) curl --fail --silent --show-error --location --proto '=http,https' --proto-redir '=https' --output "$variant_output" "$variant_url" ;;
    esac
}

is_unsafe_path() {
    case $1 in *':'* | *';'* | *'`'* | *'$'* | *'|'* | *'&'* | *'"'* | *"'"* | *'('* | *')'* | *\\*) return 0 ;; esac
    variant_cr=$(printf '\r')
    case $1 in *"$variant_cr"* | *'
'*) return 0 ;; esac
    return 1
}

render_bin_dir() {
    variant_render=$1
    case $variant_render in "$HOME"/*) variant_render=\$HOME/${variant_render#"$HOME"/} ;; esac
    printf '%s\n' "$variant_render"
}

append_path_block() {
    variant_file=$1
    variant_shell=$2
    variant_bin=$3
    mkdir -p "$(dirname "$variant_file")"
    touch "$variant_file"
    grep -Fqx '# Composio CLI' "$variant_file" 2>/dev/null && return 0
    case $variant_shell in
        fish) variant_line="set --export PATH \"$variant_bin\" \$PATH" ;;
        *) variant_line="export PATH=\"$variant_bin:\$PATH\"" ;;
    esac
    printf '\n# Composio CLI\n%s\n' "$variant_line" >>"$variant_file"
}

inline_shell_setup() {
    variant_shell=$1
    variant_bin_dir=$2
    is_unsafe_path "$variant_bin_dir" && error "COMPOSIO_BIN_DIR contains unsafe characters"
    variant_rendered=$(render_bin_dir "$variant_bin_dir")
    case $variant_shell in
        zsh) append_path_block "$HOME/.zshrc" zsh "$variant_rendered" ;;
        fish) append_path_block "$HOME/.config/fish/config.fish" fish "$variant_rendered" ;;
        bash)
            append_path_block "$HOME/.bashrc" bash "$variant_rendered"
            if [ -f "$HOME/.bash_profile" ]; then
                append_path_block "$HOME/.bash_profile" bash "$variant_rendered"
            elif [ -f "$HOME/.bash_login" ]; then
                append_path_block "$HOME/.bash_login" bash "$variant_rendered"
            fi
            ;;
    esac
}

cleanup() { [ -z "${variant_tmpdir:-}" ] || [ ! -d "$variant_tmpdir" ] || rm -rf "$variant_tmpdir"; }

cleanup_on_signal() {
    cleanup_signal=$1
    trap - 0 1 2 3 15
    cleanup || :
    exit $((128 + cleanup_signal))
}

main() {
    variant_shell=$(requested_shell)
    # Internal test override. User-facing docs intentionally omit this variable.
    variant_script_url=${COMPOSIO_INSTALL_SCRIPT_URL:-https://raw.githubusercontent.com/ComposioHQ/composio/refs/heads/next/install.sh}
    variant_tmpdir=$(mktemp -d) || error 'Failed to create a temporary directory'
    debug "temporary directory: $variant_tmpdir"
    trap cleanup 0
    trap 'cleanup_on_signal 1' 1
    trap 'cleanup_on_signal 2' 2
    trap 'cleanup_on_signal 3' 3
    trap 'cleanup_on_signal 15' 15
    download_installer "$variant_script_url" "$variant_tmpdir/install.sh" || error 'Failed to download the base installer'
    [ -s "$variant_tmpdir/install.sh" ] || error 'Downloaded base installer is empty'

    COMPOSIO_INSTALL_HELP=0 sh "$variant_tmpdir/install.sh" "$@"

    variant_install_dir=${COMPOSIO_INSTALL_DIR:-"$HOME/.composio"}
    variant_bin_dir=${COMPOSIO_BIN_DIR:-"$HOME/.local/bin"}
    variant_exe=$variant_install_dir/composio
    [ -x "$variant_exe" ] || error "Installed executable not found at \"$variant_exe\""

    if "$variant_exe" install --help 2>&1 | grep -q -- '--shell'; then
        debug "delegating shell setup to $variant_exe install --shell $variant_shell"
        if COMPOSIO_CLI_INVOCATION_ORIGIN=installer COMPOSIO_BIN_DIR="$variant_bin_dir" "$variant_exe" install --shell "$variant_shell"; then
            variant_configured=cli
        else
            debug "falling back to inline $variant_shell shell setup"
            inline_shell_setup "$variant_shell" "$variant_bin_dir"
            variant_configured=fallback
        fi
    else
        debug "falling back to inline $variant_shell shell setup"
        inline_shell_setup "$variant_shell" "$variant_bin_dir"
        variant_configured=fallback
    fi

    info "Configured $variant_shell shell setup ($variant_configured)."
    case $variant_shell in
        zsh) info "Restart your shell or run \`source ~/.zshrc\`." ;;
        bash) info "Restart your shell or run \`source ~/.bashrc\`." ;;
        fish) info "Restart your shell or run \`source ~/.config/fish/config.fish\`." ;;
    esac
}

main "$@"
