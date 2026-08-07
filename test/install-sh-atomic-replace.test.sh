#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
suite_tmp="$(mktemp -d)"
survivor_pid=

cleanup() {
  if [[ -n ${survivor_pid:-} ]]; then
    kill "$survivor_pid" 2>/dev/null || true
    wait "$survivor_pid" 2>/dev/null || true
  fi
  rm -rf "$suite_tmp"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

stat_inode() {
  if stat -f '%i' "$1" >/dev/null 2>&1; then
    stat -f '%i' "$1"
  else
    stat -c '%i' "$1"
  fi
}

assert_no_residue() {
  local install_dir=$1
  if find "$install_dir" -maxdepth 1 \( -name '.composio-install.*' -o -name '.composio-aside.*' \) -print -quit | grep -q .; then
    fail "installer residue remains in $install_dir"
  fi
}

platform=$(uname -ms)
case $platform in
'Darwin x86_64') target=darwin-x64 ;;
'Darwin arm64') target=darwin-aarch64 ;;
'Linux aarch64'|'Linux arm64') target=linux-aarch64 ;;
'Linux x86_64') target=linux-x64 ;;
*) fail "unsupported test platform: $platform" ;;
esac

fake_bin="$suite_tmp/bin"
mkdir -p "$fake_bin"

cat >"$fake_bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
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
  --*) shift ;;
  *)
    url=$1
    shift
    ;;
  esac
done

case $url in
*/checksums.txt) exit 22 ;;
*) printf 'fixture archive\n' >"$output" ;;
esac
EOF
chmod +x "$fake_bin/curl"

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

bundle="$dest/composio-$TEST_TARGET"
mkdir -p "$bundle/services" "$bundle/local-tools-binaries"
printf '%s\n' 'new-support' >"$bundle/run-bun.mjs"
printf '%s\n' 'new-service' >"$bundle/services/example.txt"
printf '%s\n' 'new-local-tool' >"$bundle/local-tools-binaries/current.txt"

if [[ ${TEST_ARCHIVE_MODE:-complete} == missing-binary ]]; then
  exit 0
fi

cat >"$bundle/composio" <<'BIN'
#!/bin/sh
# new-binary-marker
case ${1:-} in
--version|version) printf '%s\n' 'composio fixture 98.0.0' ;;
*) printf '%s\n' 'new-binary' ;;
esac
BIN
chmod +x "$bundle/composio"
EOF
chmod +x "$fake_bin/unzip"

cat >"$fake_bin/rm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ ${TEST_FAIL_ASIDE_CLEANUP:-} == 1 ]]; then
  for arg in "$@"; do
    case $arg in
    */.composio-aside.local-tools-binaries) exit 23 ;;
    esac
  done
fi

exec /bin/rm "$@"
EOF
chmod +x "$fake_bin/rm"

interpreters=("$(command -v sh)")
if command -v dash >/dev/null 2>&1 && [[ $(command -v dash) != "${interpreters[0]}" ]]; then
  interpreters+=("$(command -v dash)")
fi

version='@composio/cli@98.0.0'
for interpreter in "${interpreters[@]}"; do
  interpreter_name=$(basename "$interpreter")
  case_root="$suite_tmp/$interpreter_name"
  install_dir="$case_root/install"
  home="$case_root/home"
  mkdir -p "$install_dir" "$home"

  run_installer() {
    local archive_mode=$1
    local fail_aside_cleanup=${2:-0}
    env \
      PATH="$fake_bin:$PATH" \
      HOME="$home" \
      COMPOSIO_INSTALL_DIR="$install_dir" \
      COMPOSIO_BIN_DIR="$install_dir" \
      COMPOSIO_INSTALL_PLUGINS=0 \
      COMPOSIO_INSTALL_HELP=0 \
      COMPOSIO_QUIET=1 \
      COMPOSIO_GITHUB_URL=https://github.example.test \
      COMPOSIO_GITHUB_OWNER=FakeOwner \
      COMPOSIO_GITHUB_REPO=fake-repo \
      TEST_TARGET="$target" \
      TEST_ARCHIVE_MODE="$archive_mode" \
      TEST_FAIL_ASIDE_CLEANUP="$fail_aside_cleanup" \
      "$interpreter" "$repo_root/install.sh" "$version"
  }

  run_installer complete >/dev/null 2>&1
  [[ -x "$install_dir/composio" ]] || fail "$interpreter_name empty install executable"
  [[ -f "$install_dir/run-bun.mjs" ]] || fail "$interpreter_name empty install support file"
  [[ -f "$install_dir/services/example.txt" ]] || fail "$interpreter_name empty install service"
  [[ -f "$install_dir/local-tools-binaries/current.txt" ]] ||
    fail "$interpreter_name empty install local tool"
  [[ $(<"$install_dir/release-tag.txt") == "$version" ]] ||
    fail "$interpreter_name empty install metadata"
  assert_no_residue "$install_dir"

  marker="$case_root/old-process"
  cat >"$install_dir/composio" <<'EOF'
