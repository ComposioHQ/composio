#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

bin_dir="$tmpdir/bin"
home_dir="$tmpdir/home"
install_dir="$tmpdir/install"
mkdir -p "$bin_dir" "$home_dir" "$install_dir"

platform=$(uname -ms)
case $platform in
'Darwin x86_64')  target=darwin-x64     ;;
'Darwin arm64')   target=darwin-aarch64  ;;
'Linux aarch64' | 'Linux arm64')
                  target=linux-aarch64   ;;
'Linux x86_64')   target=linux-x64      ;;
*)                echo "Unsupported test platform: $platform" >&2; exit 1 ;;
esac

archive_name="composio-$target.zip"
valid_tag='@composio/cli@98.0.0'
missing_asset_tag='@composio/cli@99.0.0'
tag_without_release='@composio/cli@100.0.0'
api_base='https://api.example.test'
archive_url="https://downloads.example.test/$valid_tag/$archive_name"
curl_log="$tmpdir/curl.log"
git_log="$tmpdir/git.log"
composio_log="$tmpdir/composio.log"

cat > "$bin_dir/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

output=""
url=""
while [[ $# -gt 0 ]]; do
    case "$1" in
    --output|-o)
        output="$2"
        shift 2
        ;;
    --*)
        shift
        ;;
    *)
        url="$1"
        shift
        ;;
    esac
done

printf '%s\n' "$url" >> "$TEST_CURL_LOG"

case "$url" in
"$TEST_API_BASE/repos/$COMPOSIO_GITHUB_OWNER/$COMPOSIO_GITHUB_REPO/releases?per_page=100&page=1")
    cat <<JSON
[
  {
    "tag_name": "$TEST_MISSING_ASSET_TAG",
    "prerelease": false,
    "draft": false,
    "assets": []
  },
  {
    "tag_name": "@composio/cli@99.0.0-beta.1",
    "prerelease": true,
    "draft": false,
    "assets": [
      { "name": "$TEST_ARCHIVE_NAME", "browser_download_url": "https://downloads.example.test/@composio/cli@99.0.0-beta.1/$TEST_ARCHIVE_NAME" }
    ]
  },
  {
    "tag_name": "@composio/openai@100.0.0",
    "prerelease": false,
    "draft": false,
    "assets": [
      { "name": "$TEST_ARCHIVE_NAME", "browser_download_url": "https://downloads.example.test/@composio/openai@100.0.0/$TEST_ARCHIVE_NAME" }
    ]
  },
  {
    "tag_name": "$TEST_VALID_TAG",
    "prerelease": false,
    "draft": false,
    "assets": [
      { "name": "$TEST_ARCHIVE_NAME", "browser_download_url": "$TEST_ARCHIVE_URL" }
    ]
  }
]
JSON
    ;;
"$TEST_ARCHIVE_URL")
    if [[ -z "$output" ]]; then
        echo 'archive download did not pass --output' >&2
        exit 1
    fi
    printf 'fake archive for %s\n' "$TEST_VALID_TAG" > "$output"
    ;;
*checksums.txt)
    exit 22
    ;;
*)
    echo "unexpected curl URL: $url" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$bin_dir/curl"

cat > "$bin_dir/unzip" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

dest=""
while [[ $# -gt 0 ]]; do
    case "$1" in
    -d)
        dest="$2"
        shift 2
        ;;
    -*)
        # install.sh currently calls unzip with -oqd <dest>, so support the
        # compact flag by treating the next argument as the destination.
        if [[ "$1" == *d ]]; then
            dest="$2"
            shift 2
        else
            shift
        fi
        ;;
    *)
        shift
        ;;
    esac
done

if [[ -z "$dest" ]]; then
    echo 'fake unzip did not receive a destination' >&2
    exit 1
fi

mkdir -p "$dest"
cat > "$dest/composio" <<'BIN'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >> "$TEST_COMPOSIO_LOG"

case "${1:-}" in
install)
    if [[ -n "${TEST_INSTALL_STDERR:-}" ]]; then
        printf '%s\n' "$TEST_INSTALL_STDERR" >&2
    fi
    exit 0
    ;;
