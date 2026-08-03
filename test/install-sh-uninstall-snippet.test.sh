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

stat_inode() {
  if stat -f '%i' "$1" >/dev/null 2>&1; then
    stat -f '%i' "$1"
  else
    stat -c '%i' "$1"
  fi
}

stat_mode() {
  if stat -f '%Lp' "$1" >/dev/null 2>&1; then
    stat -f '%Lp' "$1"
  else
    stat -c '%a' "$1"
  fi
}

assert_no_predictable_tmp() {
  if find "$1" -name '*.tmp' -print -quit | grep -q .; then
    fail "$2 left a predictable *.tmp file behind"
  fi
}

assert_dir_empty() {
  if find "$1" -mindepth 1 -print -quit | grep -q .; then
    fail "$2 left files in the scratch TMPDIR"
  fi
}

# Extract the uninstall snippet verbatim from the docs so this suite can never
# drift from what users actually run: the first ```bash fence after the
# "### Uninstall" heading.
docs_file="$repo_root/docs/content/docs/cli.mdx"
snippet_file="$suite_tmp/uninstall-snippet.sh"
awk '
  /^### Uninstall$/ { in_section = 1; next }
  in_section && $0 == "```bash" && !captured { in_block = 1; next }
  in_block && $0 == "```" { captured = 1; in_block = 0; next }
  in_block { print }
' "$docs_file" >"$snippet_file"
[[ -s $snippet_file ]] || fail "could not extract the uninstall snippet from $docs_file"
grep -Fq 'for file in' "$snippet_file" || fail "extracted snippet is missing the startup-file loop"
grep -Fq 'mktemp' "$snippet_file" || fail "extracted snippet does not stage rewrites through mktemp"
! grep -Fq 'chmod' "$snippet_file" || fail "extracted snippet must not loosen mktemp permissions"

real_mktemp=$(command -v mktemp)

# awk stand-in that emits partial output and fails, to prove a broken filter
# never reaches the startup file.
fail_bin="$suite_tmp/fail-bin"
mkdir -p "$fail_bin"
cat >"$fail_bin/awk" <<'EOF'
#!/usr/bin/env bash
printf 'partial filter output\n'
exit 1
EOF
chmod +x "$fail_bin/awk"

# mktemp stand-in that records mode-at-creation and path of every scratch file
# so the suite can assert 0600 under umask 022 and cleanup afterwards.
log_bin="$suite_tmp/log-bin"
mkdir -p "$log_bin"
cat >"$log_bin/mktemp" <<EOF
#!/usr/bin/env bash
set -euo pipefail
out=\$("$real_mktemp" "\$@")
if stat -f '%Lp' "\$out" >/dev/null 2>&1; then
  mode=\$(stat -f '%Lp' "\$out")
else
  mode=\$(stat -c '%a' "\$out")
fi
printf '%s %s\n' "\$mode" "\$out" >>"\$MKTEMP_LOG"
printf '%s\n' "\$out"
EOF
chmod +x "$log_bin/mktemp"

interpreters=("$(command -v sh)")
if command -v dash >/dev/null 2>&1 && [[ $(command -v dash) != "${interpreters[0]}" ]]; then
  interpreters+=("$(command -v dash)")
fi

for interpreter in "${interpreters[@]}"; do
  interpreter_name=$(basename "$interpreter")
  case_root="$suite_tmp/$interpreter_name"

  run_snippet() {
    local case_home=$1
    shift
    env "$@" \
      HOME="$case_home" \
      COMPOSIO_INSTALL_DIR="$case_home/.composio" \
      COMPOSIO_BIN_DIR="$case_home/.local/bin" \
      "$interpreter" "$snippet_file"
  }

  # --- Removes modern POSIX, modern fish, and legacy three-line blocks while
  # --- keeping unrelated content; also removes release artifacts. Runs with
  # --- TMPDIR unset to prove mktemp still lands somewhere valid.
  home_main="$case_root/main-home"
  mkdir -p "$home_main/.config/fish" "$home_main/.composio/services" "$home_main/.local/bin"
  printf 'binary\n' >"$home_main/.composio/composio"
  printf 'service\n' >"$home_main/.composio/services/example.txt"
  printf 'keep me\n' >"$home_main/.composio/user-data.json"
  ln -s "$home_main/.composio/composio" "$home_main/.local/bin/composio"
  cat >"$home_main/.zshrc" <<'EOF'
# user zshrc top
alias ll='ls -l'

# Composio CLI
export PATH="$HOME/.local/bin:$PATH"

# user zshrc bottom
EOF
  cat >"$home_main/.bashrc" <<'EOF'
