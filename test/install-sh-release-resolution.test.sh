#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
suite_tmp="$(mktemp -d)"
trap 'rm -rf "$suite_tmp"' EXIT

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

wait_for_file() {
  local file=$1
  local label=$2
  for _ in {1..100}; do
    [[ -f $file ]] && return 0
    sleep 0.05
  done
  fail "$label"
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

interpreters=("$(command -v sh)")
if command -v dash >/dev/null 2>&1 && [[ $(command -v dash) != "${interpreters[0]}" ]]; then
  interpreters+=("$(command -v dash)")
fi

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
    unset CASE_GITHUB_URL CASE_API_BASE CASE_INSTALL_VERSION CASE_INSTALL_SHELL CASE_PLUGINS CASE_QUIET CASE_DEBUG CASE_HELP
    unset CASE_ALLOW_HTTP_HOST CASE_CHECKSUM_MODE CASE_API_ASSET_URL CASE_BASE_MODE CASE_REDIRECT_DOWNGRADE
    unset CASE_SHELL_CAPABILITY CASE_INSTALL_EXIT CASE_SETUP_EXIT CASE_VERSION_EXIT CASE_PATH_PREFIX CASE_UNSET_SHELL
    unset CASE_CURL_DELAY_URL CASE_CURL_DELAY_SECONDS
    rm -f "$case_root/curl-parent.pid"
    : >"$curl_log"
    : >"$composio_log"
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
    env \
      PATH="${CASE_PATH_PREFIX:-}$fake_bin:$PATH" \
      HOME="$home" \
      SHELL=/bin/bash \
      COMPOSIO_INSTALL_DIR="$install_dir" \
      COMPOSIO_BIN_DIR="$bin_dir" \
      COMPOSIO_INSTALL_VERSION="${CASE_INSTALL_VERSION:-}" \
      COMPOSIO_INSTALL_SHELL="${CASE_INSTALL_SHELL:-}" \
      COMPOSIO_INSTALL_PLUGINS="${CASE_PLUGINS:-0}" \
      COMPOSIO_QUIET="${CASE_QUIET:-0}" \
      COMPOSIO_DEBUG="${CASE_DEBUG:-0}" \
      COMPOSIO_INSTALL_HELP="${CASE_HELP:-1}" \
      COMPOSIO_INSTALL_ALLOW_HTTP_HOST="${CASE_ALLOW_HTTP_HOST:-}" \
      COMPOSIO_GITHUB_URL="${CASE_GITHUB_URL:-$github_url}" \
      COMPOSIO_GITHUB_API_BASE_URL="${CASE_API_BASE:-$api_base}" \
      COMPOSIO_GITHUB_OWNER=FakeOwner \
      COMPOSIO_GITHUB_REPO=fake-repo \
      TEST_CHECKSUM_MODE="${CASE_CHECKSUM_MODE:-missing}" \
      TEST_API_ASSET_URL="${CASE_API_ASSET_URL:-}" \
      TEST_REDIRECT_DOWNGRADE="${CASE_REDIRECT_DOWNGRADE:-0}" \
      TEST_SHELL_CAPABILITY="${CASE_SHELL_CAPABILITY:-supported}" \
      TEST_INSTALL_EXIT="${CASE_INSTALL_EXIT:-0}" \
      TEST_SETUP_EXIT="${CASE_SETUP_EXIT:-0}" \
      TEST_VERSION_EXIT="${CASE_VERSION_EXIT:-0}" \
      TEST_CURL_DELAY_URL="${CASE_CURL_DELAY_URL:-}" \
      TEST_CURL_DELAY_SECONDS="${CASE_CURL_DELAY_SECONDS:-1}" \
      TEST_CURL_PARENT_PID_FILE="$case_root/curl-parent.pid" \
      "${installer_command[@]}" "$@"
  }

  run_variant() {
    local shell_name=$1
    local home=$2
    local install_dir=$3
    local bin_dir=$4
    shift 4
    mkdir -p "$home" "$install_dir" "$bin_dir"
    env \
      PATH="$fake_bin:$PATH" \
      HOME="$home" \
      SHELL="/bin/$shell_name" \
      COMPOSIO_INSTALL_DIR="$install_dir" \
      COMPOSIO_BIN_DIR="$bin_dir" \
      COMPOSIO_INSTALL_SCRIPT_URL="$script_url" \
      COMPOSIO_INSTALL_PLUGINS=0 \
      COMPOSIO_GITHUB_URL="$github_url" \
      COMPOSIO_GITHUB_API_BASE_URL="$api_base" \
      COMPOSIO_GITHUB_OWNER=FakeOwner \
      COMPOSIO_GITHUB_REPO=fake-repo \
      TEST_BASE_MODE="${CASE_BASE_MODE:-ok}" \
      TEST_CHECKSUM_MODE=missing \
      TEST_SHELL_CAPABILITY="${CASE_SHELL_CAPABILITY:-supported}" \
      TEST_INSTALL_EXIT="${CASE_INSTALL_EXIT:-0}" \
      TEST_CURL_DELAY_URL="${CASE_CURL_DELAY_URL:-}" \
      TEST_CURL_DELAY_SECONDS="${CASE_CURL_DELAY_SECONDS:-1}" \
      TEST_CURL_PARENT_PID_FILE="$case_root/curl-parent.pid" \
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
  assert_contains "$output" 'Required next step for bash:' "$interpreter_name required PATH guidance"
  [[ ! -e "$home/.bashrc" ]] || fail "$interpreter_name default flow must not write rc files"
  [[ $(wc -l <"$composio_log") -eq 1 ]] || fail "$interpreter_name default flow invoked extra CLI commands"
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

  reset_case
  CASE_PLUGINS=1
  run_installer "$case_root/plugins-home" "$case_root/plugins-install" "$case_root/plugins-bin" "$stable_tag" >/dev/null 2>&1
  grep -Eq '\|installer\|[^|]*\|setup --target auto --yes --if-present$' "$composio_log" || fail "$interpreter_name plugin opt-in"

  reset_case
  CASE_QUIET=1
  quiet_output=$(run_installer "$case_root/quiet-home" "$case_root/quiet-install" "$case_root/quiet-bin" "$stable_tag" 2>&1)
  assert_not_contains "$quiet_output" 'Installing Composio CLI' "$interpreter_name quiet output"

  reset_case
  CASE_DEBUG=1
  debug_output=$(run_installer "$case_root/debug-home" "$case_root/debug-install" "$case_root/debug-bin" "$stable_tag" 2>&1)
  assert_contains "$debug_output" '+ curl GET' "$interpreter_name debug traces"

  reset_case
  CASE_HELP=0
  help_suppressed=$(run_installer "$case_root/help-home" "$case_root/help-install" "$case_root/help-bin" "$stable_tag" 2>&1)
  assert_not_contains "$help_suppressed" 'next step' "$interpreter_name help suppression"

  reset_case
  CASE_UNSET_SHELL=1
  run_installer "$case_root/unset-shell-home" "$case_root/unset-shell-install" "$case_root/unset-shell-bin" "$stable_tag" >/dev/null 2>&1 ||
    fail "$interpreter_name unset SHELL must not fail after installation"

  reset_case
  CASE_CURL_DELAY_URL="$github_url/FakeOwner/fake-repo/releases/download/$stable_tag/$archive_name"
  signal_output="$case_root/signal-installer.log"
  run_installer "$case_root/signal-home" "$case_root/signal-install" "$case_root/signal-bin" "$stable_tag" >"$signal_output" 2>&1 &
  signal_job=$!
  wait_for_file "$case_root/curl-parent.pid" "$interpreter_name installer did not reach delayed download"
  signal_pid=$(<"$case_root/curl-parent.pid")
  kill -TERM "$signal_pid"
  if wait "$signal_job"; then
    fail "$interpreter_name installer must terminate after SIGTERM"
  else
    signal_status=$?
  fi
  [[ $signal_status -eq 143 ]] || fail "$interpreter_name installer SIGTERM status (got $signal_status)"

  reset_case
  CASE_CURL_DELAY_URL=$script_url
  variant_signal_output="$case_root/signal-variant.log"
  run_variant zsh "$case_root/signal-variant-home" "$case_root/signal-variant-install" "$case_root/signal-variant-bin" "$stable_tag" >"$variant_signal_output" 2>&1 &
  variant_signal_job=$!
  wait_for_file "$case_root/curl-parent.pid" "$interpreter_name shell variant did not reach delayed download"
  variant_signal_pid=$(<"$case_root/curl-parent.pid")
  kill -TERM "$variant_signal_pid"
  if wait "$variant_signal_job"; then
    fail "$interpreter_name shell variant must terminate after SIGTERM"
  else
    variant_signal_status=$?
  fi
  [[ $variant_signal_status -eq 143 ]] || fail "$interpreter_name shell variant SIGTERM status (got $variant_signal_status)"

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
    grep -Fq "|installer|$variant_bin|install --shell $shell_name" "$composio_log" ||
      fail "$interpreter_name $shell_name variant delegation"
    assert_contains "$variant_output" "Configured $shell_name shell setup (cli)." "$interpreter_name $shell_name variant confirmation"
    assert_not_contains "$variant_output" 'Required next step' "$interpreter_name $shell_name variant must not print setup guidance"
    assert_not_contains "$variant_output" 'Optional shell setup' "$interpreter_name $shell_name variant must not print setup guidance"
  done

  reset_case
  CASE_INSTALL_SHELL=zsh
  direct_home="$case_root/direct-shell-home"
  direct_bin="$case_root/direct-shell-bin"
  direct_output=$(run_installer "$direct_home" "$case_root/direct-shell-install" "$direct_bin" "$stable_tag" 2>&1)
  grep -Fq "|installer|$direct_bin|install --shell zsh" "$composio_log" || fail "$interpreter_name COMPOSIO_INSTALL_SHELL delegation"
  assert_contains "$direct_output" 'Configured zsh shell setup (cli).' "$interpreter_name COMPOSIO_INSTALL_SHELL confirmation"
  assert_not_contains "$direct_output" 'Required next step' "$interpreter_name COMPOSIO_INSTALL_SHELL must not print setup guidance"
  [[ ! -e "$direct_home/.zshrc" ]] || fail "$interpreter_name COMPOSIO_INSTALL_SHELL CLI path must not write rc files"

  reset_case
  CASE_INSTALL_SHELL=zsh
  CASE_SHELL_CAPABILITY=unsupported
  direct_fallback_home="$case_root/direct-fallback-home"
  direct_fallback_output=$(run_installer "$direct_fallback_home" "$case_root/direct-fallback-install" "$case_root/direct-fallback-bin" "$stable_tag" 2>&1)
  grep -Fqx '# Composio CLI' "$direct_fallback_home/.zshrc" || fail "$interpreter_name COMPOSIO_INSTALL_SHELL unsupported CLI fallback"
  assert_contains "$direct_fallback_output" 'Configured zsh shell setup (fallback).' "$interpreter_name COMPOSIO_INSTALL_SHELL fallback confirmation"

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
  assert_contains "$invalid_shell_output" 'COMPOSIO_INSTALL_SHELL must be zsh, bash, or fish' "$interpreter_name invalid COMPOSIO_INSTALL_SHELL message"
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

  for unsafe_character in ';' ':'; do
    reset_case
    CASE_SHELL_CAPABILITY=unsupported
    unsafe_home="$case_root/unsafe-${unsafe_character//[^[:alnum:]]/delimiter}-variant-home"
    if run_variant zsh "$unsafe_home" "$case_root/unsafe-variant-install" "$case_root/unsafe${unsafe_character}variant-bin" "$stable_tag" >/dev/null 2>&1; then
      fail "$interpreter_name unsafe variant bin dir with $unsafe_character must fail"
    fi
    [[ ! -e "$unsafe_home/.zshrc" ]] || fail "$interpreter_name unsafe variant must not write rc file"
  done

  for base_mode in fail empty; do
    reset_case
    CASE_BASE_MODE=$base_mode
    base_failure_home="$case_root/base-$base_mode-home"
    if run_variant zsh "$base_failure_home" "$case_root/base-$base_mode-install" "$case_root/base-$base_mode-bin" "$stable_tag" >/dev/null 2>&1; then
      fail "$interpreter_name $base_mode base installer download must fail"
    fi
    [[ ! -e "$base_failure_home/.zshrc" ]] || fail "$interpreter_name $base_mode download must not write rc"
  done

  printf 'install scripts passed under %s\n' "$interpreter_name"
done

printf 'install.sh release resolution, layout, security, and shell-variant tests passed\n'
