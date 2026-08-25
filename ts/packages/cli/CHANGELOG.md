# @composio/cli

## Unreleased

### Patch Changes

- `composio upgrade` shows download progress. The archive is a few hundred
  megabytes, and the command previously printed `Downloading...` once and then
  said nothing for minutes, which was indistinguishable from a hang. It now
  reports percent and transferred size as the download runs.
- `composio upgrade` downloads roughly half as much. Release archives carried
  all four platforms' `codex-acp` binaries, about 651 MB that the machine
  unpacking them can never execute. Only the binary for the archive's own
  platform is shipped now; the other three remain as empty placeholders so that
  a CLI installed before this change still passes its upgrade verification.
- `composio upgrade` works again from any previously released CLI. Release
  archives had been narrowed to drop the `codex-acp` binaries a machine cannot
  execute, but a CLI installed before that change verifies a downloaded package
  against all four platforms' binaries and rejects one that is missing any of
  them, failing with `Downloaded binary package is incomplete`. Every archive
  names all four paths again.
- Archives are no longer extracted with symbolic links in them. `extract-zip`
  creates a symlink entry without validating its target (CVE-2026-56876), which
  has no fixed release, and anything that later reads the extracted tree can be
  walked out of it. No archive this CLI extracts legitimately contains a
  symlink, so such an entry is now refused before it is written.
- `composio search` now uses schemas returned by Tool Router for dashboard-registered custom MCP tools instead of querying the legacy managed-tool endpoint, which returned 404 for `CUSTOM_*` tool slugs.
- `COMPOSIO_ENVIRONMENT=staging` now opens the staging dashboard at
  `https://staging-dashboard.composio.dev/`.
- `composio dev auth-configs create` now sends custom OAuth credentials and scopes
  in the API's expected shape instead of failing validation.

## 0.3.3

### Patch Changes

- Free-form object arguments now pass CLI tool-input validation and keep their content instead of failing with an unknown-key error. Run `composio upgrade` to install the fixed CLI binary.
- A tool schema the validator cannot interpret is now reported as a schema compile failure naming the cached schema path, instead of as an input error blaming your arguments. This covers a `patternProperties` key that is not a valid regular expression, and a reference inside a `patternProperties` or schema-valued `additionalProperties` subschema that does not resolve.
- Tools belonging to multi-word toolkits now resolve to the right toolkit.
  `composio tools execute GOOGLE_ANALYTICS_RUN_REPORT --account <alias>`
  previously looked for a `google` account instead of a `google_analytics` one,
  because the toolkit was guessed from the text before the first underscore.
  The toolkit is now matched against the known toolkit list, longest prefix
  first. This also corrects the toolkit shown in errors, file uploads, trigger
  listening, and telemetry.
- Session meta tools such as `COMPOSIO_SEARCH_TOOLS` are no longer attributed
  to the `composio_search` toolkit, whose slug their names happen to start
  with. A failed meta call used to suggest linking an app that had nothing to
  do with the call.
- Commands that consult the toolkit catalog more than once now fetch it once.
  `composio tools execute` was downloading the full ~800 KB list up to four
  times per run.
- A cached API request that fails is no longer sent a second time. The caching
  layer treated the request's own failure as a cache failure and retried it,
  so every failed toolkit, tool, or trigger listing cost two round trips and
  twice the wait before reporting the same error.
- Resolving a tool's toolkit no longer downloads the toolkit catalog. The CLI
  ships with the toolkit slugs it knew at build time and remembers any it
  learns since in `known-toolkit-slugs.json`, so `composio tools execute` only
  reaches for the catalog when a slug matches nothing it knows — a toolkit
  released after your CLI version. `FORCE_USE_CACHE` is unaffected.
- Resolving a tool's toolkit now reads what the CLI knows locally once per run
  rather than once per lookup. A single `composio tools execute` resolves the
  same toolkit up to four times — and once per tool with `--parallel` — and
  each of those re-read `known-toolkit-slugs.json`, re-parsed it, and rebuilt
  the lookup table over it. The weekly background refresh now also runs once per
  run instead of rewriting the file after every lookup.
- The background catalog refresh is abandoned after ten seconds. A finished
  command ends when the event loop drains, so a slow network could otherwise
  hold an exiting `composio` process open until the refresh completed.
- Cache files are now written atomically, so an interrupted run can no longer
  leave a truncated `toolkits.json` or `tools.json` behind.

## 0.3.2

### Minor Changes

