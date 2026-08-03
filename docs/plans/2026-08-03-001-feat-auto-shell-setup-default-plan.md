---
title: Auto Shell Setup as the Installer Default - Plan
type: feat
date: 2026-08-03
status: proposed
depends_on: 2026-07-31-001-feat-mise-style-installer-rewrite-plan.md
execution: code
---

# Auto Shell Setup as the Installer Default - Plan

## Goal Capsule

- **Objective:** Make `curl -fsSL https://composio.dev/install | sh` a single command that infers the user's shell and, for a recognized shell when setup succeeds, puts `composio` on `PATH` automatically for future terminals. Otherwise, give the user runnable fallback guidance. The getting-started page shows exactly one command, and a non-technical user never has to know what zsh/bash/fish is. Keep install-only behavior available as an explicit opt-out. Document only supported public overrides; keep compatibility and test controls internal, and do not advertise shell-specific routes until they are provisioned and verified.
- **Product driver:** Audience now includes non-technical users. One command, no shell vocabulary, no manual "how do I edit my PATH" step.
- **Hard constraint (physics, not preference):** A script piped into `sh` runs in a child process and cannot modify the invoking shell's live environment. No installer can retroactively fix the *current* terminal's `PATH`. If the installed executable is already the command the current terminal resolves, the user can continue immediately. Otherwise, after successful persistent setup, the installer gives one zero-vocabulary instruction: "open a new terminal window." Nothing stronger is implementable without replacing the invoking shell process.
- **Ship vehicle:** New PR stacked on `feat/mise-style-installer-rollout` (see KD1).

## Key Decisions

### KD1 — New stacked PR, not more commits on #4015

Keep the default flip in a separate stacked PR so it has its own review record and revert surface. The stack is three PRs deep, not two: `#4011` (`feat/cli-install-shell-flag` → `next`) adds `composio install --shell` and is still open awaiting review, and `#4015` (`feat/mise-style-installer-rollout`) targets `#4011`'s branch, not `next`. The current local `feat/mise-style-installer-rollout` branch is two commits ahead of the remote head for `#4015`, and neither open PR has a recorded approval; do not treat any layer as reviewed or green yet. First push the two base commits, wait for the updated checks, and obtain the required approval on `#4015`. "Required" may not be mechanically enforced: the base plan recorded `require_code_owner_review: false` on the live `next` ruleset as of 2026-07-31, so re-verify the ruleset, restore that gate if it is still absent, and treat approval as an explicit process step rather than something the merge button guarantees. Then branch `feat/installer-auto-shell-default` from that validated head and target its PR at `feat/mise-style-installer-rollout`.

`https://composio.dev/install` serves the installer from `next`, so the path to `next` is a release constraint with three merges and one release gate, in order:

1. Merge the reviewed default-flip PR into `feat/mise-style-installer-rollout`; rerun checks and required review on the now-combined `#4015` head.
2. Merge `#4011` to `next`. That merge alone publishes only an automatic beta, so follow the base plan's promotion protocol — verify the beta's exact tag, source commit, and uploaded assets; obtain explicit user approval; dispatch `promote-stable` — until a stable `@composio/cli` release containing `install --shell` is live. As of 2026-08-03 this gate is unmet: the latest stable, `0.3.1`, predates `--shell` (the pinned e2e compatibility leg depends on exactly that).
3. Retarget `#4015` at `next` (GitHub does this automatically when `feat/cli-install-shell-flag` is deleted on merge — verify the base actually flipped), rerun checks and required review on the final head, then merge `#4015`.

This preserves separate review history, keeps the base plan's rule that the rollout never merges ahead of a released stable CLI that understands `install --shell`, and ensures the public endpoint never exposes the install-only intermediate state.

The cross-repository deployment order is also load-bearing. After `#4015` reaches `next`, verify the live `/install` endpoint performs the `auto` contract, including fresh-terminal availability and the `none` opt-out. Only then deploy the linked dashboard and docs copy. The old dashboard command remains compatible with the new installer during this interval; the new dashboard promise is not compatible with the old install-only default. Roll back in reverse dependency order: dashboard/docs copy first, installer behavior second.