#!/bin/sh
marker=$1
: >"$marker.ready"
while [ ! -f "$marker.release" ]; do
  sleep 0.05
done
printf '%s\n' old-process >"$marker.result"
EOF
  chmod +x "$install_dir/composio"
  printf '%s\n' stale >"$install_dir/local-tools-binaries/stale.txt"
  old_inode=$(stat_inode "$install_dir/composio")
  "$install_dir/composio" "$marker" &
  survivor_pid=$!
  for _ in {1..100}; do
    [[ -f "$marker.ready" ]] && break
    sleep 0.05
  done
  [[ -f "$marker.ready" ]] || fail "$interpreter_name old process did not start"

  run_installer complete >/dev/null 2>&1
  new_inode=$(stat_inode "$install_dir/composio")
  [[ $new_inode != "$old_inode" ]] || fail "$interpreter_name reinstall kept the binary inode"
  grep -Fq 'new-binary-marker' "$install_dir/composio" ||
    fail "$interpreter_name reinstall binary contents"
  [[ ! -e "$install_dir/local-tools-binaries/stale.txt" ]] ||
    fail "$interpreter_name reinstall retained stale directory contents"
  : >"$marker.release"
  wait "$survivor_pid"
  survivor_pid=
  [[ $(<"$marker.result") == old-process ]] || fail "$interpreter_name old process changed"
  assert_no_residue "$install_dir"

  binary_before=$(<"$install_dir/composio")
  support_before=$(<"$install_dir/run-bun.mjs")
  tag_before=$(<"$install_dir/release-tag.txt")
  if missing_output=$(run_installer missing-binary 2>&1); then
    fail "$interpreter_name missing binary archive succeeded"
  fi
  grep -Fq 'Binary not found in extracted archive' <<<"$missing_output" ||
    fail "$interpreter_name missing binary error"
  [[ $(<"$install_dir/composio") == "$binary_before" ]] ||
    fail "$interpreter_name missing binary changed executable"
  [[ $(<"$install_dir/run-bun.mjs") == "$support_before" ]] ||
    fail "$interpreter_name missing binary changed support file"
  [[ $(<"$install_dir/release-tag.txt") == "$tag_before" ]] ||
    fail "$interpreter_name missing binary changed metadata"
  assert_no_residue "$install_dir"

  printf '%s\n' old-aside >"$install_dir/local-tools-binaries/recoverable.txt"
  if ! aside_cleanup_output=$(run_installer complete 1 2>&1); then
    fail "$interpreter_name aside cleanup failure aborted published install"
  fi
  grep -Fq 'Published install entry; previous contents retained at' <<<"$aside_cleanup_output" ||
    fail "$interpreter_name aside cleanup warning"
  grep -Fq 'Published CLI; retained recovery staging directory at' <<<"$aside_cleanup_output" ||
    fail "$interpreter_name retained staging warning"
  grep -Fq 'new-binary-marker' "$install_dir/composio" ||
    fail "$interpreter_name aside cleanup did not publish executable"
  retained_stage=$(find "$install_dir" -maxdepth 1 -type d -name '.composio-install.*' -print -quit)
  [[ -n $retained_stage ]] || fail "$interpreter_name missing retained recovery staging directory"
  [[ $(<"$retained_stage/.composio-aside.local-tools-binaries/recoverable.txt") == old-aside ]] ||
    fail "$interpreter_name retained aside is not recoverable"

  printf 'install.sh atomic replacement passed under %s\n' "$interpreter_name"
done

printf 'install.sh atomic replacement tests passed\n'
