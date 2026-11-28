#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
suite_tmp="$(mktemp -d)"
trap 'rm -rf "$suite_tmp"' EXIT
# Case A and recovery-path assertions compare resolved physical paths, so the
# suite root itself must be physical (macOS mktemp returns /var -> /private/var).
suite_tmp="$(cd "$suite_tmp" && pwd -P)"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local haystack=$1
  local needle=$2
  local label=$3
  grep -Fq -- "$needle" <<<"$haystack" || fail "$label (missing: $needle)"
}

assert_not_contains() {
  local haystack=$1
  local needle=$2
  local label=$3
  if grep -Fq -- "$needle" <<<"$haystack"; then
    fail "$label (unexpected: $needle)"
  fi
}

# Asserts the exact final N lines of an output capture, proving nothing prints
# after the final action block: the ending is the instruction users copy, so
# the last block must win.
assert_tail() {
  local haystack=$1
  local expected=$2
  local label=$3
  local lines actual
  lines=$(printf '%s\n' "$expected" | wc -l | tr -d '[:space:]')
  actual=$(printf '%s\n' "$haystack" | tail -n "$lines")
  if [[ $actual != "$expected" ]]; then
    printf 'FAIL: %s\nexpected tail:\n%s\nactual tail:\n%s\n' "$label" "$expected" "$actual" >&2
    exit 1
  fi
}

wait_for_file() {
  local file=$1
  local label=$2
  for _ in {1..100}; do
    [[ -f $file ]] && return 0
    sleep 0.05
  done
  fail "$label"
}

# The single confirmation both setup paths print: it names the startup files
# that now carry the managed block and never leaks internal vocabulary.
configured_line() {
  case $1 in
  zsh) printf 'Configured zsh shell setup in ~/.zshrc.\n' ;;
  bash) printf 'Configured bash shell setup in ~/.bashrc and ~/.bash_profile.\n' ;;
  fish) printf 'Configured fish shell setup in ~/.config/fish/config.fish.\n' ;;
  *) fail "configured_line: unknown shell $1" ;;
  esac
}

# The recovery ending both failure-adjacent flows close with: an absolute,
# copy-paste-safe login command. "now" is the install-only success variant
# (setup skipped or unavailable, PATH untouched); "later" is the setup-failure
# variant printed on stderr after the failure warning.
recovery_tail() {
  case $1 in
  now) printf 'To get started now, run:\n\n  %s login' "$2" ;;
  later) printf 'To get started, run:\n\n  %s login' "$2" ;;
  *) fail "recovery_tail: unknown mode $1" ;;
  esac
}

# macOS Terminal.app starts bash as a login shell, which reads only the first
# existing of ~/.bash_profile, ~/.bash_login, ~/.profile and never ~/.bashrc.
# Probe a real login bash over the sandboxed HOME to prove the PATH entry
# actually lands somewhere it reads.
assert_login_bash_path() {
  local home=$1
  local bin=$2
  local label=$3
  local login_path
  login_path=$(env -i HOME="$home" PATH=/usr/bin:/bin bash -lc 'printf %s "$PATH"') ||
    fail "$label (login bash probe failed)"
  case ":$login_path:" in
  *":$bin:"*) ;;
  *) fail "$label (login bash PATH lacks $bin: $login_path)" ;;
  esac
}