# user bashrc

# Composio CLI
export COMPOSIO_INSTALL_DIR="$HOME/.composio"
export PATH="$COMPOSIO_INSTALL_DIR:$PATH"

alias gs='git status'
EOF
  cat >"$home_main/.config/fish/config.fish" <<'EOF'
# user fish config

# Composio CLI
set --export PATH "$HOME/.local/bin" $PATH

# Composio CLI
set --export COMPOSIO_INSTALL_DIR "$HOME/.composio"
set --export PATH $COMPOSIO_INSTALL_DIR $PATH

set -gx EDITOR vim
EOF

  run_snippet "$home_main" -u TMPDIR

  for startup in "$home_main/.zshrc" "$home_main/.bashrc" "$home_main/.config/fish/config.fish"; do
    ! grep -Fxq '# Composio CLI' "$startup" || fail "$interpreter_name kept the marker in $startup"
    ! grep -Fq 'COMPOSIO_INSTALL_DIR' "$startup" || fail "$interpreter_name kept a legacy line in $startup"
  done
  ! grep -Fq 'export PATH=' "$home_main/.zshrc" || fail "$interpreter_name kept the modern POSIX PATH line"
  ! grep -Fq 'set --export PATH' "$home_main/.config/fish/config.fish" ||
    fail "$interpreter_name kept a fish PATH line"
  grep -Fq "alias ll='ls -l'" "$home_main/.zshrc" || fail "$interpreter_name lost unrelated zshrc content"
  grep -Fq '# user zshrc bottom' "$home_main/.zshrc" || fail "$interpreter_name lost trailing zshrc content"
  grep -Fq "alias gs='git status'" "$home_main/.bashrc" || fail "$interpreter_name lost unrelated bashrc content"
  grep -Fq 'set -gx EDITOR vim' "$home_main/.config/fish/config.fish" ||
    fail "$interpreter_name lost unrelated fish content"
  [[ ! -e "$home_main/.local/bin/composio" ]] || fail "$interpreter_name kept the bin entry point"
  [[ ! -e "$home_main/.composio/composio" ]] || fail "$interpreter_name kept the installed binary"
  [[ ! -e "$home_main/.composio/services" ]] || fail "$interpreter_name kept the services directory"
  [[ -f "$home_main/.composio/user-data.json" ]] || fail "$interpreter_name deleted user state"
  assert_no_predictable_tmp "$home_main" "$interpreter_name main case"

  # --- A symlinked startup file stays a symlink; the target keeps its inode
  # --- and gets the filtered content.
  home_link="$case_root/symlink-home"
  tmp_link="$case_root/tmp-link"
  mkdir -p "$home_link/dotfiles" "$tmp_link"
  cat >"$home_link/dotfiles/zshrc" <<'EOF'
# managed by dotfiles
# Composio CLI
export PATH="$HOME/.local/bin:$PATH"
alias dot='true'
EOF
  ln -s "$home_link/dotfiles/zshrc" "$home_link/.zshrc"
  link_inode=$(stat_inode "$home_link/dotfiles/zshrc")

  run_snippet "$home_link" TMPDIR="$tmp_link"

  [[ -L "$home_link/.zshrc" ]] || fail "$interpreter_name replaced the startup symlink with a file"
  [[ $(readlink "$home_link/.zshrc") == "$home_link/dotfiles/zshrc" ]] ||
    fail "$interpreter_name repointed the startup symlink"
  [[ $(stat_inode "$home_link/dotfiles/zshrc") == "$link_inode" ]] ||
    fail "$interpreter_name replaced the symlink target inode"
  ! grep -Fxq '# Composio CLI' "$home_link/dotfiles/zshrc" ||
    fail "$interpreter_name kept the marker in the symlink target"
  grep -Fq "alias dot='true'" "$home_link/dotfiles/zshrc" ||
    fail "$interpreter_name lost content in the symlink target"
  assert_dir_empty "$tmp_link" "$interpreter_name symlink case"

  # --- A 0600 startup file keeps its mode, and under umask 022 the scratch
  # --- file is created 0600 (never more readable) and always removed.
  home_mode="$case_root/mode-home"
  tmp_mode="$case_root/tmp-mode"
  mktemp_log="$case_root/mktemp-mode.log"
  mkdir -p "$home_mode" "$tmp_mode"
  : >"$mktemp_log"
  cat >"$home_mode/.zshrc" <<'EOF'
export SECRET_TOKEN=hunter2