- The installer (`curl -fsSL https://composio.dev/install | sh`) now configures your shell automatically: `COMPOSIO_INSTALL_SHELL` defaults to `auto`, which infers the login shell from `$SHELL` (zsh, bash, or fish) and always runs idempotent PATH setup for it; `COMPOSIO_INSTALL_SHELL=none` keeps the old install-only behavior for CI, Docker, and dotfile managers. Startup-file setup failures no longer fail the install — the installer keeps the binary, warns, and prints a runnable absolute-path command. `composio install` now reconciles an existing managed PATH block whose bin directory changed (one block per physical file, symlink-aware) and suppresses its boxed restart hint when invoked by the installer, which owns the final message.
- `composio install` gains a `--shell <zsh|bash|fish>` flag that overrides `$SHELL` detection, in preparation for the mise-style installer rewrite. The bin-dir PATH target now resolves through `COMPOSIO_BIN_DIR`, an existing `~/.local/bin/composio`, or the real binary's own directory, in that order, instead of hardcoding `~/.composio`; rc blocks write only a PATH line (the `export COMPOSIO_INSTALL_DIR=...` line is gone, since that variable identifies the install bundle, not the PATH entry point). Bash now always writes the PATH line to a login-mode startup file as well as `~/.bashrc`, so `bash -ilc` (and macOS Terminal.app, which starts a login shell) picks it up: the first existing of `~/.bash_profile` or `~/.bash_login`, or a newly created `~/.bash_profile` when neither exists. A `~/.bash_profile` created this way shadows `~/.profile`, so it is seeded to source it first; `~/.profile` itself is never modified. The restart hint bug is fixed: bash now prints `source ~/.bashrc` instead of the literal string `exec $SHELL`.
- `COMPOSIO_BIN_DIR` is a documented public override: set it to the absolute directory `composio install` should add to `PATH` when the entry point users reach is a shim or symlink rather than the binary itself. See the CLI README for the full resolution order.
- `composio install` now exits non-zero, having written nothing, when it cannot produce a safe PATH line. There are two abort conditions: the resolved bin directory is not absolute, or it contains a character that cannot be embedded in a quoted rc line. A non-zero exit is what makes `install.sh` run its inline PATH fallback, so an aborted run still leaves the user with a working `PATH` — previously the command exited 0 and the fallback never ran.
- The unsafe-character set is narrower than the one first shipped in this entry. The bin dir is only ever written inside double quotes, where `;`, `|`, `&`, `(`, `)`, and `'` are literal — only `` ` ``, `$`, `"`, `\`, newline, carriage return, and the `:` PATH separator abort now. Paths like `/Users/o'brien/.composio` are accepted instead of rejected.
- An rc file that carries the older three-line Composio block (`export COMPOSIO_INSTALL_DIR=...` plus a PATH line derived from it), written by a previous CLI or by `install.sh`'s fallback, is migrated to the current single-line block instead of being treated as configured forever. The stale managed lines are removed where they stood and one refreshed block is appended after the remaining content, so your own lines keep their order and the last-sourced PATH line wins. Re-running the command is still idempotent, and a completions block elsewhere in the file is untouched.
- `composio install` no longer skips the rc write when the bin directory happens to be on the invoking process's `$PATH`. That said nothing about future shells — an ad-hoc `export` or a version-manager shim made the command persist nothing and still report success.
- Note for custom install directories: the rc block no longer records `COMPOSIO_INSTALL_DIR`. If you installed to a custom directory with `COMPOSIO_INSTALL_DIR=... curl ... | bash` and later re-run the install script without re-specifying it, the script installs a second copy under `~/.composio` while your rc `PATH` still points at the old one. Re-specify `COMPOSIO_INSTALL_DIR` when reinstalling, or use `composio upgrade`, which replaces the running binary in place.

### Patch Changes

- Fix Linux `composio upgrade` failures with `ETXTBSY` by staging CLI files in
  the install directory and renaming the executable last. The installer and
  companion repair use the same replacement strategy, and the running binary
  now reports its compiled version when `release-tag.txt` disagrees. Users on
  an affected build must re-run `install.sh` once to install the first fixed
  version.
- Connected-account statuses added by the server no longer break
  `connected-accounts`, `link`, or `listen`. Piped output still strips
  credential fields, and schema warnings no longer print raw response values.
- `composio login --poll` now reports unreadable cache files as I/O errors
  instead of treating them as invalid session data.

## 0.3.1

### Minor Changes