for script in "$repo_root/install.sh" "$repo_root"/install/*.sh; do
  [[ $(tail -n 1 "$script") == 'main "$@"' ]] || fail "$script must end with main \"\$@\""
  [[ $(grep -c '^main "\$@"$' "$script") -eq 1 ]] || fail "$script must contain one main entry point"
  if grep -En '(^|[[:space:]])\[\[[[:space:]]|set -[^[:space:]]*o[[:space:]]+pipefail|<\(|<<<|echo -e|(^|[[:space:]])local[[:space:]]' "$script"; then
    fail "$script contains a non-POSIX shell construct"
  fi
done

# The shell variants are served as standalone scripts, so their shared logic
# (including the URL-validation security checks) is intentionally copied.
# Enforce that they stay byte-identical except for the shell each hardcodes in
# requested_shell(), so a fix applied to one cannot silently miss the others.
for variant in bash zsh fish; do
  variant_script="$repo_root/install/$variant.sh"
  grep -Fqx "requested_shell() { printf '%s\\n' $variant; }" "$variant_script" ||
    fail "install/$variant.sh must hardcode requested_shell() for $variant"
  # The diff below masks every requested_shell() line, so a second overriding
  # definition would slip through it; require exactly one such line per variant.
  [[ $(grep -Fc 'requested_shell()' "$variant_script") -eq 1 ]] ||
    fail "install/$variant.sh must mention requested_shell() exactly once"
  diff <(grep -Fv 'requested_shell()' "$repo_root/install/bash.sh") \
    <(grep -Fv 'requested_shell()' "$variant_script") >/dev/null ||
    fail "install/$variant.sh drifted from install/bash.sh outside requested_shell()"
done

windows_bin="$suite_tmp/windows-bin"
windows_home="$suite_tmp/windows-home"
mkdir -p "$windows_bin" "$windows_home"
cat >"$windows_bin/uname" <<'EOF'
#!/bin/sh
printf '%s\n' 'MINGW64_NT-10.0 x86_64'
EOF
chmod +x "$windows_bin/uname"

for interpreter in "$(command -v sh)"; do
  help_output=$(env PATH="$windows_bin:$PATH" HOME="$windows_home" "$interpreter" "$repo_root/install.sh" --help 2>&1) ||
    fail '--help must succeed before platform checks'
  assert_contains "$help_output" 'Usage: install.sh' '--help output'

  if invalid_output=$(env PATH="$windows_bin:$PATH" HOME="$windows_home" "$interpreter" "$repo_root/install.sh" --invalid 2>&1); then
    fail 'unknown options must fail'
  fi
  assert_contains "$invalid_output" 'Unknown option: --invalid' 'argument validation order'
  assert_not_contains "$invalid_output" 'Windows is not supported' 'argument validation must precede platform checks'

  if windows_output=$(env PATH="$windows_bin:$PATH" HOME="$windows_home" "$interpreter" "$repo_root/install.sh" 2>&1); then
    fail 'Windows-like platforms must fail'
  fi
  assert_contains "$windows_output" 'Run this installer inside WSL' 'Windows guidance'
done

platform=$(uname -ms)
case $platform in
'Darwin x86_64') target=darwin-x64 ;;
'Darwin arm64') target=darwin-aarch64 ;;
'Linux aarch64'|'Linux arm64') target=linux-aarch64 ;;
'Linux x86_64') target=linux-x64 ;;
*) fail "unsupported test platform: $platform" ;;
esac

archive_name="composio-$target.zip"
stable_tag='@composio/cli@98.0.0'
beta_tag='@composio/cli@98.0.0-beta.123'
missing_asset_tag='@composio/cli@99.0.0'
api_base='https://api.example.test'
github_url='https://github.example.test'
archive_url="https://downloads.example.test/$stable_tag/$archive_name"
script_url='https://installer.example.test/install.sh'

# Exact endings the installer must close with: plain indented lines, no box
# drawing, nothing after them, so the final instruction stays copy-paste safe.
case_a_tail=$'composio is ready.\n\n  composio login'
case_b_tail=$'Open a new terminal, then run:\n\n  composio login'

interpreters=("$(command -v sh)")
if command -v dash >/dev/null 2>&1 && [[ $(command -v dash) != "${interpreters[0]}" ]]; then
  interpreters+=("$(command -v dash)")
fi

# The installer's final block depends on what the inherited PATH resolves, so
# strip any real composio installation from the ambient PATH to keep the
# resolution cases deterministic on developer machines and CI runners.
sanitize_path() {
  local entry result=
  local IFS=':'
  for entry in $1; do
    if [[ -n $entry && ! -x $entry/composio ]]; then
      result+="${result:+:}$entry"
    fi
  done
  printf '%s\n' "$result"
}
ambient_path=$(sanitize_path "$PATH")

for interpreter in "${interpreters[@]}"; do
  interpreter_name=$(basename "$interpreter")
  case_root="$suite_tmp/$interpreter_name"
  fake_bin="$case_root/bin"
  curl_log="$case_root/curl.log"
  composio_log="$case_root/composio.log"
  metadata_url='https://raw.githubusercontent.com/ComposioHQ/composio/cli-release-metadata/latest.txt'
  metadata_latest_tag='@composio/cli@100.12.10'
  metadata_latest_url="https://github.com/ComposioHQ/composio/releases/download/$metadata_latest_tag/$archive_name"
  mkdir -p "$fake_bin"
  : >"$curl_log"
  : >"$composio_log"

  cat >"$fake_bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >>"$TEST_CURL_LOG"
all_args=$*
output=
url=
head=0
while (($# > 0)); do
  case $1 in
  --output|-o)
    output=$2
    shift 2
    ;;
  --proto|--proto-redir|--write-out)
    shift 2
    ;;
  --head)
    head=1
    shift
    ;;
  --fail|--silent|--show-error|--location|--progress-bar)
    shift
    ;;
  --*)
    shift
    ;;
  *)
    url=$1
    shift
    ;;
  esac
done

case $url in
https://*)
  [[ $all_args == *"--proto =https"* && $all_args == *"--proto-redir =https"* ]] || exit 91
  ;;
http://*)
  [[ $all_args == *"--proto =http,https"* && $all_args == *"--proto-redir =https"* ]] || exit 92
  ;;
esac

if [[ $head == 1 ]]; then
  [[ $url == "$TEST_METADATA_LATEST_URL" ]] || exit 94
  if [[ ${TEST_RELEASE_CASE:-} == head-404 ]]; then
    printf 404
    exit 22
  fi
  printf 200
  exit 0
fi

if [[ $url == "$TEST_METADATA_URL" ]]; then
  case ${TEST_RELEASE_CASE:-metadata-success} in
  metadata-success|head-404)
    printf '%s\n' "$TEST_METADATA_LATEST_TAG"
    exit 0
    ;;
  metadata-404)
    exit 22
    ;;
  metadata-beta)
    printf '%s\n' '@composio/cli@101.0.0-beta.1'
    exit 0
    ;;
  metadata-multiline)
    printf '%s\n%s\n' "$TEST_METADATA_LATEST_TAG" 'extra-line'
    exit 0
    ;;
  metadata-html)
    printf '<html><body>%s</body></html>\n' "$TEST_METADATA_LATEST_TAG"
    exit 0
    ;;
  *)
    exit 22
    ;;
  esac
fi

if [[ -n ${TEST_CURL_DELAY_URL:-} && $url == "$TEST_CURL_DELAY_URL" ]]; then
  printf '%s\n' "$PPID" >"$TEST_CURL_PARENT_PID_FILE"
  sleep "${TEST_CURL_DELAY_SECONDS:-1}"
fi

if [[ $url == "$TEST_SCRIPT_URL" ]]; then
  case ${TEST_BASE_MODE:-ok} in
  fail) exit 22 ;;
  empty) : >"$output" ;;
  ok) cp "$TEST_REPO_ROOT/install.sh" "$output" ;;
  esac
  exit 0
fi

case $url in
"$TEST_API_BASE/repos/$COMPOSIO_GITHUB_OWNER/$COMPOSIO_GITHUB_REPO/releases?per_page=100&page=1"|\
'https://api.github.com/repos/ComposioHQ/composio/releases?per_page=100&page=1')
  asset_url=${TEST_API_ASSET_URL:-$TEST_ARCHIVE_URL}
  cat <<JSON
[
  {"tag_name":"$TEST_MISSING_ASSET_TAG","assets":[]},
  {"tag_name":"@composio/cli@99.0.0-beta.1","assets":[{"browser_download_url":"https://downloads.example.test/beta/$TEST_ARCHIVE_NAME"}]},
  {"tag_name":"$TEST_STABLE_TAG","assets":[{"browser_download_url":"$asset_url"}]}
]
JSON
  ;;
"$TEST_ARCHIVE_URL"|*"/releases/download/"*"/$TEST_ARCHIVE_NAME")
  [[ -n $output ]] || exit 93
  if [[ ${TEST_REDIRECT_DOWNGRADE:-0} == 1 ]]; then
    exit 47
  fi
  printf 'fake archive\n' >"$output"
  ;;
*"/releases/download/"*"/checksums.txt")
  case ${TEST_CHECKSUM_MODE:-missing} in
  missing) exit 22 ;;
  valid) printf '%064d  %s\n' 0 "$TEST_ARCHIVE_NAME" | tr '0' 'a' >"$output" ;;
  mismatch) printf '%064d  %s\n' 0 "$TEST_ARCHIVE_NAME" | tr '0' 'b' >"$output" ;;
  malformed) printf 'not-a-hash  %s\n' "$TEST_ARCHIVE_NAME" >"$output" ;;
  absent-entry) printf '%064d  %s\n' 0 'some-other-asset.zip' | tr '0' 'a' >"$output" ;;
  esac
  ;;
*)
  printf 'unexpected curl URL: %s\n' "$url" >&2
  exit 94
  ;;
esac
EOF
  chmod +x "$fake_bin/curl"

  cat >"$fake_bin/sha256sum" <<'EOF'
#!/bin/sh
printf '%s  %s\n' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "$1"
EOF
  chmod +x "$fake_bin/sha256sum"

  cat >"$fake_bin/unzip" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
dest=
while (($# > 0)); do
  case $1 in
  -d)
    dest=$2
    shift 2
    ;;
  -*d)
    dest=$2
    shift 2
    ;;
  *) shift ;;
  esac
done
[[ -n $dest ]] || exit 95
bundle="$dest/composio-$TEST_TARGET"
mkdir -p "$bundle/services" "$bundle/acp-adapters"
cat >"$bundle/composio" <<'BIN'
#!/bin/sh
printf '%s|%s|%s|%s\n' "${COMPOSIO_INSTALL_HELP:-}" "${COMPOSIO_CLI_INVOCATION_ORIGIN:-}" "${COMPOSIO_BIN_DIR:-}" "$*" >>"$TEST_COMPOSIO_LOG"
case ${1:-} in
--version|version)
  printf '%s\n' 'composio fake 98.0.0'
  exit "${TEST_VERSION_EXIT:-0}"
  ;;
setup)
  [ "${COMPOSIO_CLI_INVOCATION_ORIGIN:-}" = installer ] || exit 96
  exit "${TEST_SETUP_EXIT:-0}"
  ;;
login)
  [ "${COMPOSIO_CLI_INVOCATION_ORIGIN:-}" = installer ] || exit 97
  exit 0
  ;;
install)
  if [ "${2:-}" = --help ]; then
    if [ "${TEST_SHELL_CAPABILITY:-supported}" = supported ]; then
      printf '%s\n' 'Usage: composio install [--shell zsh|bash|fish]'
    else
      printf '%s\n' 'Usage: composio install'
    fi
    exit 0
  fi
  if [ "${2:-}" = --shell ]; then
    if [ "${TEST_INSTALL_HINT:-0}" = 1 ]; then
      printf '%s\n' '│ Restart your shell so composio is on PATH │'
    fi
    # Mirror the CLI: write the managed block to the target startup files on exit 0.
    if [ "${TEST_INSTALL_EXIT:-0}" = 0 ]; then
      write_block() {
        if [ -f "$1" ] && grep -Fq "$2" "$1"; then
          return 0
        fi
        printf '\n# Composio CLI\n%s\n' "$2" >>"$1"
      }
      case ${3:-} in
      zsh) write_block "$HOME/.zshrc" "export PATH=\"$COMPOSIO_BIN_DIR:\$PATH\"" ;;
      fish)
        mkdir -p "$HOME/.config/fish"
        write_block "$HOME/.config/fish/config.fish" "set --export PATH \"$COMPOSIO_BIN_DIR\" \$PATH"
        ;;
      bash)
        # Login bash never reads .bashrc, so the CLI also configures a
        # login-mode file, creating ~/.bash_profile when no override exists.
        # (The real CLI additionally seeds a ~/.profile passthrough into a file
        # it creates; that belongs to the CLI and is covered by its unit tests.)
        write_block "$HOME/.bashrc" "export PATH=\"$COMPOSIO_BIN_DIR:\$PATH\""
        if [ ! -f "$HOME/.bash_profile" ] && [ -f "$HOME/.bash_login" ]; then
          write_block "$HOME/.bash_login" "export PATH=\"$COMPOSIO_BIN_DIR:\$PATH\""
        else
          write_block "$HOME/.bash_profile" "export PATH=\"$COMPOSIO_BIN_DIR:\$PATH\""
        fi
        ;;
      esac
    fi
    exit "${TEST_INSTALL_EXIT:-0}"
  fi
  exit 98
  ;;
*) exit 0 ;;
esac
BIN
  chmod +x "$bundle/composio"
  printf '%s\n' 'support' >"$bundle/run-bun.mjs"
  printf '%s\n' 'service' >"$bundle/services/example.txt"
EOF
  chmod +x "$fake_bin/unzip"

  export TEST_REPO_ROOT="$repo_root"
  export TEST_TARGET="$target"
  export TEST_ARCHIVE_NAME="$archive_name"
  export TEST_STABLE_TAG="$stable_tag"
  export TEST_MISSING_ASSET_TAG="$missing_asset_tag"
  export TEST_ARCHIVE_URL="$archive_url"
  export TEST_API_BASE="$api_base"
  export TEST_SCRIPT_URL="$script_url"
  export TEST_CURL_LOG="$curl_log"
  export TEST_METADATA_URL="$metadata_url"
  export TEST_METADATA_LATEST_TAG="$metadata_latest_tag"
  export TEST_METADATA_LATEST_URL="$metadata_latest_url"
  export TEST_COMPOSIO_LOG="$composio_log"

  reset_case() {
    unset CASE_UNSET_PLUGINS CASE_GITHUB_URL CASE_GITHUB_OWNER CASE_GITHUB_REPO CASE_API_BASE CASE_INSTALL_VERSION CASE_INSTALL_SHELL CASE_PLUGINS CASE_QUIET CASE_DEBUG CASE_HELP
    unset CASE_ALLOW_HTTP_HOST CASE_CHECKSUM_MODE CASE_API_ASSET_URL CASE_BASE_MODE CASE_REDIRECT_DOWNGRADE
    unset CASE_SHELL_CAPABILITY CASE_INSTALL_EXIT CASE_SETUP_EXIT CASE_VERSION_EXIT CASE_PATH_PREFIX CASE_UNSET_SHELL
    unset CASE_CURL_DELAY_URL CASE_CURL_DELAY_SECONDS CASE_SHELL_VALUE CASE_INSTALL_HINT
    rm -f "$case_root/curl-parent.pid"
    : >"$curl_log"
    : >"$composio_log"
  }

  # Env assignments shared by run_installer and run_variant. Emitted into
  # common_env_args; each runner appends its own entry-point-specific overrides.
  common_env() {
    local home=$1
    local install_dir=$2
    local bin_dir=$3
    common_env_args=(
      HOME="$home"
      COMPOSIO_INSTALL_DIR="$install_dir"
      COMPOSIO_BIN_DIR="$bin_dir"
      COMPOSIO_GITHUB_URL="${CASE_GITHUB_URL:-$github_url}"
      # CASE_API_BASE set-but-empty passes an empty API base through, which the
      # installer treats as "no override" (official-source cases need this).
      COMPOSIO_GITHUB_API_BASE_URL="${CASE_API_BASE-$api_base}"
      COMPOSIO_GITHUB_OWNER="${CASE_GITHUB_OWNER:-FakeOwner}"
      COMPOSIO_GITHUB_REPO="${CASE_GITHUB_REPO:-fake-repo}"
      TEST_CHECKSUM_MODE="${CASE_CHECKSUM_MODE:-missing}"
      TEST_SHELL_CAPABILITY="${CASE_SHELL_CAPABILITY:-supported}"
      TEST_INSTALL_EXIT="${CASE_INSTALL_EXIT:-0}"
      TEST_CURL_DELAY_URL="${CASE_CURL_DELAY_URL:-}"
      TEST_CURL_DELAY_SECONDS="${CASE_CURL_DELAY_SECONDS:-1}"
      TEST_CURL_PARENT_PID_FILE="$case_root/curl-parent.pid"
    )
    if [[ ${CASE_UNSET_PLUGINS:-0} != 1 ]]; then
      common_env_args+=(COMPOSIO_INSTALL_PLUGINS="${CASE_PLUGINS:-0}")
    fi
  }

  run_installer() {
    local home=$1
    local install_dir=$2
    local bin_dir=$3
    shift 3
    mkdir -p "$home" "$install_dir" "$bin_dir"
    local -a installer_command=("$interpreter" "$repo_root/install.sh")
    if [[ ${CASE_UNSET_SHELL:-0} == 1 ]]; then
      installer_command=("$interpreter" -c 'unset SHELL; script=$1; shift; . "$script"' unset-shell "$repo_root/install.sh")
    fi
    common_env "$home" "$install_dir" "$bin_dir"
    env -u COMPOSIO_INSTALL_PLUGINS \
      PATH="${CASE_PATH_PREFIX:-}$fake_bin:$ambient_path" \
      SHELL="${CASE_SHELL_VALUE:-/bin/bash}" \
      "${common_env_args[@]}" \
      COMPOSIO_INSTALL_VERSION="${CASE_INSTALL_VERSION:-}" \
      COMPOSIO_INSTALL_SHELL="${CASE_INSTALL_SHELL:-}" \
      COMPOSIO_QUIET="${CASE_QUIET:-0}" \
      COMPOSIO_DEBUG="${CASE_DEBUG:-0}" \
      COMPOSIO_INSTALL_HELP="${CASE_HELP:-1}" \
      COMPOSIO_INSTALL_ALLOW_HTTP_HOST="${CASE_ALLOW_HTTP_HOST:-}" \
      TEST_API_ASSET_URL="${CASE_API_ASSET_URL:-}" \
      TEST_REDIRECT_DOWNGRADE="${CASE_REDIRECT_DOWNGRADE:-0}" \
      TEST_INSTALL_HINT="${CASE_INSTALL_HINT:-0}" \
      TEST_SETUP_EXIT="${CASE_SETUP_EXIT:-0}" \
      TEST_VERSION_EXIT="${CASE_VERSION_EXIT:-0}" \
      "${installer_command[@]}" "$@"
  }

  run_variant() {
    local shell_name=$1
    local home=$2
    local install_dir=$3
    local bin_dir=$4
    shift 4
    mkdir -p "$home" "$install_dir" "$bin_dir"
    common_env "$home" "$install_dir" "$bin_dir"
    env -u COMPOSIO_INSTALL_PLUGINS \
      PATH="$fake_bin:$ambient_path" \
      SHELL="/bin/$shell_name" \
      "${common_env_args[@]}" \
      COMPOSIO_INSTALL_SCRIPT_URL="$script_url" \
      TEST_BASE_MODE="${CASE_BASE_MODE:-ok}" \
      "$interpreter" "$repo_root/install/$shell_name.sh" "$@"
  }

  reset_case
  home="$case_root/default-home"
  install_dir="$case_root/default-install"
  bin_dir="$case_root/default-bin"
  output=$(run_installer "$home" "$install_dir" "$bin_dir" 2>&1)
  [[ $(<"$install_dir/release-tag.txt") == "$stable_tag" ]] || fail "$interpreter_name latest stable resolution"
  [[ -x "$install_dir/composio" && -f "$install_dir/run-bun.mjs" ]] || fail "$interpreter_name bundle installation"
  [[ -L "$bin_dir/composio" ]] || fail "$interpreter_name entry-point symlink"
  expected_install_dir=$(cd "$install_dir" && pwd -P)
  [[ $(readlink "$bin_dir/composio") == "$expected_install_dir/composio" ]] || fail "$interpreter_name symlink target"
  assert_contains "$output" "Found latest version: $stable_tag" "$interpreter_name stable discovery"
  grep -Fq "|installer|$bin_dir|install --shell bash" "$composio_log" || fail "$interpreter_name default auto delegation"
  assert_contains "$output" "$(configured_line bash)" "$interpreter_name default auto confirmation"
  assert_not_contains "$output" '(cli)' "$interpreter_name confirmation must not leak internal labels"
  assert_not_contains "$output" '(fallback)' "$interpreter_name confirmation must not leak internal labels"
  # Inherited-PATH contract: the installer prepends the bin dir to its own PATH
  # for delegated CLI calls, but the ending must reflect only the PATH the
  # invoking terminal inherited, which does not contain the bin dir here.
  assert_tail "$output" "$case_b_tail" "$interpreter_name default auto Case B tail"
  grep -Fq "export PATH=\"$bin_dir:\$PATH\"" "$home/.bashrc" || fail "$interpreter_name delegated default flow rc written by the CLI"
  # A login bash reads none of ~/.bashrc, so the delegated path must reach a
  # login-mode startup file as well.
  grep -Fq "export PATH=\"$bin_dir:\$PATH\"" "$home/.bash_profile" ||
    fail "$interpreter_name delegated default flow login file written by the CLI"
  assert_login_bash_path "$home" "$bin_dir" "$interpreter_name delegated default flow login shell"
  assert_not_contains "$output" 'Updated ~/.bashrc' "$interpreter_name delegated default flow must not rewrite rc files inline"
  [[ $(wc -l <"$composio_log") -eq 3 ]] || fail "$interpreter_name default flow invoked extra CLI commands"
  grep -Fq '|--version' "$composio_log" || fail "$interpreter_name version probe"
  [[ ! -s "$case_root/git.log" ]] || fail "$interpreter_name must not use git"

  reset_case
  equal_dir="$case_root/equal-layout"
  run_installer "$case_root/equal-home" "$equal_dir" "$equal_dir" "$beta_tag" >/dev/null 2>&1
  [[ -x "$equal_dir/composio" && ! -L "$equal_dir/composio" ]] || fail "$interpreter_name equal-dir layout"
  [[ $(<"$equal_dir/release-tag.txt") == "$beta_tag" ]] || fail "$interpreter_name explicit beta tag"

  reset_case
  upgrade_home="$case_root/upgrade-home"
  upgrade_install="$case_root/upgrade-install"
  upgrade_bin="$case_root/upgrade-bin"
  mkdir -p "$upgrade_install/services"
  printf '%s\n' stale >"$upgrade_install/services/stale.txt"
  printf '%s\n' old-binary >"$upgrade_install/composio"
  run_installer "$upgrade_home" "$upgrade_install" "$upgrade_bin" "$stable_tag" >/dev/null 2>&1
  [[ -x "$upgrade_install/composio" ]] || fail "$interpreter_name upgrade must replace the existing binary"
  [[ $(<"$upgrade_install/services/example.txt") == service ]] || fail "$interpreter_name upgrade must install new support files"
  [[ ! -e "$upgrade_install/services/stale.txt" ]] || fail "$interpreter_name upgrade must replace bundle directories wholesale"
  [[ -z $(find "$upgrade_install" -maxdepth 1 -name '.composio-install-staging.*' -print -quit) ]] ||
    fail "$interpreter_name upgrade must clean up the staging directory"

  reset_case
  legacy_home="$case_root/legacy-home"
  mkdir -p "$legacy_home"
  printf '%s\n' 'export COMPOSIO_INSTALL_DIR="$HOME/.composio"' >"$legacy_home/.bashrc"
  run_installer "$legacy_home" "$case_root/legacy-install" "$case_root/legacy-bin" "$stable_tag" >/dev/null 2>&1
  [[ -L "$case_root/legacy-bin/composio" ]] || fail "$interpreter_name legacy migration symlink"
  grep -Fq 'COMPOSIO_INSTALL_DIR' "$legacy_home/.bashrc" || fail "$interpreter_name must preserve legacy rc content"

  reset_case
  replacement_bin="$case_root/replacement-bin"
  mkdir -p "$replacement_bin"
  printf '%s\n' old >"$replacement_bin/composio"
  run_installer "$case_root/replacement-home" "$case_root/replacement-install" "$replacement_bin" "$stable_tag" >/dev/null 2>&1
  [[ -L "$replacement_bin/composio" ]] || fail "$interpreter_name regular entry point replacement"

  reset_case
  directory_bin="$case_root/directory-bin"
  mkdir -p "$directory_bin/composio"
  if directory_output=$(run_installer "$case_root/directory-home" "$case_root/directory-install" "$directory_bin" "$stable_tag" 2>&1); then
    fail "$interpreter_name directory entry point must fail"
  fi
  assert_contains "$directory_output" 'because it is a directory' "$interpreter_name directory error"

  reset_case
  CASE_INSTALL_VERSION=97.0.0
  precedence_install="$case_root/precedence-install"
  run_installer "$case_root/precedence-home" "$precedence_install" "$case_root/precedence-bin" 96.0.0 >/dev/null 2>&1
  [[ $(<"$precedence_install/release-tag.txt") == '@composio/cli@96.0.0' ]] || fail "$interpreter_name version precedence"

  reset_case
  CASE_INSTALL_VERSION=95.0.0-beta.7
  env_version_install="$case_root/env-version-install"
  run_installer "$case_root/env-version-home" "$env_version_install" "$case_root/env-version-bin" >/dev/null 2>&1
  [[ $(<"$env_version_install/release-tag.txt") == '@composio/cli@95.0.0-beta.7' ]] || fail "$interpreter_name env beta normalization"

  reset_case
  if malformed_output=$(run_installer "$case_root/malformed-home" "$case_root/malformed-install" "$case_root/malformed-bin" 1.2.3-rc.1 2>&1); then
    fail "$interpreter_name malformed prerelease must fail"
  fi
  assert_contains "$malformed_output" 'Invalid Composio CLI version' "$interpreter_name malformed version"
  [[ ! -s "$curl_log" ]] || fail "$interpreter_name malformed version must fail before network"

  reset_case
  CASE_CHECKSUM_MODE=valid
  run_installer "$case_root/checksum-home" "$case_root/checksum-install" "$case_root/checksum-bin" "$stable_tag" >/dev/null 2>&1

  for checksum_mode in mismatch malformed; do
    reset_case
    CASE_CHECKSUM_MODE=$checksum_mode
    if checksum_output=$(run_installer "$case_root/$checksum_mode-home" "$case_root/$checksum_mode-install" "$case_root/$checksum_mode-bin" "$stable_tag" 2>&1); then
      fail "$interpreter_name $checksum_mode checksum must fail"
    fi
    grep -qi 'checksum' <<<"$checksum_output" || fail "$interpreter_name $checksum_mode checksum error"
  done

  # Overridden sources (mirrors, test hosts) keep the lenient behavior: a
  # missing checksums.txt or a manifest without an entry for the archive warns
  # and the install proceeds.
  reset_case
  CASE_CHECKSUM_MODE=missing
  lenient_output=$(run_installer "$case_root/lenient-home" "$case_root/lenient-install" "$case_root/lenient-bin" "$stable_tag" 2>&1) ||
    fail "$interpreter_name overridden source with missing checksums.txt must proceed"
  assert_contains "$lenient_output" 'No checksums.txt in this release; continuing without verification' \
    "$interpreter_name overridden-source missing manifest warning"
  [[ -x "$case_root/lenient-install/composio" ]] || fail "$interpreter_name overridden-source missing manifest must still install"

  reset_case
  CASE_CHECKSUM_MODE=absent-entry
  entry_lenient_output=$(run_installer "$case_root/entry-lenient-home" "$case_root/entry-lenient-install" "$case_root/entry-lenient-bin" "$stable_tag" 2>&1) ||
    fail "$interpreter_name overridden source with no checksum entry must proceed"
  assert_contains "$entry_lenient_output" 'No checksum entry found' "$interpreter_name overridden-source absent entry warning"

  # The official ComposioHQ source always publishes complete checksums, so the
  # installer must hard-fail there when the manifest or the entry is missing.
  # The env triple below matches the installer defaults exactly; the pinned
  # version tag keeps the release API (and its overridden base) out of play.
  official_env() {
    CASE_GITHUB_URL=https://github.com
    CASE_GITHUB_OWNER=ComposioHQ
    CASE_GITHUB_REPO=composio
    CASE_API_BASE=
  }

  # Custom/mirror sources must not query the official ComposioHQ release metadata branch.
  reset_case
  CASE_INSTALL_SHELL=none
  custom_output=$(run_installer "$case_root/custom-source-home" "$case_root/custom-source-install" "$case_root/custom-source-bin" 2>&1) ||
    fail "$interpreter_name custom source install failed: $custom_output"
  ! grep -Fq "$metadata_url" "$curl_log" ||
    fail "$interpreter_name custom source must not fetch official release metadata"

  while read -r release_case expected_metadata expected_head expected_api; do
    reset_case
    official_env
    CASE_CHECKSUM_MODE=valid
    CASE_INSTALL_SHELL=none
    expected_tag=$stable_tag
    [[ $release_case != metadata-success ]] || expected_tag=$metadata_latest_tag
    release_install="$case_root/$release_case-install"
    release_output=$(TEST_RELEASE_CASE="$release_case" run_installer \
      "$case_root/$release_case-home" "$release_install" "$case_root/$release_case-bin" 2>&1) ||
      fail "$interpreter_name $release_case install failed: $release_output"
    [[ -x "$release_install/composio" ]] ||
      fail "$interpreter_name $release_case must install composio"
    assert_contains "$release_output" "Found latest version: $expected_tag" \
      "$interpreter_name $release_case resolved tag"
    metadata_calls=$(grep -Fc -- " $metadata_url" "$curl_log" || :)
    curl_calls=$(wc -l <"$curl_log")
    head_calls=$(grep -Ec '(^| )--head( |$)' "$curl_log" || :)
    api_calls=$(grep -Fc 'releases?per_page=' "$curl_log" || :)
    [[ $metadata_calls -eq $expected_metadata && $head_calls -eq $expected_head && $api_calls -eq $expected_api &&
      $curl_calls -eq $((2 + expected_metadata + expected_head + expected_api)) ]] ||
      fail "$interpreter_name $release_case unexpected requests: $(cat "$curl_log")"
    if [[ $release_case == metadata-success ]]; then
      [[ $(grep -Fc -- " $metadata_latest_url" "$curl_log") -eq 2 ]] ||
        fail "$interpreter_name $release_case must probe and download the archive from metadata"
    else
      grep -Fq -- " $archive_url" "$curl_log" ||
        fail "$interpreter_name $release_case must download the archive selected by the API"
    fi
    printf '%s %s: metadata=%d curl=%d HEAD=%d API=%d\n' \
      "$interpreter_name" "$release_case" "$metadata_calls" "$curl_calls" "$head_calls" "$api_calls"
  done <<'EOF'
metadata-success 1 1 0
metadata-404 1 0 1
metadata-beta 1 0 1
metadata-multiline 1 0 1
metadata-html 1 0 1
head-404 1 1 1
EOF

  reset_case
  official_env
  CASE_CHECKSUM_MODE=valid
  run_installer "$case_root/official-valid-home" "$case_root/official-valid-install" "$case_root/official-valid-bin" "$stable_tag" >/dev/null 2>&1 ||
    fail "$interpreter_name official source with a valid checksum must install"
  [[ -x "$case_root/official-valid-install/composio" ]] || fail "$interpreter_name official-source valid checksum install"

  reset_case
  official_env
  CASE_CHECKSUM_MODE=missing
  if official_missing_output=$(run_installer "$case_root/official-missing-home" "$case_root/official-missing-install" "$case_root/official-missing-bin" "$stable_tag" 2>&1); then
    fail "$interpreter_name official source with a missing checksums.txt must fail"
  fi
  assert_contains "$official_missing_output" 'Failed to download checksums.txt' "$interpreter_name official missing manifest error"
  [[ ! -e "$case_root/official-missing-install/composio" ]] || fail "$interpreter_name official missing manifest must not install"

  reset_case
  official_env
  CASE_CHECKSUM_MODE=absent-entry
  if official_entry_output=$(run_installer "$case_root/official-entry-home" "$case_root/official-entry-install" "$case_root/official-entry-bin" "$stable_tag" 2>&1); then
    fail "$interpreter_name official source with no checksum entry must fail"
  fi
  assert_contains "$official_entry_output" 'checksums.txt has no entry for' "$interpreter_name official absent entry error"
  [[ ! -e "$case_root/official-entry-install/composio" ]] || fail "$interpreter_name official absent entry must not install"

  reset_case
  CASE_UNSET_PLUGINS=1
  run_installer "$case_root/default-plugins-home" "$case_root/default-plugins-install" "$case_root/default-plugins-bin" "$stable_tag" >/dev/null 2>&1
  grep -Eq '\|installer\|[^|]*\|setup --target auto --yes --if-present$' "$composio_log" || fail "$interpreter_name plugin setup enabled by default"

  for plugin_mode in env-zero flag flag-overrides-env; do
    reset_case
    plugin_args=("$stable_tag")
    case "$plugin_mode" in
      env-zero) CASE_PLUGINS=0 ;;
      flag) CASE_UNSET_PLUGINS=1; plugin_args=(--no-plugins "$stable_tag") ;;
      flag-overrides-env) CASE_PLUGINS=1; plugin_args=(--no-plugins "$stable_tag") ;;
    esac
    run_installer "$case_root/$plugin_mode-home" "$case_root/$plugin_mode-install" "$case_root/$plugin_mode-bin" "${plugin_args[@]}" >/dev/null 2>&1
    if grep -q 'setup --target' "$composio_log"; then
      fail "$interpreter_name plugin opt-out $plugin_mode"
    fi
  done

  reset_case
  CASE_UNSET_PLUGINS=1
  CASE_SETUP_EXIT=1
  if plugin_failure_output=$(run_installer "$case_root/plugin-failure-home" "$case_root/plugin-failure-install" "$case_root/plugin-failure-bin" "$stable_tag" 2>&1); then
    fail "$interpreter_name plugin setup failure must fail installation"
  fi
  [[ -x "$case_root/plugin-failure-install/composio" ]] || fail "$interpreter_name plugin failure preserves CLI binary"
  assert_contains "$plugin_failure_output" 'agent plugin setup failed' "$interpreter_name plugin failure reported"
  assert_contains "$plugin_failure_output" 'composio setup --target auto --yes' "$interpreter_name plugin recovery command"

  reset_case
  CASE_PLUGINS=1
  run_installer "$case_root/plugins-home" "$case_root/plugins-install" "$case_root/plugins-bin" "$stable_tag" >/dev/null 2>&1
  grep -Eq '\|installer\|[^|]*\|setup --target auto --yes --if-present$' "$composio_log" || fail "$interpreter_name plugin opt-in"

  reset_case
  CASE_QUIET=1
  quiet_output=$(run_installer "$case_root/quiet-home" "$case_root/quiet-install" "$case_root/quiet-bin" "$stable_tag" 2>&1)
  assert_not_contains "$quiet_output" 'Installing Composio CLI' "$interpreter_name quiet output"
  assert_not_contains "$quiet_output" 'composio login' "$interpreter_name quiet suppresses the normal-success final block"
  assert_not_contains "$quiet_output" 'composio is ready' "$interpreter_name quiet suppresses the normal-success final block"
  assert_not_contains "$quiet_output" 'Open a new terminal' "$interpreter_name quiet suppresses the normal-success final block"

  reset_case
  CASE_DEBUG=1
  debug_output=$(run_installer "$case_root/debug-home" "$case_root/debug-install" "$case_root/debug-bin" "$stable_tag" 2>&1)
  assert_contains "$debug_output" '+ curl GET' "$interpreter_name debug traces"

  reset_case
  CASE_HELP=0
  help_suppressed=$(run_installer "$case_root/help-home" "$case_root/help-install" "$case_root/help-bin" "$stable_tag" 2>&1)
  assert_contains "$help_suppressed" "$(configured_line bash)" "$interpreter_name help suppression keeps setup status"
  assert_not_contains "$help_suppressed" 'composio login' "$interpreter_name help suppression removes the final block"
  assert_not_contains "$help_suppressed" 'Open a new terminal' "$interpreter_name help suppression removes the final block"

  reset_case
  CASE_UNSET_SHELL=1
  unset_shell_install="$case_root/unset-shell-install"
  unset_shell_output=$(run_installer "$case_root/unset-shell-home" "$unset_shell_install" "$case_root/unset-shell-bin" "$stable_tag" 2>&1) ||
    fail "$interpreter_name unset SHELL must not fail after installation"
  if grep -Fq 'install --shell' "$composio_log"; then
    fail "$interpreter_name unset SHELL must not run shell setup"
  fi
  assert_tail "$unset_shell_output" "$(recovery_tail now "$unset_shell_install/composio")" "$interpreter_name unset SHELL install-only tail"

  # Runs the given command in the background, SIGTERMs it once the delayed
  # download is reached, and asserts the process exits with 128+15.
  assert_sigterm_143() {
    local label=$1
    local output_file=$2
    shift 2
    "$@" >"$output_file" 2>&1 &
    local signal_job=$!
    wait_for_file "$case_root/curl-parent.pid" "$interpreter_name $label did not reach delayed download"
    local signal_pid
    signal_pid=$(<"$case_root/curl-parent.pid")
    kill -TERM "$signal_pid"
    local signal_status=0
    if wait "$signal_job"; then
      fail "$interpreter_name $label must terminate after SIGTERM"
    else
      signal_status=$?
    fi
    [[ $signal_status -eq 143 ]] || fail "$interpreter_name $label SIGTERM status (got $signal_status)"
  }

  reset_case
  CASE_CURL_DELAY_URL="$github_url/FakeOwner/fake-repo/releases/download/$stable_tag/$archive_name"
  assert_sigterm_143 'installer' "$case_root/signal-installer.log" \
    run_installer "$case_root/signal-home" "$case_root/signal-install" "$case_root/signal-bin" "$stable_tag"

  reset_case
  CASE_CURL_DELAY_URL=$script_url
  assert_sigterm_143 'shell variant' "$case_root/signal-variant.log" \
    run_variant zsh "$case_root/signal-variant-home" "$case_root/signal-variant-install" "$case_root/signal-variant-bin" "$stable_tag"

  reset_case
  CASE_GITHUB_URL='http://127.0.0.1:8929'
  CASE_API_BASE='http://127.0.0.1:8929/api'
  run_installer "$case_root/loopback-home" "$case_root/loopback-install" "$case_root/loopback-bin" "$stable_tag" >/dev/null 2>&1
  grep -Fq -- '--proto =http,https --proto-redir =https' "$curl_log" || fail "$interpreter_name loopback protocol flags"

  for unsafe_url in 'http://evil.example' 'http://user@127.0.0.1:8929' 'http://127.0.0.1.evil.example'; do
    reset_case
    CASE_GITHUB_URL=$unsafe_url
    if run_installer "$case_root/unsafe-home-${RANDOM}" "$case_root/unsafe-install-${RANDOM}" "$case_root/unsafe-bin-${RANDOM}" "$stable_tag" >/dev/null 2>&1; then
      fail "$interpreter_name unsafe configured URL accepted: $unsafe_url"
    fi
    [[ ! -s "$curl_log" ]] || fail "$interpreter_name unsafe configured URL reached curl"
  done

  reset_case
  CASE_GITHUB_URL='http://host.docker.internal:8080'
  CASE_API_BASE='http://host.docker.internal:8080/api'
  if run_installer "$case_root/docker-denied-home" "$case_root/docker-denied-install" "$case_root/docker-denied-bin" "$stable_tag" >/dev/null 2>&1; then
    fail "$interpreter_name host.docker.internal must require opt-in"
  fi
  CASE_ALLOW_HTTP_HOST=host.docker.internal
  run_installer "$case_root/docker-home" "$case_root/docker-install" "$case_root/docker-bin" "$stable_tag" >/dev/null 2>&1

  reset_case
  CASE_API_ASSET_URL="http://evil.example/$archive_name"
  if api_unsafe_output=$(run_installer "$case_root/api-unsafe-home" "$case_root/api-unsafe-install" "$case_root/api-unsafe-bin" 2>&1); then
    fail "$interpreter_name unsafe API asset URL accepted"
  fi
  assert_contains "$api_unsafe_output" 'unsafe archive URL' "$interpreter_name unsafe API URL"

  reset_case
  CASE_REDIRECT_DOWNGRADE=1
  if run_installer "$case_root/downgrade-home" "$case_root/downgrade-install" "$case_root/downgrade-bin" "$stable_tag" >/dev/null 2>&1; then
    fail "$interpreter_name redirect downgrade simulation must fail"
  fi
  [[ ! -e "$case_root/downgrade-bin/composio" ]] || fail "$interpreter_name failed download must not install"

  for shell_name in zsh bash fish; do
    reset_case
    variant_home="$case_root/variant-$shell_name-home"
    variant_install="$case_root/variant-$shell_name-install"
    variant_bin="$case_root/variant-$shell_name-bin"
    variant_output=$(run_variant "$shell_name" "$variant_home" "$variant_install" "$variant_bin" "$stable_tag" --no-plugins 2>&1)
    expected_variant_bin=$(cd "$variant_bin" && pwd -P)
    grep -Fq "|installer|$expected_variant_bin|install --shell $shell_name" "$composio_log" ||
      fail "$interpreter_name $shell_name variant delegation"
    assert_contains "$variant_output" "$(configured_line "$shell_name")" "$interpreter_name $shell_name variant confirmation"
    assert_not_contains "$variant_output" 'Required next step' "$interpreter_name $shell_name variant must not print setup guidance"
    assert_not_contains "$variant_output" 'Optional shell setup' "$interpreter_name $shell_name variant must not print setup guidance"
  done

  reset_case
  CASE_INSTALL_SHELL=zsh
  direct_home="$case_root/direct-shell-home"
  direct_bin="$case_root/direct-shell-bin"
  direct_output=$(run_installer "$direct_home" "$case_root/direct-shell-install" "$direct_bin" "$stable_tag" 2>&1)
  expected_direct_bin=$(cd "$direct_bin" && pwd -P)
  grep -Fq "|installer|$expected_direct_bin|install --shell zsh" "$composio_log" || fail "$interpreter_name COMPOSIO_INSTALL_SHELL delegation"
  assert_contains "$direct_output" "$(configured_line zsh)" "$interpreter_name COMPOSIO_INSTALL_SHELL confirmation"
  assert_not_contains "$direct_output" 'Required next step' "$interpreter_name COMPOSIO_INSTALL_SHELL must not print setup guidance"
  assert_tail "$direct_output" "$case_b_tail" "$interpreter_name COMPOSIO_INSTALL_SHELL Case B tail"
  grep -Fq "export PATH=\"$direct_bin:\$PATH\"" "$direct_home/.zshrc" || fail "$interpreter_name COMPOSIO_INSTALL_SHELL CLI-written block"
  assert_not_contains "$direct_output" 'Updated ~/.zshrc' "$interpreter_name COMPOSIO_INSTALL_SHELL CLI path must not rewrite rc files inline"

  reset_case
  CASE_INSTALL_SHELL=zsh
  relative_work="$case_root/relative-shell-work"
  relative_home="$case_root/relative-shell-home"
  relative_install="$case_root/relative-shell-install"
  mkdir -p "$relative_work"
  (cd "$relative_work" && run_installer "$relative_home" "$relative_install" relative-bin "$stable_tag" >/dev/null 2>&1)
  expected_relative_bin=$(cd "$relative_work/relative-bin" && pwd -P)
  grep -Fq "|installer|$expected_relative_bin|install --shell zsh" "$composio_log" ||
    fail "$interpreter_name relative COMPOSIO_BIN_DIR delegation must receive the resolved absolute path"

  reset_case
  CASE_INSTALL_SHELL=zsh
  CASE_SHELL_CAPABILITY=unsupported
  direct_unsupported_home="$case_root/direct-unsupported-home"
  direct_unsupported_install="$case_root/direct-unsupported-install"
  direct_unsupported_output=$(run_installer "$direct_unsupported_home" "$direct_unsupported_install" "$case_root/direct-unsupported-bin" "$stable_tag" 2>&1) ||
    fail "$interpreter_name unsupported CLI --shell must keep the install successful"
  [[ -x "$direct_unsupported_install/composio" ]] || fail "$interpreter_name unsupported CLI must retain the binary"
  [[ ! -e "$direct_unsupported_home/.zshrc" ]] || fail "$interpreter_name unsupported CLI must not edit rc files inline"
  assert_contains "$direct_unsupported_output" 'warning: Automatic PATH setup for zsh failed' "$interpreter_name unsupported CLI warning"
  assert_tail "$direct_unsupported_output" "$(recovery_tail later "$direct_unsupported_install/composio")" "$interpreter_name unsupported CLI recovery tail"

  reset_case
  CASE_INSTALL_SHELL=fish
  CASE_INSTALL_EXIT=23
  direct_failed_home="$case_root/direct-failed-home"
  direct_failed_install="$case_root/direct-failed-install"
  direct_failed_output=$(run_installer "$direct_failed_home" "$direct_failed_install" "$case_root/direct-failed-bin" "$stable_tag" 2>&1) ||
    fail "$interpreter_name failed delegation must keep the install successful"
  [[ -x "$direct_failed_install/composio" ]] || fail "$interpreter_name failed delegation must retain the binary"
  assert_contains "$direct_failed_output" 'warning: Automatic PATH setup for fish failed' "$interpreter_name failed delegation warning"
  assert_tail "$direct_failed_output" "$(recovery_tail later "$direct_failed_install/composio")" "$interpreter_name failed delegation recovery tail"

  reset_case
  CASE_INSTALL_SHELL=tcsh
  if invalid_shell_output=$(run_installer "$case_root/invalid-shell-home" "$case_root/invalid-shell-install" "$case_root/invalid-shell-bin" 2>&1); then
    fail "$interpreter_name invalid COMPOSIO_INSTALL_SHELL must fail"
  fi
  assert_contains "$invalid_shell_output" 'COMPOSIO_INSTALL_SHELL must be auto, zsh, bash, fish, or none' "$interpreter_name invalid COMPOSIO_INSTALL_SHELL message"
  [[ ! -s "$curl_log" ]] || fail "$interpreter_name invalid COMPOSIO_INSTALL_SHELL must fail before network"

  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  unsupported_variant_home="$case_root/unsupported-variant-home"
  unsupported_variant_install="$case_root/unsupported-variant-install"
  unsupported_variant_output=$(run_variant zsh "$unsupported_variant_home" "$unsupported_variant_install" "$case_root/unsupported-variant-bin" "$stable_tag" 2>&1) ||
    fail "$interpreter_name unsupported variant CLI must keep the install successful"
  [[ -x "$unsupported_variant_install/composio" ]] || fail "$interpreter_name unsupported variant must retain the binary"
  [[ ! -e "$unsupported_variant_home/.zshrc" ]] || fail "$interpreter_name unsupported variant must not edit rc files inline"
  assert_contains "$unsupported_variant_output" 'warning: Automatic PATH setup for zsh failed' "$interpreter_name unsupported variant warning"
  assert_tail "$unsupported_variant_output" "$(recovery_tail later "$unsupported_variant_install/composio")" "$interpreter_name unsupported variant recovery tail"

  reset_case
  CASE_INSTALL_EXIT=23
  failed_variant_home="$case_root/failed-variant-home"
  failed_variant_install="$case_root/failed-variant-install"
  failed_variant_output=$(run_variant zsh "$failed_variant_home" "$failed_variant_install" "$case_root/failed-variant-bin" "$stable_tag" 2>&1) ||
    fail "$interpreter_name failed variant delegation must keep the install successful"
  [[ -x "$failed_variant_install/composio" ]] || fail "$interpreter_name failed variant must retain the binary"
  assert_contains "$failed_variant_output" 'warning: Automatic PATH setup for zsh failed' "$interpreter_name failed variant warning"
  assert_tail "$failed_variant_output" "$(recovery_tail later "$failed_variant_install/composio")" "$interpreter_name failed variant recovery tail"

  # Unsafe bin dirs containing double-quote-expanded characters (`$`, `` ` ``,
  # `"`, `\`) or a structural `:` are rejected before delegating to `composio install`.
  injection_marker="$case_root/injection-marker"
  unsafe_case=0
  for unsafe_bin in "inject-\$(touch $injection_marker)" 'inject-`id`' 'inject-"quote"' 'inject\backslash' 'inject:colon'; do
    reset_case
    unsafe_case=$((unsafe_case + 1))
    unsafe_home="$case_root/unsafe-$unsafe_case-variant-home"
    unsafe_install="$case_root/unsafe-$unsafe_case-variant-install"
    unsafe_bin_dir="$case_root/$unsafe_bin"
    unsafe_variant_output=$(run_variant zsh "$unsafe_home" "$unsafe_install" "$unsafe_bin_dir" "$stable_tag" 2>&1) ||
      fail "$interpreter_name unsafe variant bin dir must keep the install successful: $unsafe_bin"
    if grep -Fq 'install --shell' "$composio_log"; then
      fail "$interpreter_name unsafe variant must be rejected before delegation: $unsafe_bin"
    fi
    [[ ! -e "$unsafe_home/.zshrc" ]] || fail "$interpreter_name unsafe variant must not write rc file: $unsafe_bin"
    [[ -x "$unsafe_install/composio" ]] || fail "$interpreter_name unsafe variant must retain the binary: $unsafe_bin"
    assert_contains "$unsafe_variant_output" 'warning:' "$interpreter_name unsafe variant warning: $unsafe_bin"
    assert_contains "$unsafe_variant_output" "$unsafe_bin_dir" "$interpreter_name unsafe variant warning names the rejected path: $unsafe_bin"
    assert_tail "$unsafe_variant_output" "$(recovery_tail later "$unsafe_install/composio")" "$interpreter_name unsafe variant recovery tail: $unsafe_bin"
  done
  [[ ! -e "$injection_marker" ]] || fail "$interpreter_name command substitution in the bin dir must never run"

  # The denylist stops at what double quotes actually expand: characters that
  # are literal there stay legal and are delegated to `composio install --shell`.
  reset_case
  literal_home="$case_root/literal-variant-home"
  literal_bin="$case_root/o'brien;bin"
  run_variant zsh "$literal_home" "$case_root/literal-variant-install" "$literal_bin" "$stable_tag" >/dev/null 2>&1
  expected_literal_bin=$(cd "$literal_bin" && pwd -P)
  grep -Fq "|installer|$expected_literal_bin|install --shell zsh" "$composio_log" ||
    fail "$interpreter_name apostrophe bin dir must be delegated cleanly"

  for base_mode in fail empty; do
    reset_case
    CASE_BASE_MODE=$base_mode
    base_failure_home="$case_root/base-$base_mode-home"
    if run_variant zsh "$base_failure_home" "$case_root/base-$base_mode-install" "$case_root/base-$base_mode-bin" "$stable_tag" >/dev/null 2>&1; then
      fail "$interpreter_name $base_mode base installer download must fail"
    fi
    [[ ! -e "$base_failure_home/.zshrc" ]] || fail "$interpreter_name $base_mode download must not write rc"
  done

  # --- Auto shell setup default: $SHELL picks the shell, setup delegates to the CLI ---

  # Every recognized default-flow shell delegates through the setup chain.
  for auto_shell in zsh bash fish; do
    reset_case
    CASE_SHELL_VALUE="/bin/$auto_shell"
    auto_home="$case_root/auto-$auto_shell-home"
    auto_install="$case_root/auto-$auto_shell-install"
    auto_bin="$case_root/auto-$auto_shell-bin"
    auto_output=$(run_installer "$auto_home" "$auto_install" "$auto_bin" "$stable_tag" 2>&1)
    grep -Fq "|installer|$auto_bin|install --shell $auto_shell" "$composio_log" ||
      fail "$interpreter_name auto $auto_shell delegation"
    assert_contains "$auto_output" "$(configured_line "$auto_shell")" "$interpreter_name auto $auto_shell confirmation"
    assert_tail "$auto_output" "$case_b_tail" "$interpreter_name auto $auto_shell Case B tail"
  done

  # Repeated default-flow installs keep taking the idempotent setup chain.
  reset_case
  idempotent_home="$case_root/idempotent-home"
  idempotent_install="$case_root/idempotent-install"
  idempotent_bin="$case_root/idempotent-bin"
  run_installer "$idempotent_home" "$idempotent_install" "$idempotent_bin" "$stable_tag" >/dev/null 2>&1
  run_installer "$idempotent_home" "$idempotent_install" "$idempotent_bin" "$stable_tag" >/dev/null 2>&1
  [[ $(grep -c 'install --shell bash' "$composio_log") -eq 2 ]] ||
    fail "$interpreter_name repeated auto installs must re-run idempotent setup"

  # COMPOSIO_INSTALL_SHELL=none preserves install-only behavior.
  reset_case
  CASE_INSTALL_SHELL=none
  none_home="$case_root/none-home"
  none_install="$case_root/none-install"
  none_output=$(run_installer "$none_home" "$none_install" "$case_root/none-bin" "$stable_tag" 2>&1)
  if grep -Fq 'install --shell' "$composio_log"; then
    fail "$interpreter_name none must not run shell setup"
  fi
  [[ ! -e "$none_home/.bashrc" && ! -e "$none_home/.bash_profile" ]] || fail "$interpreter_name none must not write rc files"
  assert_contains "$none_output" 'COMPOSIO_INSTALL_SHELL=none' "$interpreter_name none skip disclosure"
  assert_tail "$none_output" "$(recovery_tail now "$none_install/composio")" "$interpreter_name none install-only tail"

  # none + already-resolving installed command uses the bare Case A ending.
  reset_case
  CASE_INSTALL_SHELL=none
  none_ready_bin="$case_root/none-ready-bin"
  CASE_PATH_PREFIX="$none_ready_bin:"
  none_ready_output=$(run_installer "$case_root/none-ready-home" "$case_root/none-ready-install" "$none_ready_bin" "$stable_tag" 2>&1)
  assert_tail "$none_ready_output" "$case_a_tail" "$interpreter_name none Case A tail"

  # Case A: recognized shell, setup succeeds, and the inherited PATH already
  # resolves the installed entry point. Setup still runs (idempotent).
  reset_case
  ready_bin="$case_root/ready-bin"
  CASE_PATH_PREFIX="$ready_bin:"
  ready_output=$(run_installer "$case_root/ready-home" "$case_root/ready-install" "$ready_bin" "$stable_tag" 2>&1)
  grep -Fq 'install --shell bash' "$composio_log" || fail "$interpreter_name Case A still runs idempotent setup"
  assert_tail "$ready_output" "$case_a_tail" "$interpreter_name Case A tail"

  # Explicit shell + resolving command also ends in Case A.
  reset_case
  CASE_INSTALL_SHELL=zsh
  explicit_ready_bin="$case_root/explicit-ready-bin"
  CASE_PATH_PREFIX="$explicit_ready_bin:"
  explicit_ready_output=$(run_installer "$case_root/explicit-ready-home" "$case_root/explicit-ready-install" "$explicit_ready_bin" "$stable_tag" 2>&1)
  assert_tail "$explicit_ready_output" "$case_a_tail" "$interpreter_name explicit shell Case A tail"

  # Physical-path identity: a pre-existing symlink on PATH that resolves to the
  # installed executable still counts as Case A.
  reset_case
  alias_dir="$case_root/alias-dir"
  alias_install="$case_root/alias-install"
  mkdir -p "$alias_dir" "$alias_install"
  ln -sf "$alias_install/composio" "$alias_dir/composio"
  CASE_PATH_PREFIX="$alias_dir:"
  alias_output=$(run_installer "$case_root/alias-home" "$alias_install" "$case_root/alias-bin" "$stable_tag" 2>&1)
  assert_tail "$alias_output" "$case_a_tail" "$interpreter_name symlink-alias Case A tail"

  # Unknown $SHELL degrades to install-only guidance plus the trusted absolute command.
  reset_case
  CASE_SHELL_VALUE=/bin/tcsh
  unknown_home="$case_root/unknown-shell-home"
  unknown_install="$case_root/unknown-shell-install"
  unknown_output=$(run_installer "$unknown_home" "$unknown_install" "$case_root/unknown-shell-bin" "$stable_tag" 2>&1)
  if grep -Fq 'install --shell' "$composio_log"; then
    fail "$interpreter_name unknown shell must not run shell setup"
  fi
  [[ ! -e "$unknown_home/.bashrc" ]] || fail "$interpreter_name unknown shell must not write rc files"
  assert_tail "$unknown_output" "$(recovery_tail now "$unknown_install/composio")" "$interpreter_name unknown shell install-only tail"

  # Shadowing: bin dir on the inherited PATH, but another composio resolves
  # first. The ending must never run the shadowed bare command.
  reset_case
  shadow_dir="$case_root/shadow-dir"
  mkdir -p "$shadow_dir"
  printf '#!/bin/sh\nexit 0\n' >"$shadow_dir/composio"
  chmod +x "$shadow_dir/composio"
  shadow_bin="$case_root/shadow-bin"
  shadow_install="$case_root/shadow-install"
  CASE_PATH_PREFIX="$shadow_dir:$shadow_bin:"
  shadow_output=$(run_installer "$case_root/shadow-home" "$shadow_install" "$shadow_bin" "$stable_tag" 2>&1)
  assert_contains "$shadow_output" "$shadow_dir/composio" "$interpreter_name shadow ending names the shadowing command"
  assert_tail "$shadow_output" $'To use the newly installed CLI, run:\n\n  '"$shadow_install/composio login" "$interpreter_name shadow tail avoids the shadowed bare command"

  # Delegated CLI presentation: a relative COMPOSIO_BIN_DIR must reach setup as
  # a resolved absolute path, and the delegated command's own boxed restart hint
  # must stay suppressed so the installer's plain final block is the only ending.
  reset_case
  CASE_INSTALL_HINT=1
  oldcli_home="$case_root/oldcli-home"
  oldcli_work="$case_root/oldcli-work"
  oldcli_install="$case_root/oldcli-install"
  mkdir -p "$oldcli_work"
  oldcli_output=$(cd "$oldcli_work" && run_installer "$oldcli_home" "$oldcli_install" "rel-bin" "$stable_tag" 2>&1)
  grep -Fq "|installer|$oldcli_work/rel-bin|install --shell bash" "$composio_log" ||
    fail "$interpreter_name delegated setup must receive the resolved absolute bin dir"
  assert_contains "$oldcli_output" "$(configured_line bash)" "$interpreter_name delegated setup disclosure"
  assert_not_contains "$oldcli_output" '│ Restart your shell so composio is on PATH │' "$interpreter_name delegated CLI output must not leak"
  assert_tail "$oldcli_output" "$case_b_tail" "$interpreter_name delegated hint superseded by the installer tail"

  # The suppressed delegated output stays available for troubleshooting.
  reset_case
  CASE_INSTALL_HINT=1
  CASE_DEBUG=1
  delegated_debug_output=$(run_installer "$case_root/delegated-debug-home" "$case_root/delegated-debug-install" "$case_root/delegated-debug-bin" "$stable_tag" 2>&1)
  assert_contains "$delegated_debug_output" 'delegated shell setup exited 0' "$interpreter_name debug reports the delegated exit status"
  assert_contains "$delegated_debug_output" '│ Restart your shell so composio is on PATH │' "$interpreter_name debug replays the captured delegated output"

  # --- Setup failures stay non-fatal: the binary stays installed and the ending stays truthful ---

  # Delegated CLI --shell fails: warning and recovery tail reach the user even
  # when COMPOSIO_QUIET=1 and COMPOSIO_INSTALL_HELP=0 suppress optional output.
  reset_case
  CASE_INSTALL_EXIT=23
  CASE_QUIET=1
  CASE_HELP=0
  wf_delegated_home="$case_root/write-failure-delegated-home"
  wf_delegated_install="$case_root/write-failure-delegated-install"
  wf_delegated_output=$(run_installer "$wf_delegated_home" "$wf_delegated_install" "$case_root/write-failure-delegated-bin" "$stable_tag" 2>&1) ||
    fail "$interpreter_name delegated setup failure must keep the install successful"
  [[ -x "$wf_delegated_install/composio" ]] || fail "$interpreter_name delegated setup failure must retain the binary"
  assert_contains "$wf_delegated_output" 'warning: Automatic PATH setup for bash failed' "$interpreter_name delegated setup failure warning"
  assert_tail "$wf_delegated_output" "$(recovery_tail later "$wf_delegated_install/composio")" "$interpreter_name delegated setup failure recovery tail"

  # --- Unsafe resolved bin dirs under the default flow: shell metacharacters never reach rc files ---

  # Only characters double quotes still expand are rejected: `;` is literal
  # inside them and stays legal, so it is deliberately not probed here.
  unsafe_auto_index=0
  for unsafe_character in '$' '`'; do
    unsafe_auto_index=$((unsafe_auto_index + 1))
    reset_case
    unsafe_auto_home="$case_root/unsafe-auto-$unsafe_auto_index-home"
    unsafe_auto_install="$case_root/unsafe-auto-$unsafe_auto_index-install"
    unsafe_auto_bin="$case_root/unsafe-auto${unsafe_character}$unsafe_auto_index-bin"
    unsafe_auto_output=$(run_installer "$unsafe_auto_home" "$unsafe_auto_install" "$unsafe_auto_bin" "$stable_tag" 2>&1) ||
      fail "$interpreter_name unsafe auto bin dir with $unsafe_character must keep the install successful"
    if grep -Fq 'install --shell' "$composio_log"; then
      fail "$interpreter_name unsafe auto bin dir must be rejected before delegation"
    fi
    [[ ! -e "$unsafe_auto_home/.bashrc" && ! -e "$unsafe_auto_home/.bash_profile" ]] ||
      fail "$interpreter_name unsafe auto bin dir must not write startup files"
    [[ -x "$unsafe_auto_install/composio" ]] || fail "$interpreter_name unsafe auto bin dir must retain the binary"
    assert_contains "$unsafe_auto_output" "$unsafe_auto_bin" "$interpreter_name unsafe auto warning names the rejected path"
    assert_tail "$unsafe_auto_output" "$(recovery_tail later "$unsafe_auto_install/composio")" "$interpreter_name unsafe auto recovery tail"
  done

  # A valid absolute install dir containing spaces stays copy-paste safe in
  # recovery output: the printed command executes the installed binary as-is.
  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  space_home="$case_root/space-home"
  space_install="$case_root/space install/dir"
  mkdir -p "$space_home/.bashrc"
  space_output=$(run_installer "$space_home" "$space_install" "$case_root/space-bin" "$stable_tag" 2>&1) ||
    fail "$interpreter_name spaced install dir setup failure must keep the install successful"
  assert_tail "$space_output" "$(recovery_tail later "'$space_install/composio'")" "$interpreter_name spaced recovery tail"
  space_recovery_line=$(printf '%s\n' "$space_output" | tail -n 1)
  space_recovery_command=${space_recovery_line#  }
  space_recovery_command=${space_recovery_command% login}
  space_paste_output=$(env TEST_COMPOSIO_LOG="$composio_log" "$interpreter" -c "$space_recovery_command --version") ||
    fail "$interpreter_name spaced recovery command must execute when pasted"
  [[ $space_paste_output == 'composio fake 98.0.0' ]] || fail "$interpreter_name spaced recovery command output"

  # --- Final-block contract combinations: exactly one truthful ending, always last ---

  # Plugin output completes before the final block.
  reset_case
  CASE_PLUGINS=1
  plugin_order_output=$(run_installer "$case_root/plugin-order-home" "$case_root/plugin-order-install" "$case_root/plugin-order-bin" "$stable_tag" 2>&1)
  assert_contains "$plugin_order_output" 'Installing plugins for detected agent hosts...' "$interpreter_name plugin status printed"
  assert_tail "$plugin_order_output" "$case_b_tail" "$interpreter_name plugin output precedes the final block"

  # --agent, setup succeeds, command not yet resolvable: completed state plus
  # only the new-terminal notice; never a second login command.
  reset_case
  agent_home="$case_root/agent-home"
  agent_output=$(run_installer "$agent_home" "$case_root/agent-install" "$case_root/agent-bin" "$stable_tag" --agent 2>&1)
  grep -Fq 'login --agent --no-skill-install' "$composio_log" || fail "$interpreter_name agent login invocation"
  assert_not_contains "$agent_output" 'composio login' "$interpreter_name agent flow must not print a generic login command"
  assert_tail "$agent_output" $'Composio agent login complete.\nOpen a new terminal to use the composio command.' "$interpreter_name agent Case B tail"

  # --agent with the installed command already resolvable: completed state only.
  reset_case
  agent_ready_bin="$case_root/agent-ready-bin"
  CASE_PATH_PREFIX="$agent_ready_bin:"
  agent_ready_output=$(run_installer "$case_root/agent-ready-home" "$case_root/agent-ready-install" "$agent_ready_bin" "$stable_tag" --agent 2>&1)
  assert_not_contains "$agent_ready_output" 'Open a new terminal' "$interpreter_name agent ready flow needs no terminal notice"
  assert_tail "$agent_ready_output" 'Composio agent login complete.' "$interpreter_name agent Case A tail"

  # --agent with setup failure: completed state plus warning and trusted
  # installed-path guidance; still no generic login command.
  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  agent_fail_home="$case_root/agent-fail-home"
  agent_fail_install="$case_root/agent-fail-install"
  mkdir -p "$agent_fail_home/.bashrc"
  agent_fail_output=$(run_installer "$agent_fail_home" "$agent_fail_install" "$case_root/agent-fail-bin" "$stable_tag" --agent 2>&1) ||
    fail "$interpreter_name agent setup failure must keep the install successful"
  assert_contains "$agent_fail_output" 'Composio agent login complete.' "$interpreter_name agent completion survives setup failure"
  assert_contains "$agent_fail_output" 'warning: Automatic PATH setup for bash failed' "$interpreter_name agent setup failure warning"
  assert_not_contains "$agent_fail_output" 'composio login' "$interpreter_name agent setup failure must not print a login command"
  assert_tail "$agent_fail_output" $'Run composio from its installed location:\n\n  '"$agent_fail_install/composio --help" "$interpreter_name agent setup failure recovery tail"

  # --agent with setup skipped (none): completed state plus installed-path guidance.
  reset_case
  CASE_INSTALL_SHELL=none
  agent_none_install="$case_root/agent-none-install"
  agent_none_output=$(run_installer "$case_root/agent-none-home" "$agent_none_install" "$case_root/agent-none-bin" "$stable_tag" --agent 2>&1)
  assert_not_contains "$agent_none_output" 'composio login' "$interpreter_name agent none flow must not print a login command"
  assert_tail "$agent_none_output" $'Composio agent login complete.\nRun composio from its installed location:\n\n  '"$agent_none_install/composio --help" "$interpreter_name agent none tail"

  printf 'install scripts passed under %s\n' "$interpreter_name"
done

printf 'install.sh release resolution, layout, security, and shell-variant tests passed\n'