### KD2 — `COMPOSIO_INSTALL_SHELL` grows `auto` (new default) and `none`

Accepted values: `auto` (default when unset) | `zsh` | `bash` | `fish` | `none`.

- `auto`: infer the shell from `basename "$SHELL"`. Supported shell → always run the setup chain (made reconciling and idempotent in U1; today it skips on marker presence) so future terminals are configured. Unknown or unset `$SHELL` → degrade to today's install-only behavior plus guidance (never guess, never fail the install).
- `zsh|bash|fish`: always run setup for the requested shell as today; failure handling and final output follow KD3 and KD4.
- `none`: today's install-only default, for CI, Docker, and dotfile-manager users. This is the documented automation spelling.

`$SHELL` is the right inference source: it names the user's *login* shell — the shell future terminals will run — which is precisely what rc configuration targets. It is independent of the `sh` executing the script.

### KD3 — `auto` always configures recognized shells idempotently

In `auto` mode, a recognized login shell always runs the existing `setup_requested_shell` chain (probe → `composio install --shell <shell>` → inline fallback). Do not use the invoking process's live `PATH` or `guidance_required` result to skip persistent setup: neither proves that a future login shell is configured.

- Snapshot the inherited `PATH` before any installer code can modify it. After successful setup in either `auto` or explicit-shell mode, print Case A only when resolving `composio` against that snapshot selects the newly installed entry point. "Selects" means physical-path identity: resolve `command -v composio` under the snapshot, follow all symlinks, and compare the result against the fully resolved path of the verified installed executable (`$resolved_install_dir/composio`). The entry-point symlink and a bin dir equal to the install dir both satisfy this, and so does a pre-existing symlink elsewhere on `PATH` that resolves to the same installed executable — that terminal genuinely runs the new binary. A path-string comparison against the entry point is wrong in both directions and must not be used. This models what the invoking terminal can run after the child installer exits.
- setup succeeds but the installed entry point does not resolve from the inherited `PATH` snapshot → print Case B.
- setup failure → keep the installed binary, return success, warn that automatic `PATH` setup failed, and print the trusted absolute login command. A startup-file write failure must not turn a successful binary installation into a failed install.

The setup chain owns exactly one managed PATH block per target startup file. Repeated installs do not duplicate it; when an existing managed block names an old bin directory, replace only that managed block with the current resolved directory and preserve all unmanaged content. Users and automation that prohibit startup-file edits use `COMPOSIO_INSTALL_SHELL=none`. Explicit `zsh|bash|fish` values keep the same always-configure semantics.

`COMPOSIO_BIN_DIR` is an explicit trust boundary. Preserve current behavior for custom group- or world-writable directories: automatic and explicit shell setup may persist the resolved directory without a permission-mode warning or rejection. The default `~/.local/bin` remains user-owned. Advanced installation docs must state that anyone who can write to a custom executable directory can replace commands that future terminals run.

### KD4 — Post-install messaging for non-technical users

Two successful terminal states, both vocabulary-free:

- **Case A (already reachable):** print the status and action on separate lines, with the command as a plain indented line:

  ```text
  composio is ready.

    composio login
  ```
- **Case B (configured for future terminals):** print one instruction that is safe regardless of which shell currently interprets the installer:

  ```text
  Open a new terminal, then run:

    composio login
  ```

Do not print per-shell `source` or `exec` commands in the installer ending. The configured login shell can differ from the interpreter in the current terminal, so such a command is not universally copy-safe. Advanced docs may explain manual refresh commands to technical users.

Alternatives considered and rejected for the website command and default ending:

- `curl … | sh && exec $SHELL` — automates the restart in-window and works in zsh/bash/fish, but replaces the shell process (hostile inside scripts/tmux/IDE terminals), looks scarier to the exact audience this targets, and breaks the single-clean-command aesthetic.
- Per-shell `source <rc>` instructions — can execute syntax for the configured login shell inside a different current interpreter.
- Printing an absolute-path login command after successful setup — works immediately, but gives the normal success path two competing instructions. Reserve the absolute command for setup failure, unknown shells, install-only mode, or command-shadowing recovery.

Output is a state contract, not ad hoc copy:

| Mode | Setup outcome | Final visible state |
|---|---|---|
| `auto`, recognized shell, installed command already resolves | Idempotent setup succeeds | Case A |
| `auto`, recognized shell, installed command does not resolve | Idempotent setup succeeds | Case B |
| `auto`, recognized shell | Setup fails | Warning plus the trusted absolute `composio login` command; exit 0 |
| `auto`, unknown or unset shell | Setup skipped | Install-only guidance plus the trusted absolute login command |
| Explicit `zsh`, `bash`, or `fish`, installed command already resolves | Setup succeeds | Case A |
| Explicit `zsh`, `bash`, or `fish`, installed command does not resolve | Setup succeeds | Case B |
| Explicit `zsh`, `bash`, or `fish` | Setup fails | Warning plus the trusted absolute login command; exit 0 |
| `none` | Setup intentionally skipped | Install-only guidance; use the bare command only when it resolves to the installed entry point, otherwise use the trusted absolute command |
| `--agent`, setup succeeds | Agent login succeeds | Agent-login-complete status; never print a second generic login command. If the current terminal cannot resolve the installed command, add only the new-terminal notice |
| `--agent`, setup fails or is skipped | Agent login succeeds | Agent-login-complete status plus the setup warning and trusted installed-path guidance; never print a generic login command |
| Plugins enabled | Any successful state | Plugin output completes before the applicable final state |
| Quiet mode or `COMPOSIO_INSTALL_HELP=0` | Normal success | Preserve suppression: no post-install action block |
| Quiet mode or `COMPOSIO_INSTALL_HELP=0` | Setup fails | Warning plus the applicable trusted recovery command; failure recovery is never suppressed |

Apply the rows with this precedence: binary or agent-login failure remains fatal; successful agent login replaces any generic login action; setup failure or skipped setup adds recovery guidance appropriate to agent or human mode; plugin output completes before the final state; quiet/help suppression removes only normal-success help, never a setup-failure warning or recovery command.

### KD7 — Final-block contract (field evidence: the CTO transcript, 2026-07-31)

