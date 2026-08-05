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

# Replays a captured subprocess log on the debug channel. The installer owns
# its own presentation, so delegated output is suppressed by default and stays
# available for troubleshooting through COMPOSIO_DEBUG.
debug_captured_output() {
    debug_captured_label=$1
    debug_captured_file=$2
    if ! is_true "${COMPOSIO_DEBUG:-}" || [ ! -s "$debug_captured_file" ]; then
        return 0
    fi
    debug "$debug_captured_label"
    sed 's/^/+   /' "$debug_captured_file" >&2 || :
}

tildify() {
    case $1 in
        "$HOME"/*) printf '%s/%s\n' '~' "${1#"$HOME"/}" ;;
        *) printf '%s\n' "$1" ;;
    esac
}

print_usage() {
    printf '%s\n' \
        'Usage: install.sh [--agent] [--no-plugins] [version-tag]' \
        '' \
        'Options:' \
        '  --agent       Sign up or log in as a Composio agent after installation.' \
        '  --no-plugins  Skip agent plugin installation (the default).' \
        '  -h, --help    Show this help.' \
        '' \
        'Set COMPOSIO_INSTALL_SHELL=auto|zsh|bash|fish|none to control automatic shell setup' \
        "(default auto: detect the login shell from \$SHELL; none: install only)." \
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
        if [ "$official_release_source" = 1 ]; then
            error "checksums.txt has no entry for $checksum_name. Official releases always publish complete checksums, so this release cannot be verified. Refusing to install."
        fi
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
        warn 'Checksum verification skipped: no SHA-256 utility (sha256sum or shasum) is available on this system'
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

publish_staged_entry() {
    publish_source=$1
    publish_name=${publish_source##*/}
    publish_target=$resolved_install_dir/$publish_name

    if [ -d "$publish_source" ] && [ ! -L "$publish_source" ] &&
        { [ -e "$publish_target" ] || [ -L "$publish_target" ]; }; then
        publish_aside=$stage/.composio-aside.$publish_name
        mv "$publish_target" "$publish_aside" ||
            error "Failed to move existing install entry aside: $publish_target"
        if mv "$publish_source" "$publish_target"; then
            rm -rf "$publish_aside" ||
                warn "Published install entry; previous contents retained at $publish_aside"
            return 0
        fi

        if mv "$publish_aside" "$publish_target"; then
            error "Failed to publish install entry: $publish_target"
        fi

        preserve_stage=1
        error "Failed to publish install entry and restore the previous entry. Recover it from $publish_aside"
    fi

    mv "$publish_source" "$publish_target" || error "Failed to publish install entry: $publish_target"
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

    stage=$(mktemp -d "$resolved_install_dir/.composio-install.XXXXXX") ||
        error "Failed to create staging directory in \"$resolved_install_dir\""
    debug "install staging directory: $stage"

    # Staging briefly holds a second copy of the bundle until the binary is published last.
    cp -Rp "$install_bundle_dir"/. "$stage/" ||
        error "Failed to stage the CLI bundle in \"$resolved_install_dir\""
    chmod +x "$stage/composio" || error 'Failed to set permissions on staged executable'
    printf '%s\n' "$version" >"$stage/release-tag.txt" ||
        error "Failed to stage install metadata in \"$resolved_install_dir\""

    for staged_entry in "$stage"/* "$stage"/.[!.]* "$stage"/..?*; do
        if [ ! -e "$staged_entry" ] && [ ! -L "$staged_entry" ]; then
            continue
        fi
        case ${staged_entry##*/} in
            composio | release-tag.txt) continue ;;
        esac
        publish_staged_entry "$staged_entry"
    done

    publish_staged_entry "$stage/release-tag.txt"
    publish_staged_entry "$stage/composio"
    rmdir "$stage" || warn "Published CLI; retained recovery staging directory at $stage"
    stage=
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

inherited_path_contains_bin_dir() {
    case :$inherited_path: in
        *:"$resolved_bin_dir":*) return 0 ;;
        *) return 1 ;;
    esac
}

# Renders a value as one POSIX-safe shell word so recovery commands stay
# copy-paste safe even when the installed path contains whitespace.
shell_quote() {
    case $1 in
        '') printf "''\n" ;;
        *[!A-Za-z0-9_./-]*) printf '%s\n' "$1" | sed "s/'/'\\\\''/g; s/^/'/; s/\$/'/" ;;
        *) printf '%s\n' "$1" ;;
    esac
}