# Composio CLI
export PATH="$HOME/.local/bin:$PATH"
EOF
  chmod 600 "$home_mode/.zshrc"

  (
    umask 022
    run_snippet "$home_mode" PATH="$log_bin:$PATH" TMPDIR="$tmp_mode" MKTEMP_LOG="$mktemp_log"
  )

  [[ $(stat_mode "$home_mode/.zshrc") == 600 ]] || fail "$interpreter_name changed the 0600 startup mode"
  grep -Fq 'SECRET_TOKEN=hunter2' "$home_mode/.zshrc" || fail "$interpreter_name lost the secret line"
  ! grep -Fxq '# Composio CLI' "$home_mode/.zshrc" || fail "$interpreter_name kept the marker in the 0600 file"
  [[ -s $mktemp_log ]] || fail "$interpreter_name mode case never called mktemp"
  while read -r scratch_mode scratch_path; do
    [[ $scratch_mode == 600 ]] ||
      fail "$interpreter_name scratch file $scratch_path was created with mode $scratch_mode"
    [[ ! -e $scratch_path ]] || fail "$interpreter_name left scratch file $scratch_path behind"
  done <"$mktemp_log"
  assert_dir_empty "$tmp_mode" "$interpreter_name mode case"

  # --- A failing filter (awk overridden to emit partial output and exit 1)
  # --- leaves the startup file byte-identical and cleans up its scratch file.
  home_fail="$case_root/fail-home"
  tmp_fail="$case_root/tmp-fail"
  mkdir -p "$home_fail" "$tmp_fail"
  cat >"$home_fail/.zshrc" <<'EOF'
# precious user config

# Composio CLI
export PATH="$HOME/.local/bin:$PATH"
EOF
  cp "$home_fail/.zshrc" "$case_root/fail-before.zshrc"

  run_snippet "$home_fail" PATH="$fail_bin:$PATH" TMPDIR="$tmp_fail"

  cmp -s "$home_fail/.zshrc" "$case_root/fail-before.zshrc" ||
    fail "$interpreter_name modified the startup file although the filter failed"
  assert_dir_empty "$tmp_fail" "$interpreter_name failing-filter case"
  assert_no_predictable_tmp "$home_fail" "$interpreter_name failing-filter case"

  # --- An installer-created ~/.bash_profile that holds only the managed block
  # --- is deleted, restoring bash's default startup-file selection.
  home_bp_created="$case_root/bash-profile-created-home"
  mkdir -p "$home_bp_created"
  cat >"$home_bp_created/.bash_profile" <<'EOF'

# Composio CLI
export PATH="$HOME/.local/bin:$PATH"
EOF

  run_snippet "$home_bp_created" -u TMPDIR

  [[ ! -e "$home_bp_created/.bash_profile" ]] ||
    fail "$interpreter_name kept an empty leftover .bash_profile"

  # --- Documented edge: a pre-existing, user-owned empty ~/.bash_profile is
  # --- also removed.
  home_bp_blank="$case_root/bash-profile-blank-home"
  mkdir -p "$home_bp_blank"
  : >"$home_bp_blank/.bash_profile"

  run_snippet "$home_bp_blank" -u TMPDIR

  [[ ! -e "$home_bp_blank/.bash_profile" ]] ||
    fail "$interpreter_name kept a pre-existing empty .bash_profile"

  # --- A ~/.bash_profile with remaining content (the installer's ~/.profile
  # --- seed, or any user content) survives with only the block removed.
  home_bp_keep="$case_root/bash-profile-keep-home"
  mkdir -p "$home_bp_keep"
  cat >"$home_bp_keep/.bash_profile" <<'EOF'
# Created by the Composio CLI installer.
# Bash reads this file instead of ~/.profile in login shells.
if [ -f "$HOME/.profile" ]; then
    . "$HOME/.profile"
fi

# Composio CLI
export PATH="$HOME/.local/bin:$PATH"
EOF

  run_snippet "$home_bp_keep" -u TMPDIR

  [[ -f "$home_bp_keep/.bash_profile" ]] || fail "$interpreter_name deleted a non-empty .bash_profile"
  grep -Fq '. "$HOME/.profile"' "$home_bp_keep/.bash_profile" ||
    fail "$interpreter_name lost the ~/.profile seed content"
  ! grep -Fxq '# Composio CLI' "$home_bp_keep/.bash_profile" ||
    fail "$interpreter_name kept the marker in a seeded .bash_profile"
  ! grep -Fq 'export PATH=' "$home_bp_keep/.bash_profile" ||
    fail "$interpreter_name kept the managed PATH line in a seeded .bash_profile"

  printf 'docs uninstall snippet passed under %s\n' "$interpreter_name"
done

printf 'docs uninstall snippet tests passed\n'