The production installer (pre-#4015) already auto-configured the shell — detected bash, updated `~/.bashrc`, added the install dir to `PATH` — and the CTO still ended up at `composio: command not found`, four times in a row. The transcript shows why: the refresh hint (`exec $SHELL`, boxed by clack) printed mid-stream, ~20 lines of `composio setup` plugin output buried it, and the final block said `To get started, run: composio --help` — unrunnable in that session. Users execute the last instruction on screen. **Auto-setup without a truthful ending reproduces the exact failure it was meant to fix.** Hard requirements:

- **The last block wins.** Except when quiet/help suppression removes normal-success help, the final printed lines are the only action block: state-aware and truthful for the current installation outcome. Setup-failure warnings and recovery commands remain visible. Nothing — no plugin output, no completions notes, no branding — prints after the final block. `main()` ordering already puts shell setup and guidance last; keep that invariant.
- **Copy-paste safe.** Commands in the final block are plain indented lines, never inside box-drawing characters. (Selecting bun-style clack boxes grabs `│` borders.)
- **One voice at the end.** `install.sh` owns the ending. When it delegates to a current CLI, use the already-passed `COMPOSIO_CLI_INVOCATION_ORIGIN=installer` env var to suppress the CLI's boxed restart hint while retaining its concise startup-file update status. An older CLI may not honor that environment variable, so the installer's plain final block must still print afterward and supersede it.
- **Agent flow is complete already.** After successful `composio login --agent`, print an agent-login-complete state, not `composio login`. The agent output tail receives its own regression assertion.
- **Tested, not hoped.** The harness covers every KD4 matrix row and the defined combinations, and asserts the exact final N lines for Case A, Case B, setup failure, plugins, agent mode, and a pinned older CLI. It also asserts that quiet/help suppression removes normal-success help but retains setup-failure recovery.

### KD5 — Deterministic everywhere; no TTY-gating

The default does not vary by TTY or CI detection — same behavior piped, scripted, or interactive. Automation that wants install-only sets `COMPOSIO_INSTALL_SHELL=none`. Rc edits on ephemeral CI runners under `auto` are harmless (idempotent marker block), but repo workflows should still set `none` where install-only is the intent, as living documentation.

### KD6 — Explicit variants remain; hosted routes stay unprovisioned

`install/{zsh,bash,fish}.sh` keep setting `COMPOSIO_INSTALL_SHELL=<shell>` explicitly and remain release assets for forcing an exact shell. The `/install/<shell>` routes are currently unprovisioned and must remain undocumented until live checks return the expected scripts. The getting-started page shows only the single default command; `cli.mdx` documents the supported public override matrix in an advanced section. Compatibility and test-only controls remain supported but undocumented.

## Work Breakdown

### U1 — `install.sh`

- Extend the `COMPOSIO_INSTALL_SHELL` validation case to `'' | auto | zsh | bash | fish | none` (empty ≡ auto). Fail fast pre-network on anything else (message lists all values).
- Resolve `auto` → concrete shell from `basename "$SHELL"` right after arg parsing; unresolvable → empty `requested_shell` (install-only path).
- Snapshot the inherited `PATH` before any installer helper can modify it. Use only this snapshot when deciding whether the invoking terminal can already run the installed entry point.
- For every recognized `auto` shell, call `setup_requested_shell` unconditionally; do not use `guidance_required` or live `PATH` membership as the setup gate.
- After any successful recognized-shell setup, define Case A only when `command -v composio`, evaluated against the inherited snapshot, resolves — after full symlink resolution, per KD3's physical-path identity rule — to the installed executable. If another executable shadows it, keep the final action on the trusted installed executable until a new terminal resolves correctly.
- Pass the already-resolved absolute `resolved_bin_dir` through delegated and inline setup. Before any startup-file write, apply the existing unsafe-path contract to that resolved value: reject colon, semicolon, backtick, dollar, pipe, ampersand, quotes, parentheses, newline, carriage return, and backslash. Never persist the raw `COMPOSIO_BIN_DIR` value. An unsafe resolved value is a setup failure, not a fatal error: write no startup file, warn naming the rejected path, print the trusted recovery command, and exit 0. The current `inline_shell_setup` behavior — calling `error` after the binary is already installed — violates this contract and must change.
- Preserve the existing permission policy for `COMPOSIO_BIN_DIR`. Treat a custom group- or world-writable directory as caller-trusted, and do not add a permission-mode warning or rejection. This does not weaken syntax validation or resolved-path handling.
- Reconcile managed PATH blocks instead of treating marker presence as success. Preserve exactly one marker block containing the current resolved bin directory and leave unmanaged startup-file content unchanged.
- Make delegated and inline startup-file setup non-fatal after binary installation. Every directory creation, file creation, read, replacement, and append helper returns a status explicitly; `inline_shell_setup` and `setup_requested_shell` propagate those statuses without relying on `set -e` inside a conditional. Capture failure, warn, print the trusted recovery command, and exit 0. Failure recovery travels the stderr `warn` channel, not `print_post_install_help`: that helper returns early under `COMPOSIO_QUIET` and `COMPOSIO_INSTALL_HELP=0`, so wiring recovery through it would silently violate the KD4 suppression rows.
- The trusted recovery executable is always the `--version`-verified installed binary `$resolved_install_dir/composio`, never the entry point: it exists in every recovery row of the KD4 matrix and stays valid when the bin dir was rejected or the entry-point symlink failed. Render it as a POSIX-safe single shell word before appending arguments. Valid paths containing whitespace remain copy-paste safe; unsafe quote characters remain rejected by the path validator.
- Rewrite `print_post_install_help` to implement the full KD4 state matrix. The install-only guidance survives for an unresolvable shell and `none`; neither path may tell the user to run a shadowed bare command.
- Update usage text (`COMPOSIO_INSTALL_SHELL=auto|zsh|bash|fish|none`, default `auto`).
- Enforce KD7 and the KD4 precedence rules: the final action block is the last output in every applicable flow, plugin output always precedes it, and `--agent` ends in its dedicated completed state with no second login command. Quiet/help controls suppress normal-success help only; setup-failure recovery remains visible.
- For inline setup, print a concise status naming each startup file that was updated, or state that its managed block was already current. This disclosure appears before the final action block and never tells the user to source a shell-specific file.
- Invariants: POSIX-guard regex clean, `shellcheck -s sh` clean, `command -v curl` line untouched (sed-patched by CI), argument-error ordering preserved.

### U1b — `install.cmd.ts` (CLI)

- Per KD7: when `COMPOSIO_CLI_INVOCATION_ORIGIN=installer`, suppress the CLI's boxed restart-hint note while retaining its concise `Updated <startup-file>` or already-current status. The installer owns final messaging; direct `composio install` invocations keep the hint. Unit-test both paths.
- Reconcile an existing managed PATH block whose bin directory differs from the resolved current directory. Preserve one marker block per physical target file, retain symlink-aware deduplication, and leave unmanaged content unchanged. Unit-test unchanged, replaced, and aliased target files.

### U2 — Harness and analytics tests

- Update `test/install-sh-release-resolution.test.sh`: every recognized default-flow shell delegates through the idempotent setup chain; `none` preserves install-only behavior; a recognized shell with the installed command already resolving still takes Case A after setup; unset/unknown shells take the install-only fallback; invalid values list `auto` and `none`.
- Add a shadowing case where the bin directory is on `PATH` but `command -v composio` resolves elsewhere; the ending must not run the shadowed command.
- Add inherited-PATH cases where installer internals mutate their own `PATH`; the ending must still reflect what the invoking terminal inherited.
- Add a pinned-old-CLI case with a relative `COMPOSIO_BIN_DIR`; startup files must remain unchanged and setup must receive only the resolved absolute directory. Assert that any older restart hint is followed and superseded by the installer's exact final tail.
- Add setup-write-failure cases for delegated and inline paths, including failures inside helpers invoked from conditionals under both `sh` and `dash`. They retain the installed binary, exit 0, warn, and end with the trusted recovery command.
- Add reinstall cases that move between two resolved bin directories. Delegated and inline setup must replace the old managed path, preserve unrelated startup-file content, and leave exactly one marker block.
- Add default-`auto` unsafe-path cases using representative metacharacters from the existing validator. Reject before a startup-file write and prove the files remain unchanged; assert the setup-failure contract — exit 0, a warning naming the rejected path, and a final tail ending with the trusted recovery command on the installed executable.
- Add recovery-output coverage for a valid absolute bin directory containing spaces. The printed command must execute the installed binary when pasted into `sh` or `dash`.
- Assert every KD4 state row and defined combination: Case A, Case B, unknown shell, `none`, explicit shells, plugin output ordering, agent completion with each setup outcome, and quiet/help suppression on success and failure. Exact tail assertions prove nothing follows the final block.
- Update `ts/packages/cli/test/src/analytics.events.test.ts`, whose existing base-installer assertion requires install-only behavior and forbids shell-setup delegation.
- Variant cases unchanged (they set the env var explicitly).

### U3 — Docker e2e (`ts/e2e-tests/cli/install/e2e.test.ts`)

- Flip "configures an existing bash login profile only through the bash variant": the default installer now always configures a recognized login shell idempotently — assert `bash -ilc 'command -v composio'` succeeds after the plain `curl | sh`, and that the login-override file gets exactly one marker block.
- `auto` infers from `$SHELL`, and Docker execs typically leave it unset — no current e2e leg sets it. Export `SHELL=/bin/bash` (or the matrix shell) in the environment of every default-flow installer invocation, and add a companion leg with `SHELL` unset asserting the install-only fallback inside the container.
- Add a `COMPOSIO_INSTALL_SHELL=none` leg asserting the old install-only contract.
- Keep the virgin-home test (already asserts fresh-login-shell availability) and idempotency legs; extend the pinned-old-CLI compatibility leg to cover the resolved absolute bin directory and non-fatal fallback contract.

### U4a — Dashboard onboarding (`ComposioHQ/dashboard`)

- Branch from a refreshed dashboard `main`; do not implement against the stale local checkout. Treat both onboarding cohorts as required: the legacy `/onboarding/cli-setup` selector for flag-off users and the Connect onboarding modal for flag-on users.
- Legacy flow: update `src/app/(private)/onboarding/_components/cli-setup-selector.tsx` and its `steps.ts` configuration. Replace the old bash-piped command with `curl -fsSL https://composio.dev/install | sh`; tell human terminal users to open a new terminal and run `composio login`; disclose that startup files may be updated and link to the `none` opt-out.
- Modal and agent-instruction flow: update the onboarding-modal prompt and the public CLI setup instructions. Because agent fetch caches are keyed on URL and cannot be purged, publish materially revised instructions at a new route path and update the modal's instruction URL in the same deployment. Preserve agent-specific authentication and task-completion behavior instead of substituting the human new-terminal copy.
- Inventory and update every dashboard-rendered public installer copy on current `main`, including the API CLI instruction and route test, client definitions/grid/instruction page, reusable CLI card, OpenClaw helper and test, and day-seven email preview. Replace public install commands with the `sh` form, then assign post-install copy by audience: human terminal flows receive new-terminal/login guidance; agent and API flows retain their specific completion contract.
- Verify the new instruction route and its tests, run dashboard `pnpm check`, and exercise both flag-off legacy onboarding and flag-on modal onboarding in a real browser. Confirm the command, follow-up state, opt-out disclosure, and stable layout on each rendered surface changed by the PR.

### U4b — Repository docs

- **Docs funnels** (`docs/content/docs/quickstart`, `docs/lib/source.ts`, `ai-tools-banner.tsx`, `home-surfaces.tsx`): align any surfaced CLI installation command and post-install wording with the dashboard onboarding contract.
- **Repository entrypoints** (`README.md`, `docs/content/docs/claude-code-plugin.mdx`): update the immediate post-install steps and automatic-setup description so they do not retain the old install-only contract.
- **`cli.mdx`**: Install section leads with the single command and what it does now (installs and configures a recognized shell when setup succeeds, with runnable fallback guidance otherwise); "Configure your shell" becomes the override/advanced section (`COMPOSIO_INSTALL_SHELL=<shell|none>` and release-asset variants); env table row updated (`auto` default, `none` documented); unprovisioned `/install/<shell>` routes are not advertised; uninstall section unchanged.
- **`INSTALL.md`**: same reframing; `none` called out for CI/dotfile managers.
- **Custom install directories**: in the advanced environment-variable reference and `INSTALL.md`, state that `COMPOSIO_BIN_DIR` is trusted input. Anyone with write access to that directory can replace commands that future terminals run.
- **Changelog** (`07-31-26-installer.mdx`): the "default flow does not edit shell files" bullet must be updated in this stacked PR — neither PR has shipped, so the entry describes only the final behavior. New bullet: default infers your shell and configures `PATH`; `COMPOSIO_INSTALL_SHELL=none` for install-only.
- **`ts/packages/cli/CLAUDE.md`** commands table: fix the stale `install` description ("Install local-tool integrations" → shell integration) — noted during this work, one-line fix.

### U5 — CI and workflows

- `cli.test-installation.yml`: keep no-argument installer steps on `auto` and assert the new persistent-shell behavior. Set `COMPOSIO_INSTALL_SHELL=none` only on steps whose named purpose is install-only; keep the manual `composio install --shell` step because it tests the CLI command directly.
- `cli.install-health-check.yml`: keep the existing secondary no-argument leg as a real-user `auto` check. Add a separate `COMPOSIO_INSTALL_SHELL=none` leg when deterministic install-only coverage is needed; do not replace default-flow coverage with it.
- Preview-comment block in `cli.install-e2e.yml`: single command first, `none` example second.
- `build-cli-binaries.yml`: update its generated installation instructions so release artifacts describe automatic setup, the `none` opt-out, and no unprovisioned routes.

### U6 — PR mechanics

- Push the two local `feat/mise-style-installer-rollout` commits, wait for updated checks, and obtain required approval before cutting `feat/installer-auto-shell-default`. Re-verify the `next` ruleset's code-owner review gate first (see KD1); restore it if absent.
- Branch from that validated head; target the new PR at `feat/mise-style-installer-rollout`. Its body records the product decision, the colleague's requirement, and the child-process limitation.
- Merge the reviewed follow-up into `feat/mise-style-installer-rollout` and rerun checks and required review on the combined `#4015` head.
- Clear the `#4011` layer before `#4015` can move: merge `#4011` to `next`, run the base plan's beta verification and user-approved `promote-stable` dispatch, and confirm the resulting stable `@composio/cli` release ships `install --shell`. `#4015` merges only after that stable is live.
- Retarget `#4015` at `next` (automatic when `feat/cli-install-shell-flag` is deleted on merge; verify the base flipped), rerun checks and required review on the final head, then merge `#4015` to `next`. Do not allow the public `next` installer to expose the intermediate default.
- Open the linked `ComposioHQ/dashboard` PR described in U4a, but do not deploy its new behavior promise before the installer stack. After `#4015` reaches `next`, smoke-test the live default and `none` flows, then deploy the dashboard and repository docs. Treat successful live installer verification and both dashboard onboarding cohorts as release-announcement gates.
- Record rollback order in both PRs: restore the prior dashboard/docs copy first, then revert installer behavior if necessary. The old copy remains compatible during an installer rollback; the new promise does not remain valid against the old install-only default.
- Update `#4015`'s body to note the stacked follow-up and to mark shell-specific routes as unprovisioned and undocumented rather than as a merge prerequisite.

## Risks

- **Philosophy reversal mid-stack:** #4015's review praised install-only defaults; this flips it. Mitigated by KD1's separate reviewable decision and the explicit `none` opt-out.
- **Dotfile-manager users:** recognized shells now run idempotent startup-file setup by default even when the current command already resolves. Mitigated: a single marker block, the documented `none` opt-out, and existing uninstall cleanup.
- **Startup-file write failure:** binary installation can succeed while persistent setup fails. Mitigated: setup is non-fatal, the ending names the failure, and the trusted absolute login command remains runnable.
- **Stale managed PATH block:** marker presence can hide an obsolete bin directory after reinstall. Mitigated: reconcile the managed block to the resolved current directory and test directory changes through delegated and inline setup.
- **Command shadowing:** a stale or hostile executable may appear earlier on `PATH`. Mitigated: Case A requires resolution to the installed entry point; recovery output uses the trusted absolute executable.
- **Shared custom bin directories:** a caller may intentionally choose a group- or world-writable `COMPOSIO_BIN_DIR`. Accepted policy: preserve current behavior and document the directory as caller-trusted; the user-owned default remains unchanged.
- **Cross-repository rollout:** the public installer follows `next`, while onboarding deploys independently. Mitigated: merge the follow-up into the stack before the combined base reaches `next`; verify the live installer first; deploy dashboard/docs second; roll back copy before behavior.
- **`$SHELL` lies** (csh users, `SHELL=/bin/sh`, exotic setups): degrade to install-only + guidance; never block the install.
- **Docs/e2e churn:** the flip touches many assertions written days ago; U2/U3 enumerate them so nothing flips silently.
