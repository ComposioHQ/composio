#!/bin/sh
set -eu

requested_shell() { printf '%s\n' zsh; }

error() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}
is_true() { case ${1:-} in 1 | true) return 0 ;; *) return 1 ;; esac }
debug() { if is_true "${COMPOSIO_DEBUG:-}"; then printf '+ %s\n' "$*" >&2; fi; }

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

    # The explicit override wins over any inherited COMPOSIO_INSTALL_SHELL, so the route stays authoritative.
    COMPOSIO_INSTALL_SHELL="$variant_shell" sh "$variant_tmpdir/install.sh" "$@"
}

main "$@"