# Follows symlinks and resolves the parent directory physically, so two paths
# compare equal exactly when they name the same executable: the final block's
# installed-vs-shadowed verdict must not change just because one side reaches
# the binary through a symlink alias.
resolve_physical_path() {
    resolve_physical_target=$1
    resolve_physical_steps=0
    while [ -L "$resolve_physical_target" ] && [ "$resolve_physical_steps" -lt 40 ]; do
        resolve_physical_link=$(readlink "$resolve_physical_target") || break
        case $resolve_physical_link in
            /*) resolve_physical_target=$resolve_physical_link ;;
            *) resolve_physical_target=$(dirname "$resolve_physical_target")/$resolve_physical_link ;;
        esac
        resolve_physical_steps=$((resolve_physical_steps + 1))
    done
    resolve_physical_base=$(basename "$resolve_physical_target")
    if resolve_physical_dir=$(cd "$(dirname "$resolve_physical_target")" 2>/dev/null && pwd -P); then
        printf '%s/%s\n' "$resolve_physical_dir" "$resolve_physical_base"
    else
        printf '%s\n' "$resolve_physical_target"
    fi
}

# Resolves the composio command against the PATH snapshot taken before any
# installer code could modify PATH: what the invoking terminal can run.
resolve_inherited_command() {
    PATH=$inherited_path command -v composio 2>/dev/null
}

compute_inherited_resolution() {
    inherited_command=$(resolve_inherited_command) || inherited_command=
    inherited_resolution=unresolved
    if [ -n "$inherited_command" ]; then
        if [ "$(resolve_physical_path "$inherited_command")" = "$(resolve_physical_path "$exe")" ]; then
            inherited_resolution=installed
        else
            inherited_resolution=shadowed
        fi
    fi
}

# Reject bin dirs that cannot be embedded safely in a managed rc line. The dir
# is only ever emitted inside double quotes -- `export PATH="<dir>:$PATH"` for
# bash/zsh and `set --export PATH "<dir>" $PATH` for fish -- so the set is
# deliberately narrow and mirrors UNSAFE_PATH_CHARS in
# ts/packages/cli/src/commands/install.cmd.ts, keeping this inline fallback and
# `composio install` on one contract:
#
#   ` $ " \  the only characters bash and zsh still expand inside double
#            quotes (fish expands a strict subset). Everything else -- `;`,
#            `|`, `&`, `(`, `)`, `'` -- is literal there, so a bin dir like
#            /Users/o'brien/.local/bin is written verbatim, not rejected.
#   CR LF    structural: either would split the managed block into extra lines.
#   :        structural: the PATH separator would silently prepend two entries.
#
# Aborting rather than escaping is what keeps the two branches equivalent: a dir
# the CLI refuses must not slip into an rc file just because the CLI could not
# run. It also means the value reaching append_path_block can no longer carry a
# character that double quotes would interpret, so no escaping pass is needed
# (and `${var//x/y}` is a bashism this POSIX script cannot use anyway).
is_unsafe_path() {
    case $1 in *':'* | *'`'* | *'$'* | *'"'* | *\\*) return 0 ;; esac
    unsafe_path_cr=$(printf '\r')
    case $1 in *"$unsafe_path_cr"* | *'
'*) return 0 ;; esac
    return 1
}

# Renders the home directory itself and paths under it with a literal $HOME
# prefix. Must stay in lockstep with the CLI's renderWithHome (install.cmd.ts):
# delegated_setup_verified compares the CLI-written line against this rendering
# byte for byte, so any disagreement makes every delegated install look stale
# and forces a needless inline rewrite.
#
# Callers must run is_unsafe_path first, so the only `$` in the result is the
# `$HOME` this function introduces -- it survives as a live variable reference
# in the rc line without any user-supplied `$` riding along with it.
render_bin_dir() {
    render_bin_dir_value=$1
    case $render_bin_dir_value in
        "$HOME") render_bin_dir_value=\$HOME ;;
        "$HOME"/*) render_bin_dir_value=\$HOME/${render_bin_dir_value#"$HOME"/} ;;
    esac
    printf '%s\n' "$render_bin_dir_value"
}

path_block_line() {
    case $1 in
        fish) printf "set --export PATH \"%s\" \$PATH\n" "$2" ;;
        *) printf "export PATH=\"%s:\$PATH\"\n" "$2" ;;
    esac
}

# Succeeds only when the file holds exactly one managed marker block and that
# block already names the expected line.
path_block_current() {
    awk -v expected="$2" '
        $0 == "# Composio CLI" { markers++; pending = 1; next }
        pending { pending = 0; if ($0 == expected) matches++ }
        END { exit !(markers == 1 && matches == 1) }
    ' "$1" 2>/dev/null
}

# Reconciles the single managed PATH block in one startup file: keeps an
# already-current block, replaces stale managed blocks, preserves unmanaged
# content, and reports every failure through its return status.
write_path_block() {
    write_path_file=$1
    write_path_line=$(path_block_line "$2" "$3") || return 1
    mkdir -p "$(dirname "$write_path_file")" 2>/dev/null || return 1
    if [ -e "$write_path_file" ] && [ ! -f "$write_path_file" ]; then
        return 1
    fi
    if [ ! -f "$write_path_file" ]; then
        touch "$write_path_file" 2>/dev/null || return 1
    fi
    # Dotfile managers keep startup files as symlinks; rewrite the physical
    # target so the tmp+rename replace below cannot detach the symlink.
    write_path_target=$(resolve_physical_path "$write_path_file")
    if path_block_current "$write_path_target" "$write_path_line"; then
        info "$(tildify "$write_path_file") is already up to date."
        return 0
    fi
    write_path_tmp=$write_path_target.composio.tmp.$$
    # cp -p seeds the tmp with the original permission bits; the awk rewrite
    # below truncates its content while the copied mode survives the rename.
    if ! cp -p "$write_path_target" "$write_path_tmp" 2>/dev/null; then
        rm -f "$write_path_tmp"
        return 1
    fi
    if ! awk '
        function is_managed_path_assignment(line) {
            return line ~ /^[[:space:]]*export PATH=".*:\$PATH"[[:space:]]*$/ ||
                line ~ /^[[:space:]]*set --export PATH ".*" \$PATH[[:space:]]*$/
        }
        # The previously released installer wrote a three-line managed block:
        # the marker, an install-dir export, then a PATH line referencing it.
        # Recognizing that exact pair migrates the whole legacy block instead
        # of orphaning the two export lines once the marker is consumed.
        function is_legacy_install_dir_assignment(line) {
            return line ~ /^[[:space:]]*export COMPOSIO_INSTALL_DIR=".*"[[:space:]]*$/ ||
                line ~ /^[[:space:]]*set --export COMPOSIO_INSTALL_DIR ".*"[[:space:]]*$/
        }
        function is_legacy_pair(first, second) {
            if (first ~ /^[[:space:]]*export COMPOSIO_INSTALL_DIR=".*"[[:space:]]*$/)
                return second ~ /^[[:space:]]*export PATH="\$COMPOSIO_INSTALL_DIR:\$PATH"[[:space:]]*$/
            return second ~ /^[[:space:]]*set --export PATH \$COMPOSIO_INSTALL_DIR \$PATH[[:space:]]*$/
        }
        holding {
            holding = 0
            if (is_legacy_pair(held, $0)) { held = ""; next }
            print held
            held = ""
        }
        pending {
            pending = 0
            if (is_managed_path_assignment($0)) next
            if (is_legacy_install_dir_assignment($0)) { held = $0; holding = 1; next }
        }
        $0 == "# Composio CLI" { pending = 1; next }
        { print }
        END { if (holding) print held }
    ' "$write_path_target" >"$write_path_tmp" 2>/dev/null; then
        rm -f "$write_path_tmp"
        return 1
    fi
    if ! printf '\n# Composio CLI\n%s\n' "$write_path_line" >>"$write_path_tmp" 2>/dev/null; then
        rm -f "$write_path_tmp"
        return 1
    fi
    if ! mv "$write_path_tmp" "$write_path_target" 2>/dev/null; then
        rm -f "$write_path_tmp"
        return 1
    fi
    info "Updated $(tildify "$write_path_file")."
    return 0
}

# Names the bash startup file a login shell reads the managed block from.
# A login bash reads /etc/profile and then only the first existing of
# ~/.bash_profile, ~/.bash_login, ~/.profile; it never reads ~/.bashrc, and
# macOS Terminal.app starts exactly such a shell. An override that already
# exists is reused; otherwise ~/.bash_profile is the file to create. ~/.profile
# is never a target: every POSIX shell shares it.
bash_login_path_file() {
    if [ ! -f "$HOME/.bash_profile" ] && [ -f "$HOME/.bash_login" ]; then
        printf '%s\n' "$HOME/.bash_login"
    else
        printf '%s\n' "$HOME/.bash_profile"
    fi
}

# Single source of truth for the startup files the managed PATH block lands in,
# in write order. Both setup paths and the confirmation message read it, so the
# files the installer configures are exactly the files it verifies and names.
shell_path_files() {
    case $1 in
        zsh) printf '%s\n' "$HOME/.zshrc" ;;
        fish) printf '%s\n' "$HOME/.config/fish/config.fish" ;;
        bash) printf '%s\n' "$HOME/.bashrc" "$(bash_login_path_file)" ;;
        *) return 1 ;;
    esac
}

# A ~/.bash_profile the installer creates shadows an existing ~/.profile, which
# login bash read while no override existed. Seed the new file so it keeps
# sourcing it; ~/.profile itself is left untouched.
seed_bash_login_file() {
    seed_login_shell=$1
    seed_login_file=$2
    if [ "$seed_login_shell" != bash ] || [ "$seed_login_file" != "$HOME/.bash_profile" ]; then
        return 0
    fi
    if [ -e "$seed_login_file" ] || [ ! -f "$HOME/.profile" ]; then
        return 0
    fi
    cat >"$seed_login_file" 2>/dev/null <<'SEED_BASH_LOGIN_FILE' || return 1
# Created by the Composio CLI installer.
# Bash reads this file instead of ~/.profile in login shells.
if [ -f "$HOME/.profile" ]; then
    . "$HOME/.profile"
fi
SEED_BASH_LOGIN_FILE
    return 0
}

inline_shell_setup() {
    inline_setup_shell=$1
    inline_setup_bin_dir=$2
    if is_unsafe_path "$inline_setup_bin_dir"; then
        return 1
    fi
    inline_setup_rendered=$(render_bin_dir "$inline_setup_bin_dir")
    inline_setup_list=$(shell_path_files "$inline_setup_shell") || return 1
    inline_setup_status=0
    while IFS= read -r inline_setup_file; do
        [ -n "$inline_setup_file" ] || continue
        if ! seed_bash_login_file "$inline_setup_shell" "$inline_setup_file"; then
            inline_setup_status=1
            continue
        fi
        write_path_block "$inline_setup_file" "$inline_setup_shell" "$inline_setup_rendered" ||
            inline_setup_status=1
    done <<EOF
$inline_setup_list
EOF
    [ "$inline_setup_status" -eq 0 ] || return 1
    return 0
}

# Succeeds when one startup file already holds the current managed block.
delegated_file_current() {
    [ -f "$1" ] && path_block_current "$1" "$2"
}

# Stable CLI --shell implementations skip any startup file that already
# carries the managed marker, so a delegated exit 0 can leave a stale block
# naming an old bin dir. Confirm every target startup file of the requested
# shell names the current bin dir before trusting the delegation.
delegated_setup_verified() {
    delegated_rendered=$(render_bin_dir "$resolved_bin_dir")
    delegated_line=$(path_block_line "$requested_shell" "$delegated_rendered") || return 1
    delegated_list=$(shell_path_files "$requested_shell") || return 1
    delegated_status=0
    while IFS= read -r delegated_file; do
        [ -n "$delegated_file" ] || continue
        delegated_file_current "$delegated_file" "$delegated_line" || delegated_status=1
    done <<EOF
$delegated_list
EOF
    [ "$delegated_status" -eq 0 ]
}

# Both setup paths disclose the same fact: which startup files now carry the
# managed PATH block. Whether the CLI or the inline fallback wrote them is an
# implementation detail that stays on the debug channel.
report_configured_shell() {
    report_configured_files=
    report_configured_list=$(shell_path_files "$requested_shell") || report_configured_list=
    while IFS= read -r report_configured_file; do
        [ -n "$report_configured_file" ] || continue
        if [ -z "$report_configured_files" ]; then
            report_configured_files=$(tildify "$report_configured_file")
        else
            report_configured_files="$report_configured_files and $(tildify "$report_configured_file")"
        fi
    done <<EOF
$report_configured_list
EOF
    if [ -n "$report_configured_files" ]; then
        info "Configured $requested_shell shell setup in $report_configured_files."
    else
        info "Configured $requested_shell shell setup."
    fi
}

setup_requested_shell() {
    if is_unsafe_path "$resolved_bin_dir"; then
        warn "Skipping automatic shell setup: the executable directory \"$resolved_bin_dir\" contains unsupported characters."
        return 1
    fi
    if "$exe" install --help 2>&1 | grep -q -- '--shell'; then
        debug "delegating shell setup to $exe install --shell $requested_shell"
        # The delegated CLI prints its own branded report for a command the
        # user never ran. Capture both of its streams so the installer keeps
        # sole ownership of the presentation, and replay them under
        # COMPOSIO_DEBUG so genuine failures stay diagnosable.
        setup_delegated_log=$tmpdir/shell-setup-delegated.log
        setup_delegated_status=0
        COMPOSIO_CLI_INVOCATION_ORIGIN=installer COMPOSIO_BIN_DIR="$resolved_bin_dir" \
            "$exe" install --shell "$requested_shell" >"$setup_delegated_log" 2>&1 ||
            setup_delegated_status=$?
        debug_captured_output \
            "delegated shell setup exited $setup_delegated_status; captured output:" \
            "$setup_delegated_log"
        if [ "$setup_delegated_status" -eq 0 ] && delegated_setup_verified; then
            debug "shell setup source: cli"
            report_configured_shell
            return 0
        fi
    fi
    debug "falling back to inline $requested_shell shell setup"
    if inline_shell_setup "$requested_shell" "$resolved_bin_dir"; then
        debug "shell setup source: fallback"
        report_configured_shell
        return 0
    fi
    return 1
}

# Final action block for every non-failure flow: one truthful ending chosen
# from the inherited-resolution and setup-outcome state. It must be the last
# output — the closing block is the instruction users copy, so nothing may
# print after it. Suppressible because it only covers normal success.
print_post_install_help() {
    [ "${COMPOSIO_INSTALL_HELP:-1}" != 0 ] || return 0
    if is_true "${COMPOSIO_QUIET:-}"; then
        return 0
    fi

    compute_inherited_resolution
    printf '\n'

    if [ "$install_agent" = 1 ]; then
        printf 'Composio agent login complete.\n'
        if [ "$inherited_resolution" != installed ]; then
            if [ "$shell_setup_outcome" = success ]; then
                printf 'Open a new terminal to use the composio command.\n'
            else
                printf 'Run composio from its installed location:\n\n  %s --help\n' "$(shell_quote "$exe")"
            fi
        fi
        return 0
    fi

    # Case A: the invoking terminal already resolves the installed executable.
    if [ "$inherited_resolution" = installed ]; then
        if [ "$shell_setup_outcome" = success ] || [ "$shell_setup_mode" = none ]; then
            printf 'composio is ready.\n\n  composio login\n'
            return 0
        fi
    fi

    if [ "$shell_setup_outcome" = success ]; then
        if [ "$inherited_resolution" = shadowed ]; then
            printf 'Another composio command at %s takes precedence in this terminal.\n' "$inherited_command"
            printf 'To use the newly installed CLI, run:\n\n  %s login\n' "$(shell_quote "$exe")"
        else
            # Case B: configured for future terminals, vocabulary-free.
            printf 'Open a new terminal, then run:\n\n  composio login\n'
        fi
        return 0
    fi

    # Install-only guidance: COMPOSIO_INSTALL_SHELL=none or an unrecognized
    # login shell. Never point the user at a shadowed bare command.
    if [ "$shell_setup_mode" = none ]; then
        printf 'Shell setup was skipped (COMPOSIO_INSTALL_SHELL=none).\n'
    else
        printf 'Automatic shell setup is not available for your shell.\n'
    fi
    case $inherited_resolution in
        shadowed) printf 'Another composio command at %s takes precedence in this terminal.\n' "$inherited_command" ;;
        unresolved)
            if ! inherited_path_contains_bin_dir; then
                printf 'Add %s to your PATH to use composio in new terminals.\n' "$(tildify "$resolved_bin_dir")"
            fi
            ;;
    esac
    printf 'To get started now, run:\n\n  %s login\n' "$(shell_quote "$exe")"
}

# Setup failure never fails the install. Recovery travels the stderr warn
# channel so quiet mode and COMPOSIO_INSTALL_HELP=0 cannot suppress it, and the
# trusted --version-verified installed executable is always the last output.
print_setup_failure_ending() {
    if [ "$install_agent" = 1 ] &&
        [ "${COMPOSIO_INSTALL_HELP:-1}" != 0 ] && ! is_true "${COMPOSIO_QUIET:-}"; then
        printf '\nComposio agent login complete.\n'
    fi
    warn "Automatic PATH setup for $requested_shell failed. The Composio CLI is installed and unaffected."
    # The delegated CLI's own output is captured, so point at the channel that
    # replays it instead of leaving the failure undiagnosable.
    if ! is_true "${COMPOSIO_DEBUG:-}"; then
        warn 'Re-run with COMPOSIO_DEBUG=1 for details.'
    fi
    if [ "$install_agent" = 1 ]; then
        printf '\nRun composio from its installed location:\n\n  %s --help\n' "$(shell_quote "$exe")" >&2
    else
        printf '\nTo get started, run:\n\n  %s login\n' "$(shell_quote "$exe")" >&2
    fi
}

cleanup() {
    if [ -n "${tmpdir:-}" ] && [ -d "$tmpdir" ]; then
        rm -rf "$tmpdir"
    fi
    if [ "${preserve_stage:-0}" != 1 ] && [ -n "${stage:-}" ] && [ -d "$stage" ]; then
        rm -rf "$stage"
    fi
}

cleanup_on_signal() {
    cleanup_signal=$1
    trap - 0 1 2 3 15
    cleanup || :
    exit $((128 + cleanup_signal))
}

main() {
    # Snapshot the PATH the invoking terminal handed us before any installer
    # code can modify it; every final-state decision uses only this snapshot.
    inherited_path=${PATH:-}

    install_agent=0
    install_plugins=${COMPOSIO_INSTALL_PLUGINS:-0}
    version_arg=
    requested_shell=${COMPOSIO_INSTALL_SHELL:-}

    case $install_plugins in
        0 | 1) ;;
        *) error 'COMPOSIO_INSTALL_PLUGINS must be 1 or 0' ;;
    esac

    case $requested_shell in
        '' | auto | zsh | bash | fish | none) ;;
        *) error "COMPOSIO_INSTALL_SHELL must be auto, zsh, bash, fish, or none (got \"$requested_shell\")" ;;
    esac

    while [ "$#" -gt 0 ]; do
        case $1 in
            --agent) install_agent=1 ;;
            --no-plugins) install_plugins=0 ;;
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

    # Resolve the setup mode right after argument parsing: auto (the default)
    # infers the login shell from $SHELL and degrades to install-only when it
    # is unset or unrecognized; none is the documented install-only opt-out.
    shell_setup_mode=${requested_shell:-auto}
    case $shell_setup_mode in
        auto)
            login_shell=$(basename "${SHELL:-}" 2>/dev/null) || login_shell=
            case $login_shell in
                zsh | bash | fish) requested_shell=$login_shell ;;
                *) requested_shell= ;;
            esac
            ;;
        none) requested_shell= ;;
    esac

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

    # Official ComposioHQ releases always publish a complete checksums.txt, so
    # a missing manifest or entry is a hard error there. Any overridden source
    # (mirror, test host, custom API base) keeps the lenient warn-and-continue
    # behavior, since its manifests are outside our control.
    official_release_source=0
    if [ "$COMPOSIO_GITHUB_URL" = https://github.com ] &&
        [ "$COMPOSIO_GITHUB_OWNER" = ComposioHQ ] &&
        [ "$COMPOSIO_GITHUB_REPO" = composio ] &&
        [ -z "$COMPOSIO_GITHUB_API_BASE_URL" ]; then
        official_release_source=1
    fi

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
        if [ -z "$version" ] || [ -z "$archive_url" ]; then
            error 'The release API returned an incomplete CLI release'
        fi
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
    elif [ "$official_release_source" = 1 ]; then
        error "Failed to download checksums.txt from \"$checksums_url\". Official releases always publish checksums, so this release cannot be verified. Refusing to install."
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

    # Delegated CLI invocations below may spawn composio subprocesses; make the
    # fresh entry point resolvable for them. Final-state decisions keep using
    # the inherited snapshot taken at the top of main().
    PATH=$resolved_bin_dir:$PATH
    export PATH

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

    shell_setup_outcome=skipped
    if [ -n "$requested_shell" ]; then
        if setup_requested_shell; then
            shell_setup_outcome=success
        else
            shell_setup_outcome=failure
        fi
    fi

    if [ "$shell_setup_outcome" = failure ]; then
        print_setup_failure_ending
    else
        print_post_install_help
    fi
}

main "$@"
