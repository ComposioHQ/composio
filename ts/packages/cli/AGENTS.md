# `@composio/cli`

Effect.ts + Bun CLI. Service-oriented with layer-injected dependencies, generator-based control flow. Errors flow through the in-tree `effect-errors/` (source-mapped traces, Effect span timelines).

## Required check

When you touch anything under `src/commands/`, run `pnpm typecheck` from the **repo root**. CLI uses `tsgo` (`@typescript/native-preview`) — Effect's strict types catch wiring errors that runtime tests miss.

## Commands

```bash
pnpm cli <args>             # bun run src/bin.ts (dev)
pnpm build                  # tsdown to dist/
pnpm build:binary[:all]     # Bun binary → dist/composio (all = linux/darwin × x64/aarch64)
pnpm install:binary         # install built binary locally
pnpm test                   # validate:skills + vitest run
pnpm typecheck              # tsgo --noEmit (REQUIRED before commit)
pnpm typecheck:tsc          # fallback to stock tsc
pnpm record                 # regenerate VHS recordings (recordings/recordings.yaml)
pnpm validate:skills        # check skill bundle integrity
```

## Source layout (`src/`)

`bin.ts` (entry, composes layers, `BunRuntime.runMain`), `cli-config.ts` (case-sensitive, no auto-correct, no built-ins), `cli-main.ts`, `commands/` (one folder/file per command), `services/` (`ComposioUserContext`, `ComposioSessionRepository`, `ComposioToolkitsRepository[+Cached]`, `UpgradeBinary`, `CliUserConfig` (keyring-backed), `EnvLangDetector`, `JsPackageManagerDetector`, `ProjectContext`, `NodeOs`, …), `effects/` (`app-config`, `debug-config`, `force-config`, `setup-cache-dir`, `toolkit-version-overrides`, `validate-toolkit-versions`, `find-composio-core-generated`, `version`, `compare-semver`), `generation/` (composio generate ts|py — fetch → index → build via `@composio/ts-builders` → transpile), `models/` (Effect Schema: Toolkit/Tool/TriggerType/UserData/Session), `effect-errors/`, `analytics/`, `ui/`.

## Top-level commands

`version`, `whoami`, `login`, `logout`, `signup`, `upgrade`, `init`, `install`, `dev`, `proxy`, `run`, `listen`, `artifacts`, `generate {ts|py}`, `agent {signup|login|whoami|inbox|claim}`, `config`, `connections list`, `connected-accounts ...`, `auth-configs ...`, `toolkits ...`, `tools ...`, `triggers ...`, `orgs ...`, `projects ...`, `logs ...`. Help verbosity: `-h` / `--help` / `--help-full`. `composio agent` is the unattended-agent auth path; `composio login` is the interactive browser flow.

API keys: keyring-backed via `@composio/cli-keyring` (migrated from plaintext). Cache files stay in `~/.composio/`: `toolkits.json`, `tools.json`, `tools-as-enums.json`, `trigger-types.json`.

## Output conventions (composable CLI)

Unix split between data and decoration:

- **stdout** — data only via `ui.output(value)`. No-op when stdout is a TTY; writes raw value when piped.
- **stderr** — all decoration: `ui.intro/outro/note/log.*`, Clack spinners. Suppressed when piped (gated on `process.stdout.isTTY`).

Rules: never write data to stderr; never write decoration to stdout. `composio whoami | pbcopy` must be silent and capture only the key. Action commands (logout, upgrade) produce no stdout. Data commands (whoami, version, login, generate) call both `ui.output()` and decoration helpers — only one is ever visible at a time.

## Effect.ts patterns

`Effect.gen(function* () { … yield* svc; yield* Effect.log(…) })`. Use `Effect.all([...], { concurrency: 'unbounded' })` for parallel fetches, `Layer.provide()` for composition, `Effect.mapError`/`catchTag` for typed errors, `Effect.scoped` for cleanup.

## Vendored references (read-only)

- `ts/vendor/effect/packages/{effect,cli,platform}/src/` — Effect runtime, `@effect/cli`, `@effect/platform`
- `ts/vendor/clack/packages/{prompts,core}/src/` — high-level prompts (`text`, `select`, `spinner`, …) + low-level primitives. CLI uses `S_BAR`, `S_BAR_H`, `unicodeOr` for box-drawing.

Never edit files under `ts/vendor/`; real deps come from npm.

## VHS recordings

New commands should ship a recording. Add to `recordings/recordings.yaml` (fields: `name`, `command`, `description`, `sleepAfterEnter`, `height` — use `dynamic` for long output). Run `bun scripts/record.ts` (needs `vhs` on PATH + `COMPOSIO_API_KEY`). Output: `recordings/{tapes,svgs,ascii}/<group>/<name>.{tape,svg,ascii}`.

## Release workflow

- **Beta (automatic)**: pushes to `next` touching `ts/packages/cli/**` trigger `.github/workflows/build-cli-binaries.yml` — bumps from latest stable `X.Y.Z` to `X.Y.(Z+1)-beta.<run_number>`, builds linux/darwin × x64/aarch64 binaries, publishes a GitHub prerelease. Users install with `composio upgrade --beta`. Manual from any branch: `workflow_dispatch` → `build-beta`.
- **Stable (changeset-driven)**: open a Changeset PR (`.changeset/<name>.md` with `"@composio/cli": patch`), merge to `next`. The bot opens a "Release: update version" PR; merging it triggers a stable build (`@composio/cli@X.Y.Z`, `latest`) and `ts.release.yml` publishes to npm. Promote an existing beta via `workflow_dispatch` → `promote-stable` with the beta tag.

Key workflows: `.github/workflows/build-cli-binaries.yml`, `ts.release.yml`, `cli.test-installation.yml`. Changeset config: `.changeset/config.json`.

## CLI design guidelines

`.cursor/rules/cli-design-guidelines.mdc` and `.claude/skills/create-cli/SKILL.md`.