- The CLI now points Claude Code and Codex users to `composio setup` when the
  Composio agent plugin is missing. The hint goes to stderr, appears at most
  once every 24 hours, remains visible in non-TTY agent sessions, and stays
  suppressed inside `composio run` children.
- Telemetry now goes directly to PostHog. This captures `install` and `setup`
  events before login without changing existing opt-outs.
- Telemetry events now include `journey_stage` (`install`, `setup`, `login`,
  `connect`, `execute`, or `other`) and `cli_channel` (`stable` or `beta`).
  `install.sh` also labels `composio install` with
  `invocation_origin: installer`, so script installs can be separated from
  manual runs. npm and Homebrew installs do not pass through `install.sh` and
  therefore have no installer origin.

## 0.3.0

### Patch Changes

- The GitHub release tag is now the only version source for standalone CLI
  binaries. Release builds embed the exact tag version, manual skill
  installation uses that tag, and stable releases can only promote a tested
  beta.

## 0.2.33

### Security

- fc17c37: Security: the CLI's tool file-upload path now enforces the sensitive-file denylist (issue #3746 / GHSA-hp3h-89pf-5q58). Previously `composio execute`/`composio run` read and uploaded any local path a tool argument pointed at — including `~/.ssh/id_rsa`, `~/.aws/credentials`, and `.env` files — enabling credential exfiltration in agentic workflows via prompt injection. The CLI now calls the shared `assertSafeFileUploadPath` guard from `@composio/core` at the lowest-level file read. URLs and `File` objects are unaffected.

  Unlike the core and Python SDKs (which expose a `sensitiveFileUploadProtection` / `sensitive_file_upload_protection` opt-out), the CLI enforces the denylist **unconditionally by design** — the primary attack vector is an agent prompt-injected into supplying its own tool arguments, so a CLI override flag would hand that attacker a trivial bypass. The block error carries CLI-appropriate remediation guidance instead of pointing at the SDK-only flag.

### Minor Changes

- Make headless `composio login` agent-friendly (PRDE-1138): the non-interactive instructions now offer the unattended `composio login --agent` path, and a machine with a stored READY agent identity (`~/.composio/agent.json`) completes plain headless `composio login` unattended by reusing it. Reuse only — a human piping `composio login` still gets the URL + poll instructions and never has an account auto-created.
- a0bef5d: Bump `@composio/client` to `0.1.0-alpha.74`.
- 025a657: Drop CommonJS entrypoints and publish the TypeScript SDK packages as ESM-only packages. This is a breaking change within the existing 0.x release line: consumers must use Node.js 22.22.3 or newer. CommonJS callers can only rely on Node's native `require(esm)` interop, and the SDK no longer ships custom CommonJS compatibility machinery or `.cjs` artifacts.

### Patch Changes

