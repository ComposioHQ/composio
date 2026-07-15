#!/bin/sh
set -eu

state_dir="${HOST_STATE_DIR:?HOST_STATE_DIR is required}"
host="$(basename "$0")"
command="$*"

mkdir -p "$state_dir"
printf '%s %s\n' "$host" "$command" >> "$state_dir/commands.log"

case "$host:$command" in
  "claude:--version")
    printf '%s\n' '2.1.207 (Claude Code)'
    ;;
  "claude:plugin marketplace list --help"|"claude:plugin list --help")
    printf '%s\n' "Usage: claude $command [OPTIONS]"
    if [ ! -f "$state_dir/claude-without-json" ]; then
      printf '%s\n' '      --json'
    fi
    ;;
  "claude:plugin marketplace list --json")
    if [ -f "$state_dir/claude-marketplace" ]; then
      printf '%s\n' '[{"name":"composio","source":"git","url":"https://github.com/ComposioHQ/composio-plugin-cc.git"}]'
    else
      printf '%s\n' '[]'
    fi
    ;;
  "claude:plugin list --json")
    if [ -f "$state_dir/claude-inspection-fails" ]; then
      printf '%s\n' 'native inspection failed' 'Usage: claude plugin list [options]' >&2
      exit 2
    fi
    if [ -f "$state_dir/claude-plugin" ]; then
      printf '%s\n' '[{"id":"composio@composio","scope":"user","enabled":true}]'
    else
      printf '%s\n' '[]'
    fi
    ;;
  "claude:plugin marketplace add https://github.com/ComposioHQ/composio-plugin-cc.git --scope user")
    touch "$state_dir/claude-marketplace"
    ;;
  "claude:plugin install composio@composio --scope user")
    touch "$state_dir/claude-plugin"
    ;;
  "claude:plugin enable composio@composio --scope user")
    touch "$state_dir/claude-plugin"
    ;;
  "claude:plugin uninstall composio@composio --scope user --yes")
    rm -f "$state_dir/claude-plugin"
    ;;
  "codex:--version")
    if [ -f "$state_dir/codex-without-json" ]; then
      printf '%s\n' 'codex-cli 0.137.0'
    else
      printf '%s\n' 'codex-cli 0.144.1'
    fi
    ;;
  "codex:plugin marketplace list --help")
    printf '%s\n' 'Usage: codex plugin marketplace list [OPTIONS]'
    if [ ! -f "$state_dir/codex-without-json" ]; then
      printf '%s\n' '      --json'
    fi
    ;;
  "codex:plugin list --help")
    printf '%s\n' 'Usage: codex plugin list [OPTIONS]'
    if [ ! -f "$state_dir/codex-without-json" ]; then
      printf '%s\n' '      --json'
    fi
    ;;
  "codex:plugin marketplace list --json")
    if [ -f "$state_dir/codex-marketplace" ]; then
      printf '%s\n' '{"marketplaces":[{"name":"composio","marketplaceSource":{"sourceType":"git","source":"ComposioHQ/composio-plugin-openai"}}]}'
    else
      printf '%s\n' '{"marketplaces":[]}'
    fi
    ;;
  "codex:plugin list --json")
    if [ -f "$state_dir/codex-plugin" ]; then
      printf '%s\n' '{"installed":[{"pluginId":"composio@composio","installed":true,"enabled":true}]}'
    else
      printf '%s\n' '{"installed":[],"available":[]}'
    fi
    ;;
  "codex:plugin marketplace add https://github.com/ComposioHQ/composio-plugin-openai.git --json")
    touch "$state_dir/codex-marketplace"
    ;;
  "codex:plugin add composio@composio --json")
    touch "$state_dir/codex-plugin"
    ;;
  "codex:plugin remove composio@composio --json")
    rm -f "$state_dir/codex-plugin"
    ;;
  *)
    printf 'Unexpected fake host command: %s %s\n' "$host" "$command" >&2
    exit 64
    ;;
esac
