# @composio/cli

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