setup)
    if [[ "${COMPOSIO_CLI_INVOCATION_ORIGIN:-}" != 'installer' ]]; then
        echo 'Expected automatic plugin setup telemetry origin to be installer.' >&2
        exit 97
    fi
    exit "${TEST_SETUP_EXIT:-0}"
    ;;
--version|version)
    if [[ -n "${TEST_VERSION_STDERR:-}" ]]; then
        printf '%s\n' "$TEST_VERSION_STDERR" >&2
    fi
    echo 'composio fake 98.0.0'
    exit "${TEST_VERSION_EXIT:-0}"
    ;;
*)
    exit 0
    ;;
esac
BIN
chmod +x "$dest/composio"
EOF
chmod +x "$bin_dir/unzip"

cat > "$bin_dir/git" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'git should not be used for install.sh release resolution; fake tag was %s\n' "$TEST_TAG_WITHOUT_RELEASE" >> "$TEST_GIT_LOG"
echo "0000000000000000000000000000000000000000 refs/tags/$TEST_TAG_WITHOUT_RELEASE"
exit 0
EOF
chmod +x "$bin_dir/git"

export TEST_CURL_LOG="$curl_log"
export TEST_GIT_LOG="$git_log"
export TEST_COMPOSIO_LOG="$composio_log"
export TEST_API_BASE="$api_base"
export TEST_ARCHIVE_NAME="$archive_name"
export TEST_ARCHIVE_URL="$archive_url"
export TEST_VALID_TAG="$valid_tag"
export TEST_MISSING_ASSET_TAG="$missing_asset_tag"
export TEST_TAG_WITHOUT_RELEASE="$tag_without_release"

run_installer() {
    local test_home="$1"
    local test_install_dir="$2"
    shift 2

    env \
        PATH="$bin_dir:$PATH" \
        HOME="$test_home" \
        SHELL="/bin/bash" \
        COMPOSIO_INSTALL_DIR="$test_install_dir" \
        COMPOSIO_INSTALL_PLUGINS="${COMPOSIO_INSTALL_PLUGINS:-1}" \
        COMPOSIO_GITHUB_URL='https://github.example.test' \
        COMPOSIO_GITHUB_API_BASE_URL="$api_base" \
        COMPOSIO_GITHUB_OWNER='FakeOwner' \
        COMPOSIO_GITHUB_REPO='fake-repo' \
        TEST_INSTALL_STDERR="${TEST_INSTALL_STDERR:-}" \
        TEST_SETUP_EXIT="${TEST_SETUP_EXIT:-0}" \
        TEST_VERSION_EXIT="${TEST_VERSION_EXIT:-0}" \
        TEST_VERSION_STDERR="${TEST_VERSION_STDERR:-}" \
        bash "$repo_root/install.sh" "$@"
}

install_guidance='shell integration guidance from composio install'
output=$(TEST_INSTALL_STDERR="$install_guidance" run_installer "$home_dir" "$install_dir" 2>&1)

printf '%s\n' "$output"

if [[ -s "$git_log" ]]; then
    echo 'Expected install.sh not to call git while resolving latest release.' >&2
    cat "$git_log" >&2
    exit 1
fi

if [[ ! -f "$install_dir/release-tag.txt" ]]; then
    echo 'Expected install.sh to write release-tag.txt.' >&2
    exit 1
fi

installed_tag=$(<"$install_dir/release-tag.txt")
if [[ "$installed_tag" != "$valid_tag" ]]; then
    echo "Expected fallback to $valid_tag, got $installed_tag" >&2
    exit 1
fi

if ! grep -q "Found latest version: $valid_tag" <<<"$output"; then
    echo "Expected installer output to select $valid_tag." >&2
    exit 1
fi

if grep -q "Installing Composio CLI $missing_asset_tag" <<<"$output"; then
    echo "Installer attempted to install release without $archive_name." >&2
    exit 1
fi

if grep -q "$tag_without_release" "$curl_log"; then
    echo 'Installer attempted to use a tag that was not present in releases.' >&2
    exit 1
fi

