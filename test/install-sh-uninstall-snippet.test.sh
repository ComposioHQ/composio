#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
suite_tmp="$(mktemp -d)"

cleanup() {
  rm -rf "$suite_tmp"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

snippet_file="$suite_tmp/uninstall-snippet.sh"
awk '
  /^### Uninstall$/ { in_section = 1; next }
  in_section && $0 == "```bash" { in_block = 1; next }
  in_block && $0 == "```" { exit }
  in_block { print }
' "$repo_root/docs/content/docs/cli.mdx" >"$snippet_file"

[[ -s $snippet_file ]] || fail 'could not extract the documented uninstall snippet'

interpreters=("$(command -v sh)")
if command -v dash >/dev/null 2>&1 && [[ $(command -v dash) != "${interpreters[0]}" ]]; then
  interpreters+=("$(command -v dash)")
fi

for interpreter in "${interpreters[@]}"; do
  interpreter_name=$(basename "$interpreter")
  case_home="$suite_tmp/$interpreter_name-home"
  mkdir -p "$case_home/.config/fish"
  cat >"$case_home/.config/fish/config.fish" <<'EOF'
set -gx EDITOR vim

# Composio CLI
set --export COMPOSIO_INSTALL_DIR "$HOME/.composio"
set --export PATH $COMPOSIO_INSTALL_DIR $PATH

alias ll='ls -la'
EOF

  HOME="$case_home" \
    COMPOSIO_INSTALL_DIR="$case_home/.composio" \
    COMPOSIO_BIN_DIR="$case_home/.local/bin" \
    "$interpreter" "$snippet_file"

  fish_config="$case_home/.config/fish/config.fish"
  if grep -Fq '# Composio CLI' "$fish_config" ||
    grep -Fq 'COMPOSIO_INSTALL_DIR' "$fish_config" ||
    grep -Fq 'set --export PATH' "$fish_config"; then
    fail "$interpreter_name kept the legacy Fish PATH block"
  fi
  grep -Fq 'set -gx EDITOR vim' "$fish_config" || fail "$interpreter_name lost leading Fish config"
  grep -Fq "alias ll='ls -la'" "$fish_config" || fail "$interpreter_name lost trailing Fish config"

  printf 'documented uninstall passed under %s\n' "$interpreter_name"
done

printf 'documented uninstall snippet tests passed\n'