- Fix `composio listen` crashing with `TypeError: Object is not a constructor` in compiled release binaries (issue #3918). pusher-js 8.5.0 exports a namespace object (`module.exports = { Pusher }`) instead of the constructor (an undocumented upstream packaging regression, pusher/pusher-js#935, fixed in pusher-js 8.6.0), so the dynamic import's `.default` is not callable under Node or Bun; the realtime service now probes every observed interop shape (including the named `Pusher` export), constructs the client inside `Effect.try`, and fails with a typed error instead of crashing.
- Preserve the original CLI diagnostic when an adjacent source map is malformed or unusable instead of letting optional source-map enrichment abort error capture. Source-map enrichment is now best-effort end to end: a malformed, invalid, or unreadable `.map`, and a valid map pointing at an original source that was never shipped, all degrade to the raw stack location. `captureErrors` can no longer fail.
- Fix source-map resolution on Windows: original source paths are now resolved with the platform path separator instead of a hardcoded `/`, and the `node_modules` filter no longer mistakes directories such as `node_modules_local` for real dependency paths.
- Make `composio version --check` report `checkStatus: "unknown"` when GitHub cannot confirm the latest stable release, preserve the last successful cache on failed refreshes, and avoid racing the command with the startup update check.
- Keep `composio install` guidance visible when its output is captured. The command reports which rc file it changed and how to reload the shell, but suppressed all of it when stderr was not a terminal — so installers, containers, and CI logs saw nothing and users were left with `command not found`. Those lines now fall back to plain, undecorated output.
- Make multi-account selection a stable CLI feature: `execute`, `listen`, and `link --alias` no longer honor the old experimental toggle; `proxy` now accepts `--account <alias|word_id|connected-account-id>`; and duplicate-alias link errors explain how to select the existing account.
- 8467efd: Fix `composio whoami` reporting the API key's home organization after `composio orgs switch`. Session info requests now forward the selected global organization.
- 5f004ff: Drop `COMPOSIO_UPSERT_RECIPE` and `COMPOSIO_GET_RECIPE` from the CLI meta-tool list. These slugs were removed from `@composio/client` (alpha.74), so listing them broke the type-checked CLI build.
- 23f9053: Remove the unused `ansis` dependency from the CLI. Colored output is already handled by `picocolors`, so `ansis` was a dead production dependency that shipped with the package.
- 446c6f6: Fix virtual TypeScript file resolution used by CLI type generation so in-memory imports resolve consistently during transpilation and validation.
- Updated dependencies [552859a]
- Updated dependencies [a0bef5d]
- Updated dependencies [23f9053]
- Updated dependencies [dfd7a08]
- Updated dependencies [507318d]
- Updated dependencies [025a657]
- Updated dependencies [6a4cb54]
- Updated dependencies [4b76dbf]
- Updated dependencies [cbbad15]
  - @composio/core@0.12.0
  - @composio/json-schema-to-zod@0.2.0
  - @composio/ts-builders@0.2.0
  - @composio/cli-keyring@0.2.0
  - @composio/cli-local-tools@0.1.0

## 0.2.32

### Patch Changes

- Updated dependencies [22a9171]
- Updated dependencies [93b67e8]
- Updated dependencies [b69cef1]
- Updated dependencies [1ba66ca]
- Updated dependencies [a94715f]
- Updated dependencies [ce4b213]
- Updated dependencies [44e5458]
  - @composio/core@0.11.0
  - @composio/cli-local-tools@0.0.5

## 0.2.31

### Patch Changes

- `composio upgrade` now accepts an optional `<version>` argument so you can install a specific stable release or beta (e.g. `composio upgrade 0.13.1`, `composio upgrade 0.13.1-beta.42`, or the full tag `@composio/cli@0.13.1`). When omitted, the command continues to install the latest release on the chosen channel (`--beta` for prereleases).
- CLI now sends its per-cwd session id as the `x-cli-session-id` header on every request. The backend uses this to tag tool execution logs with `session_info.cli_session_id`, so all tool executions from a single CLI session (one cwd, one user) can be grouped together in the logs UI.
- Refresh the browser fallback approval prompt with the Composio CLI landing page visual style and serve it from the local loopback callback server while continuing to prefer the native macOS sidecar when available.
- Make CLI output more LLM-friendly by gating human-only notices/prompts on interactive TTYs and keeping logs on stderr.
- Route fish shell completions to `~/.config/fish/completions/composio.fish` (instead of the rc file) and sanitize completion lines that could break parsing.
- Permission "allow" decisions now expire after 1 hour — the prompt action is relabeled "Allow for 1 hr" and cached decisions are pruned on expiry.

## 0.2.30

### Patch Changes

- Updated dependencies [42ebff3]
  - @composio/core@0.10.0
  - @composio/cli-local-tools@0.0.4

## 0.2.29

### Patch Changes

- Updated dependencies [84a3a07]
- Updated dependencies [c358ffa]
  - @composio/core@0.9.1
  - @composio/cli-local-tools@0.0.3

## 0.2.28

### Patch Changes

- 79ac220: Scaffold the CLI local-tools foundation package, wire it into Tool Router search/execute sessions, and expose `composio local-tools list|doctor|configure|meta` for discovery, readiness checks, setup hints, and local metadata state. Concrete app integrations are added in follow-up stack PRs.
- Updated dependencies [79ac220]
- Updated dependencies [79ac220]
- Updated dependencies [79ac220]
- Updated dependencies [c9b6525]
- Updated dependencies [cc673b6]
- Updated dependencies [79ac220]
- Updated dependencies [9f14971]
- Updated dependencies [81f8027]
- Updated dependencies [711a703]
- Updated dependencies [bccd32b]
- Updated dependencies [bccd32b]
- Updated dependencies [07c9bab]
- Updated dependencies [3ece424]
  - @composio/cli-local-tools@0.0.2
  - @composio/core@0.9.0

## 0.2.27

### Patch Changes

- Updated dependencies [6b986cd]
- Updated dependencies [1c3276b]
  - @composio/core@0.8.1

## 0.2.26

### Patch Changes

- Updated dependencies [ebc9778]
- Updated dependencies
  - @composio/core@0.8.0

## 0.2.25

### Patch Changes

- Updated dependencies [27ed0c9]
  - @composio/core@0.6.11

## 0.2.24

Manual version bump to realign with the GitHub release tag. The 0.2.23 release workflow misclassified the version-bump merge as a beta due to a shallow-checkout bug in `.github/workflows/build-cli-binaries.yml`, so binaries built from that commit landed on `@composio/cli@0.2.24-beta.209` and, after `promote-stable`, on the GitHub tag `@composio/cli@0.2.24`. npm was left at 0.2.23. This release bumps npm to 0.2.24 so the published package and the GitHub release match. Fix for the underlying workflow bug: #3212.

## 0.2.23

### Patch Changes

- 4df06d2: feat: add `simple`, `default`, and `verbose` help verbosity modes to root and subcommand help (`--help simple|verbose`); compact simple mode and richer verbose mode with additional commands (#3205)
  feat: add `composio connections list` command that groups connected accounts by toolkit and displays aliases (#3206)
  feat: migrate API key storage from plaintext `~/.composio/user_data.json` to OS keyring (macOS Keychain / Linux Secret Service); env var > keyring > legacy plaintext precedence with one-shot migration and `dangerouslySaveApiKeyInUserConfig` opt-out for headless environments (#3202)
  feat: turn `composio dev` into a real developer-mode toggle backed by CLI user config; gate the `init`, `tools execute`, `triggers listen`, `logs`, `toolkits`, `auth-configs`, `connected-accounts`, `triggers`, and `projects` subcommand tree behind the toggle, and remove deprecated destructive `delete`/`info` commands now covered by the dev-mode gate (#3181)
  feat: enable `multi_account` experimental feature by default for stable CLI builds and centralize default experimental-feature behavior so runtime config and skill reference schema stay in sync (#3163)

## 0.2.22

### Patch Changes

- Updated dependencies [670ecc9]
  - @composio/core@0.6.10

## 0.2.21

### Patch Changes

- Updated dependencies [5b5723a]
  - @composio/core@0.6.9

## 0.2.20

### Patch Changes

- 4e36db8: feat: add `composio listen` command for real-time trigger event monitoring
  feat: add top-level `composio triggers` command (list, info subcommands)
  fix: pre-existing CI failures across CLI and e2e suites
  docs: document `--file` support for CLI skill uploads

## 0.2.19

### Patch Changes

- Updated dependencies [2b19ae9]
  - @composio/core@0.6.8

## 0.2.18

### Patch Changes

- f49e0af: feat: add `--beta` flag to `composio upgrade` for prerelease channel support
  feat: preload custom auth connections into tool router sessions for seamless custom-auth toolkit execution
  improve: beta-channel CLI release promotion flow in CI workflow
  improve: expanded test coverage for upgrade binary and custom auth session creation

## 0.2.17

### Patch Changes

- e3322e6: fix: hydrate file_uploadable tool inputs and add temp-file handling for execute payloads
  fix: surface in-band tool errors as warnings without overriding successful execution results
  fix: resolve 8 TypeScript strict-mode errors blocking CLI build in run-helpers-runtime
  refactor: extract run helper runtime (~650 lines) from run.cmd.ts into run-helpers-runtime.ts

## 0.2.16

### Patch Changes

- b763753: fix: bundle bun support files into CLI binary so standalone builds work without external bun dependencies

## 0.2.15

### Patch Changes

- 51c4e09: fix: bundle MCP server into subagent helper via static imports so it works with standalone CLI binaries without repo-local node_modules; fix codact failures not being reported by dispatching them through a dedicated background worker and wiring up the `tools execute` command to capture wrong-slug and wrong-param failures

## 0.2.14

### Patch Changes

- 5a3c661: Change `composio install` to skip shell completions by default and require `--completions` to install them explicitly. Also keep the skipped-completions logging consistent.

## 0.2.13

### Patch Changes

- cb02575: fix(cli): harden run subagent structured output and logfile path propagation

## 0.2.12

### Patch Changes

- 2eee65d: patch

## 0.2.11

### Patch Changes

- 77904b0: Fix link behavior, disable caching, improve search steps

## 0.2.10

### Patch Changes

- b301069: ### Bug fixes & hardening
  - Fix no-browser link flow to print raw redirect URLs
  - Harden session artifacts, analytics dir creation, and consumer cache for sandboxed environments (wrap filesystem ops in try/catch, respect `COMPOSIO_SESSION_DIR` / `COMPOSIO_CACHE_DIR` env vars)
  - Fix stale/broken symlink handling in skill installer (use `lstatSync` instead of `existsSync`)
  - Fix `detectMaster` parameter type to avoid type conflict from bun env augmentation

  ### New features
  - Add parallel execute support and help examples
  - Add batched multi-query tool search
  - Allow `execute --get-schema` without user context
  - Cache no-auth toolkits as connected
  - Report execute failure origin and tool log IDs
  - Add skill installer during `composio login` (with `--no-skill-install` opt-out)
  - Add contextual help on CLI errors and unknown arguments
  - Add `composio files` subcommand help and richer examples in root help output

## 0.2.9

### Patch Changes

- 315238c: - Add telemetry worker and improve tool execution UX
  - Fix `composio link` hanging after auth completes
  - Add parallel tool execution support
  - Add ACP-backed subagent execution to `composio run`
  - Move CLI manage commands under `dev` namespace
  - Update CLI copy

## 0.2.8

### Patch Changes

- ae08b37: - Make top-level `composio search`, `composio link`, and `composio execute` consumer-only
  - Keep developer-scoped usage under `composio manage ...`
  - Remove developer-only flags from root help and add short related-command hints
  - Use `consumer_user_id` from consumer project resolve for consumer flows
  - Execute: Default to empty object `{}` when no -d/--data or piped stdin provided
  - Search CTA: Use `-d "{}"` for tools with no schema properties (shell-safe)
- Updated dependencies [8dc5568]
  - @composio/core@0.6.7

## 0.2.7

### Patch Changes

- 106618b: - Make top-level `composio search`, `composio link`, and `composio execute` consumer-only
  - Keep developer-scoped usage under `composio manage ...`
  - Remove developer-only flags from root help and add short related-command hints
  - Use `consumer_user_id` from consumer project resolve for consumer flows
  - Execute: Default to empty object `{}` when no -d/--data or piped stdin provided
  - Search CTA: Use `-d "{}"` for tools with no schema properties (shell-safe)

## 0.2.6

### Patch Changes

- Updated dependencies [e1f6516]
  - @composio/core@0.6.6

## 0.2.5

### Patch Changes

- a5be528: Cli release with changes in command scopes

## 0.2.4

### Patch Changes

- 67867ae: Add login flags for agent/auth flows: `--no-wait` (print URL/session info and exit), `--key` (complete login with session key; polls until linked unless `--no-wait` is also passed)

## 0.2.3

### Patch Changes

- Updated dependencies [476d451]
- Updated dependencies
  - @composio/core@0.6.5

## 0.2.2

### Patch Changes

- 25c3246: CLI v0.2.2: interactive login picker, --no-wait for link, whoami security

  ### What's New
  - **Interactive org/project picker** after `composio login` (use `-y` to skip)
  - **`--no-wait`** flag for `composio link` — print URL/JSON and exit without waiting
  - **Whoami** no longer exposes API keys (security improvement)

  ### Breaking Changes
  - Removed `--api-key`, `--org-id`, `--project-id` from `composio login` and `composio init`
  - Non-interactive login/init via flags is no longer supported; use browser flow with `-y` for login

## 0.2.1

### Patch Changes

- ecb455c: Fix CTAs and Link commands

## 0.2.0

### Minor Changes

- c35b38b: Add top-level command aliases, restructure root help with BASIC/ADVANCED sections, and show full usage/options for basic commands

## 0.1.35

### Patch Changes

- Updated dependencies [e3f1f6c]
  - @composio/core@0.6.4

## 0.1.34

### Patch Changes

- 3d74f52: Added compact gh-style root help for composio --help and fixed the project environment detector empty-directory test on macOS. Updated root help copy (tagline, login/logout, generate) and resolved the CI typecheck failure in bin.ts.

## 0.1.33

### Patch Changes

- 5890693: Add a new commands for CLI org switching and project switching

## 0.1.32

### Patch Changes

- 9ebaac5: Fallback to gloabl user_id if project user_id is not present

## 0.1.31

### Patch Changes

- 6db8463: Skip user api key from env

## 0.1.30

### Patch Changes

- 5015210: Fallback to global context if project apikeys not found

## 0.1.29

### Patch Changes

- 7b47f35: Fix cli login command

## 0.1.28

### Patch Changes

- 2bd2db4: Update tool search and API key inference

## 0.1.27

### Patch Changes

- 25a3898: Fix test installation

## 0.1.26

### Patch Changes

- dfb07f2: BUmp cli version to enable new release flow

## 0.1.25

### Patch Changes

- d7dfa62: Upgrade the new CLI with composio flows