if ! grep -qxF -- '--version' "$composio_log"; then
    echo 'Expected installer to probe the downloaded CLI with --version.' >&2
    cat "$composio_log" >&2
    exit 1
fi

if ! grep -qxF 'install' "$composio_log"; then
    echo 'Expected installer to delegate shell integration to composio install.' >&2
    cat "$composio_log" >&2
    exit 1
fi

if ! grep -qF "$install_guidance" <<<"$output"; then
    echo 'Expected composio install stderr guidance to remain visible.' >&2
    printf '%s\n' "$output" >&2
    exit 1
fi

expected_setup='setup --target auto --yes --if-present'
if ! grep -qxF "$expected_setup" "$composio_log"; then
    echo "Expected installer to invoke: composio $expected_setup" >&2
    cat "$composio_log" >&2
    exit 1
fi

failed_probe_home="$tmpdir/home-failed-probe"
failed_probe_install="$tmpdir/install-failed-probe"
mkdir -p "$failed_probe_home" "$failed_probe_install"
: > "$failed_probe_home/.bashrc"
: > "$composio_log"
loader_error='loader error from an unusable composio binary'
failed_probe_output=$(
    TEST_VERSION_EXIT=126 \
        TEST_VERSION_STDERR="$loader_error" \
        run_installer "$failed_probe_home" "$failed_probe_install" --no-plugins 2>&1
)
if grep -qF "$loader_error" <<<"$failed_probe_output"; then
    echo 'Expected the failed binary probe to suppress loader errors.' >&2
    printf '%s\n' "$failed_probe_output" >&2
    exit 1
fi
if grep -qxF 'install' "$composio_log"; then
    echo 'Expected a failed binary probe to skip composio install.' >&2
    cat "$composio_log" >&2
    exit 1
fi
if ! grep -qF 'Setting up shell integration...' <<<"$failed_probe_output"; then
    echo 'Expected a failed binary probe to select inline shell integration.' >&2
    printf '%s\n' "$failed_probe_output" >&2
    exit 1
fi
if ! grep -qxF '# Composio CLI' "$failed_probe_home/.bashrc"; then
    echo 'Expected inline shell integration to update .bashrc.' >&2
    cat "$failed_probe_home/.bashrc" >&2
    exit 1
fi

no_plugins_home="$tmpdir/home-no-plugins"
no_plugins_install="$tmpdir/install-no-plugins"
mkdir -p "$no_plugins_home" "$no_plugins_install"
: > "$composio_log"
run_installer "$no_plugins_home" "$no_plugins_install" --no-plugins >/dev/null 2>&1
if grep -q '^setup ' "$composio_log"; then
    echo 'Expected --no-plugins to skip agent plugin setup.' >&2
    cat "$composio_log" >&2
    exit 1
fi

env_opt_out_home="$tmpdir/home-env-opt-out"
env_opt_out_install="$tmpdir/install-env-opt-out"
mkdir -p "$env_opt_out_home" "$env_opt_out_install"
: > "$composio_log"
COMPOSIO_INSTALL_PLUGINS=0 run_installer "$env_opt_out_home" "$env_opt_out_install" >/dev/null 2>&1
if grep -q '^setup ' "$composio_log"; then
    echo 'Expected COMPOSIO_INSTALL_PLUGINS=0 to skip agent plugin setup.' >&2
    cat "$composio_log" >&2
    exit 1
fi

failed_setup_home="$tmpdir/home-failed-setup"
failed_setup_install="$tmpdir/install-failed-setup"
mkdir -p "$failed_setup_home" "$failed_setup_install"
: > "$composio_log"
if failed_output=$(TEST_SETUP_EXIT=23 run_installer "$failed_setup_home" "$failed_setup_install" 2>&1); then
    echo 'Expected installer to fail when detected agent plugin setup fails.' >&2
    exit 1
fi
if ! grep -q 'Composio CLI was installed, but agent plugin setup failed' <<<"$failed_output"; then
    echo 'Expected installer to explain how to retry failed plugin setup.' >&2
    printf '%s\n' "$failed_output" >&2
    exit 1
fi

printf 'install.sh release fallback, shell integration, and plugin setup tests passed\n'
