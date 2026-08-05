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

# Concurrent installer runs must not share one rc rewrite tmp file, so the
# tmp suffix embeds the process id.
grep -Fq '.composio.tmp.$$' "$repo_root/install.sh" ||
  fail 'install.sh rc rewrites must use a per-process tmp suffix'

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
  assert_contains "$windows_output" 'Windows is not supported. Use WSL' 'Windows guidance'
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

# TS/sh managed-block contract conformance: the fixtures under
# test/managed-block-fixtures also drive the CLI's reconciler
# (ts/packages/cli/test/src/install-managed-block-conformance.test.ts), so an
# edit to either implementation fails one of the two suites until the other
# side produces byte-identical output again.
conformance_fixtures="$repo_root/test/managed-block-fixtures"
conformance_functions="$suite_tmp/install-sh-functions.sh"
# The entry-point guard above pins install.sh to end with exactly one
# `main "$@"` line, so dropping the final line leaves only definitions.
sed '$d' "$repo_root/install.sh" >"$conformance_functions"
conformance_driver="$suite_tmp/conformance-driver.sh"
cat >"$conformance_driver" <<'EOF'
#!/bin/sh
set -eu
functions_file=$1
rc_file=$2
shell_name=$3
bin_dir=$4
. "$functions_file"
rendered=$(render_bin_dir "$bin_dir")
write_path_block "$rc_file" "$shell_name" "$rendered"
EOF
[[ -d $conformance_fixtures ]] || fail 'managed-block fixtures directory is missing'
for interpreter in "${interpreters[@]}"; do
  interpreter_name=$(basename "$interpreter")
  for fixture_dir in "$conformance_fixtures"/*/; do
    fixture_name=$(basename "$fixture_dir")
    fixture_home="$suite_tmp/conformance-$interpreter_name/$fixture_name"
    mkdir -p "$fixture_home"
    cp "$fixture_dir/before" "$fixture_home/rcfile"
    fixture_bin_dir=$(sed "s|__HOME__|$fixture_home|" "$fixture_dir/bin-dir")
    fixture_shell=$(<"$fixture_dir/shell")
    env HOME="$fixture_home" COMPOSIO_QUIET=1 \
      "$interpreter" "$conformance_driver" "$conformance_functions" \
      "$fixture_home/rcfile" "$fixture_shell" "$fixture_bin_dir" ||
      fail "$interpreter_name managed-block conformance: $fixture_name (driver failed)"
    cmp -s "$fixture_dir/after" "$fixture_home/rcfile" || {
      diff -u "$fixture_dir/after" "$fixture_home/rcfile" >&2 || :
      fail "$interpreter_name managed-block conformance: $fixture_name (output drifted)"
    }
  done
done

for interpreter in "${interpreters[@]}"; do
  interpreter_name=$(basename "$interpreter")
  case_root="$suite_tmp/$interpreter_name"
  fake_bin="$case_root/bin"
  curl_log="$case_root/curl.log"
  composio_log="$case_root/composio.log"
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
while (($# > 0)); do
  case $1 in
  --output|-o)
    output=$2
    shift 2
    ;;
  --proto|--proto-redir)
    shift 2
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
"$TEST_API_BASE/repos/$COMPOSIO_GITHUB_OWNER/$COMPOSIO_GITHUB_REPO/releases?per_page=100&page=1")
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
mkdir -p "$bundle/services" "$bundle/local-tools-binaries"
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
    # Mirror the reconciling CLI: write the managed block to the same startup
    # files the installer verifies. TEST_INSTALL_RECONCILE=0 models stable
    # CLIs that exit 0 without reconciling (they skip marker-bearing files).
    if [ "${TEST_INSTALL_EXIT:-0}" = 0 ] && [ "${TEST_INSTALL_RECONCILE:-1}" = 1 ]; then
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
  export TEST_COMPOSIO_LOG="$composio_log"

  reset_case() {
    unset CASE_GITHUB_URL CASE_GITHUB_OWNER CASE_GITHUB_REPO CASE_API_BASE CASE_INSTALL_VERSION CASE_INSTALL_SHELL CASE_PLUGINS CASE_QUIET CASE_DEBUG CASE_HELP
    unset CASE_ALLOW_HTTP_HOST CASE_CHECKSUM_MODE CASE_API_ASSET_URL CASE_BASE_MODE CASE_REDIRECT_DOWNGRADE
    unset CASE_SHELL_CAPABILITY CASE_INSTALL_EXIT CASE_SETUP_EXIT CASE_VERSION_EXIT CASE_PATH_PREFIX CASE_UNSET_SHELL
    unset CASE_CURL_DELAY_URL CASE_CURL_DELAY_SECONDS CASE_SHELL_VALUE CASE_INSTALL_HINT CASE_INSTALL_RECONCILE
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
      COMPOSIO_INSTALL_PLUGINS="${CASE_PLUGINS:-0}"
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
    env \
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
      TEST_INSTALL_RECONCILE="${CASE_INSTALL_RECONCILE:-1}" \
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
    env \
      PATH="$fake_bin:$ambient_path" \
      SHELL="/bin/$shell_name" \
      "${common_env_args[@]}" \
      COMPOSIO_INSTALL_SCRIPT_URL="$script_url" \
      TEST_BASE_MODE="${CASE_BASE_MODE:-ok}" \
      TEST_INSTALL_RECONCILE="${CASE_INSTALL_RECONCILE:-1}" \
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
  relative_fallback_work="$case_root/relative-fallback-work"
  relative_fallback_home="$case_root/relative-fallback-home"
  relative_fallback_install="$case_root/relative-fallback-install"
  mkdir -p "$relative_fallback_work"
  (cd "$relative_fallback_work" && run_installer "$relative_fallback_home" "$relative_fallback_install" relative-bin "$stable_tag" >/dev/null 2>&1)
  expected_relative_fallback_bin=$(cd "$relative_fallback_work/relative-bin" && pwd -P)
  grep -Fq "export PATH=\"$expected_relative_fallback_bin:\$PATH\"" "$relative_fallback_home/.zshrc" ||
    fail "$interpreter_name relative COMPOSIO_BIN_DIR fallback must persist the resolved absolute path"

  reset_case
  CASE_INSTALL_SHELL=zsh
  CASE_SHELL_CAPABILITY=unsupported
  direct_fallback_home="$case_root/direct-fallback-home"
  direct_fallback_output=$(run_installer "$direct_fallback_home" "$case_root/direct-fallback-install" "$case_root/direct-fallback-bin" "$stable_tag" 2>&1)
  grep -Fqx '# Composio CLI' "$direct_fallback_home/.zshrc" || fail "$interpreter_name COMPOSIO_INSTALL_SHELL unsupported CLI fallback"
  assert_contains "$direct_fallback_output" "$(configured_line zsh)" "$interpreter_name COMPOSIO_INSTALL_SHELL fallback confirmation"

  reset_case
  CASE_INSTALL_SHELL=fish
  CASE_INSTALL_EXIT=23
  direct_failed_home="$case_root/direct-failed-home"
  run_installer "$direct_failed_home" "$case_root/direct-failed-install" "$case_root/direct-failed-bin" "$stable_tag" >/dev/null 2>&1
  grep -Fqx '# Composio CLI' "$direct_failed_home/.config/fish/config.fish" || fail "$interpreter_name COMPOSIO_INSTALL_SHELL failed delegation fallback"

  reset_case
  CASE_INSTALL_SHELL=tcsh
  if invalid_shell_output=$(run_installer "$case_root/invalid-shell-home" "$case_root/invalid-shell-install" "$case_root/invalid-shell-bin" 2>&1); then
    fail "$interpreter_name invalid COMPOSIO_INSTALL_SHELL must fail"
  fi
  assert_contains "$invalid_shell_output" 'COMPOSIO_INSTALL_SHELL must be auto, zsh, bash, fish, or none' "$interpreter_name invalid COMPOSIO_INSTALL_SHELL message"
  [[ ! -s "$curl_log" ]] || fail "$interpreter_name invalid COMPOSIO_INSTALL_SHELL must fail before network"

  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  fallback_home="$case_root/fallback-home"
  run_variant zsh "$fallback_home" "$case_root/fallback-install" "$case_root/fallback-bin" "$stable_tag" >/dev/null 2>&1
  grep -Fqx '# Composio CLI' "$fallback_home/.zshrc" || fail "$interpreter_name unsupported CLI fallback"

  reset_case
  CASE_INSTALL_EXIT=23
  failed_install_home="$case_root/failed-install-home"
  run_variant zsh "$failed_install_home" "$case_root/failed-install-dir" "$case_root/failed-install-bin" "$stable_tag" >/dev/null 2>&1
  grep -Fqx '# Composio CLI' "$failed_install_home/.zshrc" || fail "$interpreter_name failed --shell fallback"

  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  bash_fallback_home="$case_root/bash-fallback-home"
  mkdir -p "$bash_fallback_home"
  : >"$bash_fallback_home/.bash_profile"
  run_variant bash "$bash_fallback_home" "$case_root/bash-fallback-install" "$case_root/bash-fallback-bin" "$stable_tag" >/dev/null 2>&1
  grep -Fqx '# Composio CLI' "$bash_fallback_home/.bashrc" || fail "$interpreter_name bash fallback bashrc"
  grep -Fqx '# Composio CLI' "$bash_fallback_home/.bash_profile" || fail "$interpreter_name bash fallback login override"

  # The inline fallback embeds the resolved bin dir in an rc line, so a dir
  # holding a character double quotes still expand -- `$`, a backtick, `"`, `\`
  # -- or a structural `:` is refused outright, on the same set
  # `composio install` refuses. A dir the CLI rejects must not slip into an rc
  # file just because the CLI could not run.
  injection_marker="$case_root/injection-marker"
  unsafe_case=0
  for unsafe_bin in "inject-\$(touch $injection_marker)" 'inject-`id`' 'inject-"quote"' 'inject\backslash' 'inject:colon'; do
    reset_case
    CASE_SHELL_CAPABILITY=unsupported
    unsafe_case=$((unsafe_case + 1))
    unsafe_home="$case_root/unsafe-$unsafe_case-variant-home"
    unsafe_install="$case_root/unsafe-$unsafe_case-variant-install"
    unsafe_bin_dir="$case_root/$unsafe_bin"
    unsafe_variant_output=$(run_variant zsh "$unsafe_home" "$unsafe_install" "$unsafe_bin_dir" "$stable_tag" 2>&1) ||
      fail "$interpreter_name unsafe variant bin dir must keep the install successful: $unsafe_bin"
    [[ ! -e "$unsafe_home/.zshrc" ]] || fail "$interpreter_name unsafe variant must not write rc file: $unsafe_bin"
    [[ -x "$unsafe_install/composio" ]] || fail "$interpreter_name unsafe variant must retain the binary: $unsafe_bin"
    assert_contains "$unsafe_variant_output" 'warning:' "$interpreter_name unsafe variant warning: $unsafe_bin"
    assert_contains "$unsafe_variant_output" "$unsafe_bin_dir" "$interpreter_name unsafe variant warning names the rejected path: $unsafe_bin"
    assert_tail "$unsafe_variant_output" "$(recovery_tail later "$unsafe_install/composio")" "$interpreter_name unsafe variant recovery tail: $unsafe_bin"
  done
  [[ ! -e "$injection_marker" ]] || fail "$interpreter_name command substitution in the bin dir must never run"

  # The denylist stops at what double quotes actually expand: characters that
  # are literal there stay legal and are written verbatim.
  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  literal_home="$case_root/literal-variant-home"
  literal_bin="$case_root/o'brien;bin"
  run_variant zsh "$literal_home" "$case_root/literal-variant-install" "$literal_bin" "$stable_tag" >/dev/null 2>&1
  expected_literal_bin=$(cd "$literal_bin" && pwd -P)
  grep -Fq "export PATH=\"$expected_literal_bin:\$PATH\"" "$literal_home/.zshrc" ||
    fail "$interpreter_name apostrophe bin dir must be written verbatim"

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

  # Pinned old CLI: supports --shell but ignores the invocation-origin hint,
  # prints its own boxed restart hint, and exits 0 without reconciling. A
  # relative COMPOSIO_BIN_DIR must never reach setup raw; the installer must
  # detect the unreconciled startup file and repair it inline. The delegated
  # command's own presentation never reaches the user: the installer owns its
  # output and its plain final block is the only ending.
  reset_case
  CASE_INSTALL_HINT=1
  CASE_INSTALL_RECONCILE=0
  oldcli_home="$case_root/oldcli-home"
  oldcli_work="$case_root/oldcli-work"
  oldcli_install="$case_root/oldcli-install"
  mkdir -p "$oldcli_work"
  oldcli_output=$(cd "$oldcli_work" && run_installer "$oldcli_home" "$oldcli_install" "rel-bin" "$stable_tag" 2>&1)
  grep -Fq "|installer|$oldcli_work/rel-bin|install --shell bash" "$composio_log" ||
    fail "$interpreter_name old-CLI setup must receive the resolved absolute bin dir"
  grep -Fq "export PATH=\"$oldcli_work/rel-bin:\$PATH\"" "$oldcli_home/.bashrc" ||
    fail "$interpreter_name old-CLI delegation must be reconciled inline with the absolute bin dir"
  assert_contains "$oldcli_output" "$(configured_line bash)" "$interpreter_name old-CLI reconciliation disclosure"
  assert_not_contains "$oldcli_output" '│ Restart your shell so composio is on PATH │' "$interpreter_name delegated CLI output must not leak"
  assert_tail "$oldcli_output" "$case_b_tail" "$interpreter_name old-CLI hint superseded by the installer tail"

  # The suppressed delegated output stays available for troubleshooting.
  reset_case
  CASE_INSTALL_HINT=1
  CASE_DEBUG=1
  delegated_debug_output=$(run_installer "$case_root/delegated-debug-home" "$case_root/delegated-debug-install" "$case_root/delegated-debug-bin" "$stable_tag" 2>&1)
  assert_contains "$delegated_debug_output" 'delegated shell setup exited 0' "$interpreter_name debug reports the delegated exit status"
  assert_contains "$delegated_debug_output" '│ Restart your shell so composio is on PATH │' "$interpreter_name debug replays the captured delegated output"
  assert_contains "$delegated_debug_output" '+ shell setup source: cli' "$interpreter_name debug keeps the setup-source distinction"

  # --- Login-shell reachability for bash (macOS Terminal.app) ---

  # Inline path, virgin home: ~/.bashrc alone is unreachable from a login bash,
  # so the installer must also create a login-mode startup file.
  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  CASE_SHELL_VALUE=/bin/bash
  bash_login_home="$case_root/bash-login-home"
  bash_login_bin="$case_root/bash-login-bin"
  bash_login_output=$(run_installer "$bash_login_home" "$case_root/bash-login-install" "$bash_login_bin" "$stable_tag" 2>&1)
  grep -Fq "export PATH=\"$bash_login_bin:\$PATH\"" "$bash_login_home/.bashrc" ||
    fail "$interpreter_name inline bash setup must configure .bashrc"
  grep -Fq "export PATH=\"$bash_login_bin:\$PATH\"" "$bash_login_home/.bash_profile" ||
    fail "$interpreter_name inline bash setup must configure a login-mode startup file"
  assert_login_bash_path "$bash_login_home" "$bash_login_bin" "$interpreter_name inline bash login shell"
  assert_contains "$bash_login_output" "$(configured_line bash)" "$interpreter_name inline bash names both startup files"
  [[ ! -e "$bash_login_home/.profile" ]] || fail "$interpreter_name inline bash setup must not create ~/.profile"

  # A created ~/.bash_profile shadows an existing ~/.profile, so it must keep
  # sourcing it — and must never rewrite ~/.profile itself.
  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  CASE_SHELL_VALUE=/bin/bash
  bash_profile_home="$case_root/bash-profile-home"
  bash_profile_bin="$case_root/bash-profile-bin"
  mkdir -p "$bash_profile_home"
  printf '%s\n' 'export DISTRO_PROFILE=1' >"$bash_profile_home/.profile"
  run_installer "$bash_profile_home" "$case_root/bash-profile-install" "$bash_profile_bin" "$stable_tag" >/dev/null 2>&1
  grep -Fq '. "$HOME/.profile"' "$bash_profile_home/.bash_profile" ||
    fail "$interpreter_name a created .bash_profile must keep sourcing ~/.profile"
  [[ $(<"$bash_profile_home/.profile") == 'export DISTRO_PROFILE=1' ]] ||
    fail "$interpreter_name ~/.profile must not be modified"
  assert_login_bash_path "$bash_profile_home" "$bash_profile_bin" "$interpreter_name shadowed profile login shell"
  shadowed_profile_value=$(env -i HOME="$bash_profile_home" PATH=/usr/bin:/bin bash -lc 'printf %s "${DISTRO_PROFILE:-}"')
  [[ $shadowed_profile_value == 1 ]] ||
    fail "$interpreter_name a created .bash_profile must not shadow ~/.profile content"

  # An existing ~/.bash_login is the login file bash reads, so it is reused and
  # no ~/.bash_profile is invented in front of it.
  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  CASE_SHELL_VALUE=/bin/bash
  bash_login_only_home="$case_root/bash-login-only-home"
  bash_login_only_bin="$case_root/bash-login-only-bin"
  mkdir -p "$bash_login_only_home"
  printf '%s\n' 'export LOGIN_OVERRIDE=1' >"$bash_login_only_home/.bash_login"
  bash_login_only_output=$(run_installer "$bash_login_only_home" "$case_root/bash-login-only-install" "$bash_login_only_bin" "$stable_tag" 2>&1)
  grep -Fq "export PATH=\"$bash_login_only_bin:\$PATH\"" "$bash_login_only_home/.bash_login" ||
    fail "$interpreter_name existing .bash_login must receive the managed block"
  [[ ! -e "$bash_login_only_home/.bash_profile" ]] ||
    fail "$interpreter_name an existing .bash_login must not be shadowed by a new .bash_profile"
  assert_contains "$bash_login_only_output" 'Configured bash shell setup in ~/.bashrc and ~/.bash_login.' "$interpreter_name .bash_login disclosure"
  assert_login_bash_path "$bash_login_only_home" "$bash_login_only_bin" "$interpreter_name .bash_login login shell"

  # --- Setup write failures stay non-fatal: the binary stays installed and the ending stays truthful ---

  # Delegated path: CLI --shell fails, inline fallback also fails.
  reset_case
  CASE_SHELL_VALUE=/bin/zsh
  CASE_INSTALL_EXIT=23
  wf_delegated_home="$case_root/write-failure-delegated-home"
  wf_delegated_install="$case_root/write-failure-delegated-install"
  mkdir -p "$wf_delegated_home/.zshrc"
  wf_delegated_output=$(run_installer "$wf_delegated_home" "$wf_delegated_install" "$case_root/write-failure-delegated-bin" "$stable_tag" 2>&1) ||
    fail "$interpreter_name delegated setup failure must keep the install successful"
  [[ -x "$wf_delegated_install/composio" ]] || fail "$interpreter_name delegated setup failure must retain the binary"
  assert_contains "$wf_delegated_output" 'warning: Automatic PATH setup for zsh failed' "$interpreter_name delegated setup failure warning"
  assert_contains "$wf_delegated_output" 'COMPOSIO_DEBUG=1' "$interpreter_name delegated setup failure points at the captured output"
  assert_tail "$wf_delegated_output" "$(recovery_tail later "$wf_delegated_install/composio")" "$interpreter_name delegated setup failure recovery tail"

  # Inline path: helper failure inside a conditional must propagate explicitly.
  # COMPOSIO_QUIET=1 and COMPOSIO_INSTALL_HELP=0 are set on purpose: both only
  # gate the normal-success final block, so this one case also proves they are
  # no-ops on the setup-failure path — the warning and the recovery tail reach
  # the user even with all optional output suppressed.
  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  CASE_QUIET=1
  CASE_HELP=0
  wf_inline_home="$case_root/write-failure-inline-home"
  wf_inline_install="$case_root/write-failure-inline-install"
  mkdir -p "$wf_inline_home/.bashrc"
  wf_inline_output=$(run_installer "$wf_inline_home" "$wf_inline_install" "$case_root/write-failure-inline-bin" "$stable_tag" 2>&1) ||
    fail "$interpreter_name inline setup failure must keep the install successful"
  [[ -x "$wf_inline_install/composio" ]] || fail "$interpreter_name inline setup failure must retain the binary"
  assert_contains "$wf_inline_output" 'warning: Automatic PATH setup for bash failed' "$interpreter_name inline setup failure warning"
  assert_tail "$wf_inline_output" "$(recovery_tail later "$wf_inline_install/composio")" "$interpreter_name inline setup failure recovery tail"

  # --- Managed-block reconciliation: a rerun replaces stale blocks instead of stacking duplicates ---

  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  CASE_SHELL_VALUE=/bin/zsh
  reconcile_home="$case_root/reconcile-home"
  reconcile_install="$case_root/reconcile-install"
  reconcile_bin_a="$case_root/reconcile-bin-a"
  reconcile_bin_b="$case_root/reconcile-bin-b"
  mkdir -p "$reconcile_home"
  printf '%s\n' 'alias reconcile-before=1' >"$reconcile_home/.zshrc"
  reconcile_first=$(run_installer "$reconcile_home" "$reconcile_install" "$reconcile_bin_a" "$stable_tag" 2>&1)
  assert_contains "$reconcile_first" 'Updated ~/.zshrc' "$interpreter_name inline setup update disclosure"
  grep -Fq "export PATH=\"$reconcile_bin_a:\$PATH\"" "$reconcile_home/.zshrc" || fail "$interpreter_name first managed block"
  printf '%s\n' 'alias reconcile-after=1' >>"$reconcile_home/.zshrc"
  reconcile_second=$(run_installer "$reconcile_home" "$reconcile_install" "$reconcile_bin_a" "$stable_tag" 2>&1)
  assert_contains "$reconcile_second" 'already' "$interpreter_name inline setup already-current disclosure"
  [[ $(grep -Fc '# Composio CLI' "$reconcile_home/.zshrc") -eq 1 ]] || fail "$interpreter_name idempotent rerun keeps one marker block"
  reconcile_third=$(run_installer "$reconcile_home" "$reconcile_install" "$reconcile_bin_b" "$stable_tag" 2>&1)
  assert_contains "$reconcile_third" 'Updated ~/.zshrc' "$interpreter_name reconcile update disclosure"
  [[ $(grep -Fc '# Composio CLI' "$reconcile_home/.zshrc") -eq 1 ]] || fail "$interpreter_name reconcile keeps exactly one marker block"
  grep -Fq "export PATH=\"$reconcile_bin_b:\$PATH\"" "$reconcile_home/.zshrc" || fail "$interpreter_name reconciled managed block"
  if grep -Fq "$reconcile_bin_a" "$reconcile_home/.zshrc"; then
    fail "$interpreter_name stale managed path must be replaced"
  fi
  grep -Fq 'alias reconcile-before=1' "$reconcile_home/.zshrc" || fail "$interpreter_name unmanaged content preserved (before block)"
  grep -Fq 'alias reconcile-after=1' "$reconcile_home/.zshrc" || fail "$interpreter_name unmanaged content preserved (after block)"

  # A marker followed by unmanaged content is malformed. Remove only the
  # marker, preserve every following line, and append the current managed block
  # after the orphaned stale assignment so the new bin dir wins PATH order.
  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  CASE_SHELL_VALUE=/bin/zsh
  malformed_home="$case_root/malformed-block-home"
  malformed_bin="$case_root/malformed-block-bin"
  mkdir -p "$malformed_home"
  printf '%s\n' \
    'alias malformed-before=1' \
    '# Composio CLI' \
    '# keep this dotfile-manager annotation' \
    '' \
    'export PATH="/stale/malformed-bin:$PATH"' \
    'alias malformed-after=1' >"$malformed_home/.zshrc"
  malformed_output=$(run_installer "$malformed_home" "$case_root/malformed-block-install" "$malformed_bin" "$stable_tag" 2>&1)
  assert_contains "$malformed_output" 'Updated ~/.zshrc' "$interpreter_name malformed block update disclosure"
  grep -Fq '# keep this dotfile-manager annotation' "$malformed_home/.zshrc" || fail "$interpreter_name malformed block preserves the line after its marker"
  grep -Fq 'export PATH="/stale/malformed-bin:$PATH"' "$malformed_home/.zshrc" || fail "$interpreter_name malformed block preserves an orphaned stale assignment"
  grep -Fq 'alias malformed-before=1' "$malformed_home/.zshrc" || fail "$interpreter_name malformed block preserves content before its marker"
  grep -Fq 'alias malformed-after=1' "$malformed_home/.zshrc" || fail "$interpreter_name malformed block preserves content after its marker"
  [[ $(grep -Fc '# Composio CLI' "$malformed_home/.zshrc") -eq 1 ]] || fail "$interpreter_name malformed block leaves one fresh marker"
  malformed_tail=$(tail -n 2 "$malformed_home/.zshrc")
  [[ $malformed_tail == "# Composio CLI
export PATH=\"$malformed_bin:\$PATH\"" ]] || fail "$interpreter_name malformed block appends the current assignment last"

  # --- Symlinked startup files and mode preservation (managed dotfiles) ---

  # Inline setup must write through a symlinked rc file: the symlink survives
  # and its target receives the managed block (mirrors the CLI unit test
  # 'preserves a symlinked .zshrc').
  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  CASE_SHELL_VALUE=/bin/zsh
  symlink_home="$case_root/symlink-home"
  symlink_store="$case_root/symlink-store"
  symlink_bin="$case_root/symlink-bin"
  mkdir -p "$symlink_home" "$symlink_store"
  printf '%s\n' 'alias dotfiles-managed=1' >"$symlink_store/zshrc"
  ln -s "$symlink_store/zshrc" "$symlink_home/.zshrc"
  symlink_output=$(run_installer "$symlink_home" "$case_root/symlink-install" "$symlink_bin" "$stable_tag" 2>&1)
  assert_contains "$symlink_output" 'Updated ~/.zshrc' "$interpreter_name symlinked rc update disclosure"
  [[ -L "$symlink_home/.zshrc" ]] || fail "$interpreter_name symlinked rc must stay a symlink"
  [[ $(readlink "$symlink_home/.zshrc") == "$symlink_store/zshrc" ]] || fail "$interpreter_name symlinked rc target must not change"
  [[ $(grep -Fc '# Composio CLI' "$symlink_store/zshrc") -eq 1 ]] || fail "$interpreter_name symlink target must hold one managed block"
  grep -Fq "export PATH=\"$symlink_bin:\$PATH\"" "$symlink_store/zshrc" || fail "$interpreter_name symlink target managed line"
  grep -Fq 'alias dotfiles-managed=1' "$symlink_store/zshrc" || fail "$interpreter_name symlink target unmanaged content preserved"

  # The inline rewrite must preserve the startup file's permission bits.
  reset_case
  CASE_SHELL_CAPABILITY=unsupported
  CASE_SHELL_VALUE=/bin/zsh
  mode_home="$case_root/mode-home"
  mkdir -p "$mode_home"
  printf '%s\n' 'alias mode-check=1' >"$mode_home/.zshrc"
  chmod 600 "$mode_home/.zshrc"
  run_installer "$mode_home" "$case_root/mode-install" "$case_root/mode-bin" "$stable_tag" >/dev/null 2>&1
  grep -Fq '# Composio CLI' "$mode_home/.zshrc" || fail "$interpreter_name mode-preservation run must write the block"
  case $(uname) in
  Darwin) mode_actual=$(stat -f '%Lp' "$mode_home/.zshrc") ;;
  *) mode_actual=$(stat -c '%a' "$mode_home/.zshrc") ;;
  esac
  [[ $mode_actual == 600 ]] || fail "$interpreter_name inline rewrite must preserve the file mode (got $mode_actual)"

  # --- Delegated setup verification (stale managed blocks) ---

  # A delegated CLI that exits 0 without reconciling a pre-seeded stale block
  # must not be trusted: the installer verifies the startup file, reconciles
  # inline, and reports the fallback disclosure with the Case B ending.
  reset_case
  CASE_INSTALL_SHELL=zsh
  CASE_INSTALL_RECONCILE=0
  stale_home="$case_root/stale-delegated-home"
  stale_bin="$case_root/stale-delegated-bin"
  mkdir -p "$stale_home"
  printf '%s\n' 'alias stale-guard=1' '' '# Composio CLI' 'export PATH="/stale/old-bin:$PATH"' >"$stale_home/.zshrc"
  stale_output=$(run_installer "$stale_home" "$case_root/stale-delegated-install" "$stale_bin" "$stable_tag" 2>&1)
  grep -Fq "|installer|$stale_bin|install --shell zsh" "$composio_log" || fail "$interpreter_name stale delegation still delegates first"
  assert_contains "$stale_output" "$(configured_line zsh)" "$interpreter_name stale delegation reconciles inline"
  [[ $(grep -Fc '# Composio CLI' "$stale_home/.zshrc") -eq 1 ]] || fail "$interpreter_name stale reconcile keeps one marker block"
  grep -Fq "export PATH=\"$stale_bin:\$PATH\"" "$stale_home/.zshrc" || fail "$interpreter_name stale reconcile names the current bin dir"
  if grep -Fq '/stale/old-bin' "$stale_home/.zshrc"; then
    fail "$interpreter_name stale managed path must be replaced after delegation"
  fi
  grep -Fq 'alias stale-guard=1' "$stale_home/.zshrc" || fail "$interpreter_name stale reconcile preserves unmanaged content"
  assert_tail "$stale_output" "$case_b_tail" "$interpreter_name stale delegation Case B tail"

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
