# AGENTS.md

Instructions for AI agents working on `@composio/cli`. The sibling `CLAUDE.md` is a symlink to this file.

The CLI's vocabulary (command trees, acting user, expected failure, …) is defined in [`GLOSSARY.md`](GLOSSARY.md); use its terms.

## Required Checks

When you touch CLI code (anything under `ts/packages/cli/src/`), run `pnpm typecheck` from the repo root before pushing. Fix all type errors. Build/lint failures block CI. Also run `pnpm --filter @composio/cli run lint:effect`, which runs the Effect language service over `src/` and `test/` and fails on its error-level diagnostics; the main one is `floatingEffect`, an Effect that is created and never yielded (a dropped `client.…(...)` call compiles and silently sends nothing). CI runs it in the typecheck workflow.

This package pins its `typescript` dependency to TypeScript 6 (`catalog:ts6` in `package.json`) because `src/generation/typescript/*` drives the JS compiler API, which TS7 (tsgo) does not ship. The pin only affects `import ts from 'typescript'` resolution — the `tsc` binary the typecheck scripts invoke still comes from the workspace root (TS7), since the TS6 alias package only ships a `tsc6` bin. Keep the pin until the generation pipeline moves off the compiler API.

## Architecture

The CLI is built on the **Effect.ts ecosystem** and runs on **Bun**. Service-oriented architecture with dependency injection via Effect layers, generator-based control flow (`Effect.gen`), and structured error handling.

### Entry Point — `src/bin.ts` / `src/cli-main.ts`

`bin.ts` is a thin bootstrap: it routes background-worker invocations (analytics dispatch) through a minimal layer set and otherwise passes argv unchanged to the dynamically imported `cli-main.ts`, which composes the full Effect layer stack and drives the root command through `effect/cli`'s `Command.runWith`, run via `BunRuntime.runMain()`. Key layers (see `cli-main.ts` for the complete list):

- `CliConfigLive` — `effect/cli` `CliConfig` restricted to `builtIns: [Help, GlobalFlag.Version]` (see Configuration below); a small `CliOutput.Formatter` keeps versions bare and appends a short root overview; Effect generates command help and parse errors
- `ComposioUserContextLive` — User authentication state from `~/.composio/`
- `ComposioSessionRepositoryLive` — OAuth2 session management
- `ComposioToolkitsRepositoryCachedLive` — Cached API client for toolkits/tools
- `UpgradeBinaryLive` — Self-update from GitHub releases
- `BunFileSystem.layer`, `BunPath.layer`, `BunServices.layer`, `FetchHttpClient.layer` — Bun runtime integration (`@effect/platform-bun`'s `BunContext` no longer exists in v4; `BunServices.layer` is the aggregate replacement)

Explicit help and version actions complete successfully. `Command.runWith` renders parse/validation errors and contextual help itself before re-failing with `CliError.ShowHelp`, which carries `[Runtime.errorReported] = false` (suppresses `runMain`'s automatic error log) and `[Runtime.errorExitCode]` (1 alongside parse errors). `cli-main.ts`'s sandboxed catch-all re-fails every failure already on screen (`[Runtime.errorReported] = false`, `ShowHelp` included) with its original `Cause` via `Effect.failCause` instead of printing it, and `BunRuntime.runMain` runs with `Runtime.defaultTeardown`: exit 0 on success, 130 on interruption (Ctrl-C, SIGTERM), otherwise the squashed failure's `[Runtime.errorExitCode]`, or 1 without one. This preserves failing exit codes without duplicate error output. Never assign `process.exitCode`; an error that needs a code other than 1 declares it (`ChildProcessExited` in `src/effects/child-process-exited.ts`, which `composio run` fails with when its script exits non-zero). See the module docstring at the top of `cli-main.ts` for the argv-prefix contract with `src/commands/index.ts`.

Errors are captured via the custom `effect-errors/` module (source-mapped stack traces, Effect span timelines, formatted output).

### Commands — `src/commands/`

Each command uses `effect/cli`'s `Command.make()` pattern. Current top-level commands:

| Group / Command | Purpose |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `version` | Display CLI version |
| `whoami` | Show logged-in user info (writes raw API key to stdout when piped — see Output Conventions) |
| `login` | Login with browser redirect or direct user/API key (`--no-browser`, `--no-wait`, `--key`, `--user-api-key`, `--org`) |
| `logout` | Clear stored API key |
| `signup` | Create a Composio account |
| `upgrade` | Self-update binary from GitHub releases |
| `init` | Bootstrap a Composio project in the current directory |
| `install` | Set up shell integration (PATH and completions) |
| `generate {ts        | py}` | Generate type stubs (auto-detects project language if no subcommand) |
| `agent` | Manage AI agent presets |
| `toolkits` | List / inspect / version toolkits |
| `tools` | List / inspect / `execute` tools |
| `triggers` | List / manage trigger types |
| `auth-configs` | Manage auth-config resources (`ac_*`) |
| `connected-accounts` | Manage connected accounts (`ca_*`) |
| `connections` | Alias / helper for connected-account flows |
| `orgs` | Manage organizations |
| `projects` | Manage projects |
| `logs` | View tool-execution logs |
| `config` | Read/write CLI config |
| `listen` | Listen for events |
| `proxy` | Proxy authenticated API requests |
| `run` | Run a saved script / preset |
| `dev` | Developer-only utilities |
| `artifacts` | Manage generated artifacts |

Named options use `Flag.String()`, `Flag.Boolean()`, `Flag.Int()`, `Flag.Literals()`, `Flag.Directory()` (from `effect/cli`); positionals use `Argument.String()` / `Argument.variadic()`. Both share `.withDefault`/`.withDescription`/`.withAlias`/`.optional` combinators. Feature flags live in `feature-tags.ts` and `experimental-features.ts`.

#### Command module layout

Every command is a directory named after the command, holding files that share the command's dotted basename. A group is a directory named after the group, whose entry file `<group>.cmd.ts` only lists subcommands.

```
src/commands/
  index.ts                              root command tree, argv contract with cli-main.ts
  $default.cmd.ts                       root command: shared flags and description
  errors.ts                             CommandInputError, the one usage error every command raises
  surface.ts                            CommandSurface: the tree a command runs in, the dev group's shared flags, the acting user
  <group>/<group>.cmd.ts                group entry: Command.make(name) + withSubcommands, nothing else
  <group>/<name>/<group>.<name>.cmd.ts  flags, arguments, description, examples, Command.make
  <group>/<name>/<group>.<name>.handler.ts   (params) => Effect; imports nothing from effect/cli
  <group>/<name>/<group>.<name>.format.ts    human renderer (stderr) and machine renderer (stdout)
  <group>/<name>/<group>.<name>.errors.ts    command-owned Data.TaggedError classes with structured fields, when any; usage errors use errors.ts
  <group>/<shared-module>.ts            helpers used by several commands of the group (triggers/parse.ts)
  <name>/<name>.cmd.ts                  a top-level command follows the same shape without a group
```

Rules:

- `<group>.<name>.cmd.ts` declares the surface and nothing else: flag and argument constants, `Command.withDescription`, `Command.withExamples`, and the three-argument `Command.make(name, flags, handler)` with the handler imported from the sibling `.handler.ts`. It yields no service and contains no branching. `Command.withHandler` is reserved for `src/commands/index.ts`, where the root handler is attached at assembly time.
- `<group>.<name>.handler.ts` exports the handler as a function of a plain params type it declares itself; the command proves it provides those params when it passes the handler to `Command.make`. Do not derive the params type from the `Command` value (no phantom commands, no `GetCmdParams`).
- A command that exists in both the root tree and the `dev` tree is defined once. The group supplies what differs between the two surfaces through `Command.withSharedFlags` and `Command.provide`, not through a second `Command.make` with a copied description. `--user-id` and `--project-name` are shared flags of the `dev` group (`dev.cmd.ts`), accepted before or after the subcommand name and documented once on every `dev` page; a handler reads them, and the tree it runs in, from `CommandSurface` (`surface.ts`) and never declares either flag itself, since `withSharedFlags` rejects a duplicate on a direct subcommand. A `dev` command that cannot honor one of them yet (it cannot target another project, or it does not act for a user) pipes `rejectsSharedFlags` (`surface.ts`), and the `dev` group's own `--mode` toggle calls `rejectSharedFlags`, so the flag fails with a `CommandInputError` instead of being ignored. `execute` and `playground-execute` keep two registrations because their names differ; they share one handler.
- A handler that acts as a user gets it, and the project it was resolved against, from `actingUser` (fails with `MissingActingUserError`, an expected failure whose message fits the tree) or `actingUserOption` (for a command that also runs without one) in `surface.ts`; both name a fallback test user on stderr. A handler never reads `--user-id` or a test user id to resolve one itself, never prints that notice, and lets `MissingActingUserError` through instead of wrapping it in its own error (its tag is the `error_name` telemetry reports). An empty consumer user id counts as none. A `--user-id` that only filters results (`dev logs`, `dev triggers listen`, `dev connected-accounts list`) stays a raw flag.
- Logic shared across groups belongs in `src/effects/` or `src/services/`, never in another command's directory.
- A command that needs a logged-in user pipes `requireLogin` (`src/effects/require-auth.ts`) on itself or on its group entry, after `Command.withSubcommands`. Handlers never check `apiKey` or print a login hint; a missing login fails with `NotLoggedInError` and exits 1. Project context comes from `resolveCommandProject`, which fails with `ProjectResolutionError`; never flatten it into a plain `Error`.
- A group entry is recognised by its place in the tree: `<dir>/<dir>.cmd.ts` or `<dir>/root-<dir>.cmd.ts` with other `.cmd.ts` files below `<dir>/`. The same name with nothing below it (`logout/logout.cmd.ts`) is a top-level command. Every command needs a test; a group entry does not, though one with a default action (`generate`) still gets one.

Legacy shape still present while commands migrate: `<group>/commands/<group>.<name>.cmd.ts` holding flags, handler, helpers, and errors in one file, and top-level `<name>.cmd.ts` doing the same. Migrate a command to the directory shape when you touch it for more than a one-line fix, one command per PR.

#### Test layout

Tests mirror `src/commands/` under `test/src/commands/`, with the legacy `commands/` path segment removed:

```
test/src/commands/<group>/<name>/<group>.<name>.cmd.test.ts        argv-level: cli([...]) over TestLive
test/src/commands/<group>/<name>/<group>.<name>.handler.test.ts    handler-level: Service.of doubles, no argv
test/src/commands/<group>/<name>/<group>.<name>.<aspect>.cmd.test.ts   extra suite for one aspect (.client. for API-shape coverage)
test/src/commands/<group>/<shared-module>.test.ts                  group helper tests (triggers/format.test.ts)
```

`pnpm run validate:command-tests` (part of `pnpm test`, CI-blocking, `scripts/validate-command-tests.ts`) fails when a command has no `.cmd.test.ts` at its mirrored path, when a `.cmd.test.ts` does not resolve to a command by its longest dotted basename prefix, or when a listed exemption has gained its test. Commands without a test today are listed in the script with a reason; the list only shrinks. Write the missing test in the PR that migrates the command.

### Services — `src/services/`

| Service                            | Purpose                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `ComposioUserContext`              | Auth state — reads/writes `~/.composio/user-config.json`, merges env vars                          |
| `ComposioClientSingleton`          | Builds an `@composio/client/effect` client per lookup for a key, org, and project; counts requests |
| `ComposioSessionRepository`        | Creates OAuth2 sessions, polls until `linked` state                                                |
| `ComposioToolkitsRepository`       | API client — fetches toolkits, tools, trigger types; validates versions                            |
| `ComposioToolkitsRepositoryCached` | Decorator over base repository with file-based caching and graceful fallback                       |
| `NodeOs`                           | OS abstraction (`homedir`, `platform`, `arch`)                                                     |
| `JsPackageManagerDetector`         | Detects npm/pnpm/yarn/bun for install instructions                                                 |
| `UpgradeBinary`                    | Fetches latest release from GitHub, downloads and replaces binary                                  |
| `DashboardToolExecution`           | Sends consumer `composio execute` calls to the Composio Dashboard and decodes its reply            |

Every Composio API request goes through an Effect client from `@composio/client/effect`, obtained from `ComposioClientSingleton` (`src/services/composio-clients.ts`). Clients are built with `make`, which never reads the ambient environment: the user key and base URL come from the CLI's own configuration. Each client is built with the CLI's `identity` (`cliClientIdentity()` in `client-provenance.ts`, from which the client sends the provenance headers and which makes it refuse them in `defaultHeaders` and per-call `headers`), `auth` (`Auth.user` with the user key, `Auth.project` when a caller passes `projectApiKey`, `Auth.none()` before login), `scope` (the org and project, when both are known), `x-cli-session-id` as the one default header (read once per process), and a counting `fetch` (`composio-client-metrics.ts`) provided as the transport's `FetchHttpClient.Fetch`. Explicitly configured HTTP base URLs remain supported without an additional environment flag. The client's deprecation notices, which CLI users cannot act on, are dropped by the root logger (`withoutClientNotices`, `src/effects/without-client-notices.ts`, through the client's `isDeprecationNotice`). `composio-clients.ts` holds client construction, the two repositories, and the `collectAll` and `sortBySlug` helpers the catalog fetches share. The repository's auth-config, connected-account, trigger-instance, search, and single-item methods live in `src/services/composio-resource-operations.ts`; the account helpers (`listOrganizations`, `getSessionInfo*`, `resolveConsumerProject`, `createProjectApiKey`, `getLatestToolVersion`, …) in `src/services/composio-account.ts`; toolkit version validation and its errors (`InvalidToolkitsError`, `InvalidToolkitVersionsError`) in `src/services/toolkit-version-validation.ts`; the shared error types (`ClientError`, `HttpDecodingError`, `ComposioClientConfigurationError`) in `src/services/composio-errors.ts`; and the shared `decode` helper and `validated` request option in `src/services/composio-request.ts`. There is no CLI error wrapper around a request: the client's tagged errors (`@composio/client/NotFoundError`, `APIConnectionError`, `DecodeError`, …) flow to callers, which recover with `Effect.catchTag` or the client's `isAPIError` guard. Commands that report an API failure with a hint and exit 1 share one handler, `handleClientApiError` (`src/effects/handle-http-error.ts`), applied with `Effect.catchTag(CLIENT_API_ERROR_TAGS, …)`; it never succeeds, so the command reads the request's result straight through; the tag list lives in `src/services/composio-errors.ts`. Endpoints the client does not type use the raw `client.get`/`client.post`; `src/services/tool-permissions.ts` reaches them through its own `requestJson`, which raises `services/ToolPermissionsRequestError` because its callers fail closed on that tag. Do not add a raw `fetch` to the Composio backend from `src/commands`, `src/effects`, or `src/services` — the one sanctioned exception is the bundled companion runtime (`run-helpers-runtime.ts`), which runs in the user's spawned process outside the Effect runtime. (`src/services/agents.ts` also calls `fetch`, against the agents service at agents.composio.dev rather than the Composio backend.) The Composio Dashboard (`ComposioUserContext.data.webURL`) is the one first-party host the CLI calls without `@composio/client`: `src/services/dashboard-tool-execution.ts` sends consumer `composio execute` calls (tool and meta-tool executions) to it over `HttpClient` from `effect/http`, once, with no retry, no redirect following and one 15-minute deadline, only to an `https:` base URL (or loopback `http:`) that carries no credentials, query or fragment, and fails a relayed backend failure with the client's own status error (`@composio/client/PermissionDeniedError`, …) so the classification below still applies. While telemetry is enabled, those requests (and only those) also carry the stored analytics install ID as `x-cli-install-id`, read through `readInstallIdWhenTelemetryEnabled` in `src/analytics/dispatch.ts`, which never creates an ID and never fails; do not add the header to backend requests or to `cliRequestHeaders()`. Everything else on the execute path (connection lookups, the permission gate, file uploads) and `dev playground-execute` stay on the backend client. Do not route other commands through the Dashboard, and do not add a second raw-HTTP host, without updating this paragraph. oxlint rejects value imports of the `@composio/client` root and `@composio/client/pagination` from CLI `src/`; type-only imports are allowed. The CLI's clients send every request once. A call that is safe to repeat — a read, or a call whose repeat changes nothing on the server — passes the `idempotent` request option (`src/services/composio-request.ts`) and is retried by the client after a connection failure, a timeout, or a 408, 409, 429 or 5xx response; combine it with `validated` as `{ ...idempotent, ...validated }`. Creates, updates, deletes, links, sessions, tool executions and proxied calls never pass it, because a request that failed in flight may already have acted. It also rejects importing `make` or the client layers from `@composio/client/effect` anywhere but `composio-clients.ts`, and `getFor` takes an org and a project together or neither, because the two headers are only sent as a pair. Every `getFor` builds a new client, so never key a memo on a client instance: `clientScopeKey(client)` gives its auth mode, a SHA-256 fingerprint of its credential (never the key), org, and project (`listActiveConnectedAccounts` keys on it and the user id). While a client has `auth` and `scope`, a per-call `x-api-key`, `x-user-api-key`, `x-org-api-key`, `x-org-id` or `x-project-id` header fails the call before it is sent; an org or project known alone goes on an unscoped client's request, as `orgScopedOptions` and `getLatestToolVersion` do. Client errors are classified for display by `src/utils/api-error-extraction.ts`.

Services are `Context.Service` classes that export a `<Name>Shape` type and an explicit `static readonly Default` layer (`Layer.effect` / `Layer.sync`, dependencies provided with `Layer.provide`). Build a test double with `Service.of({ ... })`; there are no generated accessors or constructors.

OS credential storage uses the sibling package `@composio/cli-keyring` (macOS Keychain / Linux Secret Service).

### Effects — `src/effects/`

Reusable Effect computations: `require-auth` (`requireLogin`, the login gate for commands and groups), `setup-cache-dir`, `toolkit-version-overrides` (maps `COMPOSIO_TOOLKIT_VERSION_<NAME>=<ver>` pins to toolkit slugs), `validate-toolkit-versions`, `with-log-level`, `find-composio-core-generated`, `version`, `compare-semver`, `log-metrics`.

### Models — `src/models/`

Effect Schema definitions with `fromJSON` / `toJSON` helpers via `JSONTransformSchema()`: `Toolkit`, `Tool`, `TriggerType`, `UserData`. `Session` is a schema only, decoded from the API.

### Code Generation — `src/generation/`

Pipeline for `composio generate {ts,py}`:

1. **Fetch** — Toolkits, tools, trigger types (filterable via `--toolkits`)
2. **Index** — Groups by toolkit prefix into `ToolkitIndex`
3. **Generate** — Builds TS/Python source using `@composio/ts-builders` AST builders
4. **Transpile** — Optionally converts TS → ESM JS for `@composio/core/generated`

`--type-tools` includes full type definitions.

Steps 3–4 (and the TypeScript compiler they need) ship as the `generation-runtime` companion module — `dist/generation-runtime.mjs` next to the executable, not inside it. Commands reach it through `loadInstalledCompanionModule` (`src/services/run-companion-modules.ts`), never by importing `src/generation/*`, `src/commands/run-source-transforms.ts`, or `typescript` directly: the binary build fails if the executable's bundle reaches any of those (`assertExecutableExcludesCompanionModules` in `scripts/_shared.ts`). A companion bundles its own copy of `effect`, so its API is plain functions and promises; failures cross as values that `src/generation/errors.ts` turns back into the CLI's error classes.

### Configuration

- CLI: `cli-config.ts` enables help and version global actions. `commands/root-help.ts` derives the native `help` command tree and delegates documents to Effect. The formatter keeps version output bare and appends a short root overview. Hidden debug settings use `Flag.withHidden`; the diagnostic group uses `Command.unlisted` (the pinned framework's hidden-command API). `commands/argv-compat.ts` preserves optional `listen --stream` values and inserts the native `--` boundary for legacy undelimited `run` script arguments. Effect parses the script tail through `Argument.variadic`; never strip its flags. `setup skill` installs agent skills; `--dangerously-allow` is local to `dev triggers disable`.
- Environment: `src/config/` declares every variable the CLI reads under its full name, grouped into `APP_CONFIG` (user-facing `COMPOSIO_*`, see the README), `DEBUG_CONFIG`, `TELEMETRY_CONFIG`, `HOST_CONFIG` (shell, CI, agent host), and `GITHUB_CONFIG`. Values flow through the ambient `ConfigProvider` (the process environment by default; tests provide `ConfigProvider.fromEnvRecord`). Read a variable through its catalog, never with an inline `Config.String('COMPOSIO_…')`. The backend URLs follow one rule, `resolveBackend` (`src/config/backend.ts`): `COMPOSIO_BASE_URL` or `COMPOSIO_ENVIRONMENT` when set, else the backend the stored login recorded, else production. Read them from `ComposioUserContext` (`ctx.data.baseURL`, `ctx.data.webURL`), not from `APP_CONFIG.BASE_URL`/`WEB_URL`, which hold only the env-selected values; only `ctx.login` records a login's backend.
- User config: `~/.composio/user-config.json`
- Cache files: `toolkits.json`, `tools.json`, `tools-as-enums.json`, `trigger-types.json`

### Key Dependencies

`effect` (pinned `4.0.3`; `@effect/cli` and `@effect/platform` no longer exist as separate packages — folded into `effect`'s barrel and `effect/{cli,http,process}`), `@effect/platform-bun`, `@effect/vitest` (same exact pin), `@clack/prompts` (terminal UI — stderr by default), `picocolors`, `@composio/client` (owned Composio API client, `2.0.0-rc.22` via the workspace catalog; the CLI calls it through the `@composio/client/effect` entry point and imports only types from the rest of the package), `@composio/core` (types), `@composio/ts-builders` (AST gen), `@composio/cli-keyring` (OS credential store), `@composio/json-schema-to-effect-schema`, `semver`, `open`, `extract-zip`.

## Output Conventions: Composable CLI Output

Follow the Unix convention of separating human-readable decoration from machine-readable data:

- **stdout** — data only (`ui.output()`). Captured by pipes / `$(...)` / `> file`.
- **stderr** — all decoration (Clack spinners, logs, notes, intro/outro). Visible in terminal, invisible in pipes.

The three streams are **independent contracts**. Each capability depends only on the streams that actually serve it — there is deliberately no aggregate "interactive" flag (`TerminalCapabilities` in `src/services/terminal-ui.ts`):

- **Prompting** (`canPrompt`) = `stdin.isTTY && stderr.isTTY`. stdin must accept input and stderr must display the Clack prompt. stdout is irrelevant: piping data must never change prompting or authentication behavior — `composio login | tee` behaves exactly like an attended login.
- **Machine output** = `!stdout.isTTY`. `ui.output(data)` writes only when stdout is redirected (pipe, subshell, file), or when the caller passes `{ force: true }`. Redirecting stdin or stderr must never make data leak onto a visible stdout terminal.
- **Decoration** (`canDecorate`) = `stderr.isTTY`. Spinners, logs, and notes only need stderr, so they still render when stdin or stdout is redirected.

Rules:

1. All `TerminalUI` methods **except `output()`** write to stderr via Clack's `{ output: process.stderr }`, and only when stderr is a TTY (`canDecorate`).
2. `ui.output(data)` writes to stdout **only when stdout is piped** (or with explicit `force`). No other stream participates in that decision.
3. Prompts (`ui.confirm`, `ui.select`) run only when `canPrompt`; otherwise they fall back to their defaults without blocking.
4. Piped stdout stays clean: `composio whoami | pbcopy` puts only the key in the clipboard — decoration still renders on the terminal via stderr, and is suppressed only when stderr itself is captured.
5. **Data commands** (whoami, version, login, generate, etc.) call both decoration (stderr) and `ui.output()` (stdout).
6. **Action commands** (logout, upgrade) produce no stdout data — output is purely decorative.
7. **Never** write data to stderr or decoration to stdout, and never branch program behavior (auth paths, command flow) on stdout's TTY state.

When adding a new command: ask "Does this produce a value scripts should capture?" — yes → `ui.output(value)` + `ui.log.*`/`ui.note()`. No → decoration only.

## Effect.ts Patterns

Generator-based syntax throughout:

```typescript
Effect.gen(function* () {
  const service = yield* ServiceName; // resolve dependency
  const result = yield* someEffect; // await computation
  yield* Effect.log('message');
  return result;
});
```

Key patterns: `Effect.all([...], { concurrency: 'unbounded' })` for parallel work, `Layer.provide()` for dependency composition, `Effect.mapError()` / `Effect.catchTag()` for typed errors, `Effect.scoped` for resource cleanup.

For table-driven tests over independent finite choices, build a typed Cartesian product
with plain `flatMap`/`map` instead of enumerating every case or writing loops (do
notation is lint-banned, tests included):

```typescript
const cases = pipe(
  firstChoices,
  Arr.flatMap(firstAxis =>
    pipe(
      secondChoices,
      Arr.map(secondAxis => ({ firstAxis, secondAxis }))
    )
  )
);
```

Each nested `Arr.flatMap` adds one independent axis; the innermost `Arr.map` builds the case.

### Effect safety and migration boundaries

- Never branch on an Effect value's internal tag field directly. Use the owning module's public refinement or matcher (`Option`, `Result`, `Exit`, `Cause`, `CliError`), `Match.valueTags` for exhaustive unions, or `Predicate.isTagged` for a single narrowing guard.
- Do not wrap a plain `Error` in `Effect.fail` for expected failures. Give the failure a meaningful `Data.TaggedError` type with structured fields and a preserved cause, then recover with `catchTag` / `catchTags`. Reserve `Effect.die` and `Effect.dieMessage` for impossible invariants.
- Treat `unknown`, JSON, and persisted state as trust boundaries. Decode them with `effect/Schema` or narrow them with `Predicate`; an `as` assertion is not validation, and hand-rolled structural guards (`'x' in obj` / `typeof` chains) are not a substitute for a schema. Each typed API response is validated at most once. The CLI's own schema validates a response the CLI transforms, filters for stdout, or writes to a cache file: the catalog models (`src/models/toolkits.ts`, `tools.ts`, `trigger-types.ts`), the auth-config and connected-account allowlists that keep credential-bearing fields off stdout (including the list responses and the `auth-configs create` response in `src/models/auth-configs.ts` and `connected-accounts.ts`), the `ToolkitSlug` path-safety check, the `Session` `DateTime` transform, and `TriggerInstanceItems`. Those calls decode with the CLI schema, failing with `services/HttpDecodingError`. The client validates a response against its own generated schema only when the call passes the `validated` request option (`src/services/composio-request.ts`); a mismatch fails with the client's `DecodeError`, which the CLI reports with the operation, the request id, and an upgrade hint. Pass `validated` only on a read the CLI consumes whole through the client's types, where no field may drift: `cli.realtime.credentials` (every field feeds the realtime connection), `org.list` (organization ids and names for login), and `org.consumer.listConnectedToolkits` (a list of slugs). Every other typed call leaves it off: calls that are not reads, because failing after the server acted would invite a retry that repeats the side effect; reads the CLI validates with its own schema; and reads that must tolerate drift because the CLI consumes a few fields of a response whose client schema fixes enums or requires fields the CLI never reads (`logs.tools.*`, `logs.triggers.*`, `tools.list`, `tools.retrieve`, `org.project.list`, `toolRouter.session.search`, `toolRouter.session.toolkits`, `connectedAccounts.list`, which tolerates unknown statuses, and `triggerInstances.listActive`, whose page counts the CLI defaults). Adding a validated read means saying in its doc comment why the CLI cannot tolerate drift there. Responses fetched with the raw `client.get`/`client.post` are untyped and always need a CLI schema (`LatestToolVersionResponse` in `src/models/tools.ts`, and the consumer config and permission payloads in `tool-permissions.ts`). `effect/Schema` is the CLI's schema tool — do not introduce zod here (zod is the convention in the SDK packages and docs).
- Do not inspect private `effect/cli` internals (parser state, `HelpDoc` string shapes, `CliError` suggestion machinery). `Command.runWith` renders help and parse/validation errors itself — see the entry-point section above — so command-tree introspection must stay on the public `Command.Any` surface (`name`, `alias`, `subcommands`). `CliError.InvalidValue` takes structured `{ option, value, expected, kind }` fields, not a free-form message — handler-level validation raises `CommandInputError` from `src/commands/errors.ts` (built with `commandInputError('<command>')`, carrying `command`, `message`, and the `option` at fault), not a hand-built `CliError`. It, `NotLoggedInError`, `ProjectResolutionError`, `ConnectedAccountResolutionError` (an `--account` selector that matches no connected account, or the account lookup behind it failing), and the other expected failures (a missing user id, login, or SDK install; an unknown org, toolkit, or version) declare `get [ExpectedFailure]() { return true; }` from `src/effects/expected-failure.ts` where the class is defined; `isUsageFailure` in `errors.ts` checks that marker, and `cli-main.ts` prints the message and exits 1, with no defect banner. A new expected error opts in the same way, with no central list to update; a defect stays unmarked. A failure the command prints itself fails already reported: `reportFailure` (`src/effects/report-failure.ts`) prints a message and hint, then fails with `ReportedFailure`; a command that prints more after the message calls `printFailure`, prints the rest, then fails with `ReportedFailure`. A command-specific error the command already printed (`ReportedToolExecutionError` and `ReportedProxyCommandError`, whose result is on stdout as `{ "successful": false }`, `ShellSetupAbortError`, `SetupCommandError`) declares `get [Runtime.errorReported]() { return false; }` and `get [Runtime.errorExitCode]() { return 1; }` where the class is defined. Either way the runtime prints nothing more and exits 1, and telemetry records the command as failed.
- Prefer `Effect.mapError`, `Effect.matchEffect`, and typed recovery over `Effect.catch` blocks (the v4 name for what was `Effect.catchAll`) that flatten distinct failures into one message-only error.

### Effect Boundary Policy

All platform access goes through Effect services. `node:path`, `node:fs`, `node:os`, `node:child_process`, `process.env`, and `try`/`catch` are lint-banned (oxlint) in `src/`. Use the sanctioned equivalents:

| Need                                                          | Use                                                                                                                                |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Path arithmetic (join/resolve/dirname/…)                      | `Path` service from `effect/Path` (`const path = yield* Path.Path`)                                                                |
| Filesystem I/O                                                | `FileSystem` service from `effect/FileSystem` (`const fs = yield* FileSystem.FileSystem`)                                          |
| homedir / tmpdir / platform / arch                            | `NodeOs` service (`src/services/node-os.ts`, the sole `node:os` boundary)                                                          |
| Subprocesses                                                  | `ChildProcess` / `ChildProcessSpawner` from `effect/process`; children that outlive the CLI via `src/services/detached-process.ts` |
| Environment reads                                             | `effect/Config`                                                                                                                    |
| Sync fallible ops (`JSON.parse`, `new URL`, `JSON.stringify`) | `Result.try` with a `Data.TaggedError`; JSON records via `parseJsonRecord` (`src/utils/parse-json.ts`)                             |

Import platform modules by subpath (`import * as FileSystem from 'effect/FileSystem'`, `import * as BunFileSystem from '@effect/platform-bun/BunFileSystem'`), never from the `@effect/platform-bun` package barrel; oxlint rejects the barrel in `src/`.

Conversion patterns, in order of preference:

1. Yield the service inside existing Effect code.
2. Convert a plain helper into an Effect when its callers are Effect-hosted (a `Result` is not an `Effect` in v4 and cannot be yielded directly, even though the type checker accepts it: lift it with `Effect.fromResult(...)` inside `Effect.gen`).
3. Pass the resolved service instance (e.g. `Path.Path`, `FileSystem.FileSystem`) as a plain parameter into sync callbacks or promise pipelines that cannot become Effects (see `tool-permissions.ts`, `generation/typescript/virtual-compiler-host.ts`).
4. Modules that self-provide layers add `BunPath.layer` / `BunFileSystem.layer` / `NodeOs.Default` to their stack instead of reaching for Node builtins.

The only code allowed to bypass services sits at declared runtime boundaries: the `bin.ts` bootstrap, the child-process companion runtime (`run-helpers-runtime.ts` — bundled into a `.mjs` file that runs in the user's spawned process), import-time UI setup (`ui/colors.ts`, `ui/redact.ts`), environment **writes** and whole-environment enumeration (which `effect/Config` cannot express), and spawn-time env handshakes between parent and child `composio run` processes. Every such boundary is an inline `// eslint-disable-next-line <rule> -- <reason>` comment registered in `lint-boundaries.json`. (oxlint honors both the `eslint-disable` and `oxlint-disable` spellings; only `eslint-disable-next-line` is sanctioned here, and the boundary validator rejects `oxlint-disable` comments in `src/`. The restricted-syntax rule ships from a JS plugin, so its disables name it `eslint-js/no-restricted-syntax`.)

**Enforcement**: `pnpm run validate:boundaries` (part of `pnpm test`, CI-blocking) fails when any eslint-disable in `src/` is missing from the manifest, lacks a `-- reason`, or uses a file-wide form. Do not add new disables — thread the service instead. If code genuinely cannot run inside the Effect runtime, that is a new boundary: regenerate the manifest with `pnpm run validate:boundaries -- --update` and justify the boundary in the PR.

## Vendor Reference Sources

Read-only submodules under `ts/vendor/`, pinned at the `effect@4.0.3` release commit (do NOT modify — actual deps come from npm). v4 folded `@effect/cli`/`@effect/platform` into the core `effect` package, so there is no longer a separate `packages/cli` or `packages/platform` — everything lives under `packages/effect/src/`:

- `ts/vendor/effect/packages/effect/src/` — core Effect runtime (`Effect`, `Schema`, `Layer`, `Context`, `Result`, `Cause`, `Config`, `FileSystem`, `Path`, `PlatformError`, …)
- `ts/vendor/effect/packages/effect/src/cli/` — `effect/cli` (`Command`, `Flag`, `Argument`, `CliError`, `CliConfig`, `CliOutput`, `GlobalFlag`, `HelpDoc`, `Completions`, `Prompt`)
- `ts/vendor/effect/packages/effect/src/http/` — `effect/http` (`HttpClient`, `HttpClientRequest`, `HttpClientResponse`, `FetchHttpClient`)
- `ts/vendor/effect/packages/effect/src/process/` — `effect/process` (`ChildProcess`, `ChildProcessSpawner`)
- `ts/vendor/effect/packages/platform/bun/src/` — `@effect/platform-bun` (`BunFileSystem`, `BunPath`, `BunServices`, `BunRuntime`, `BunChildProcessSpawner`, …)
- `ts/vendor/effect/migration/` — official v3-to-v4 migration guides (`services.md`, `schema.md`, `cause.md`, `runtime.md`, `v3-to-v4.md`, …)
- `ts/vendor/clack/packages/prompts/src/` — `@clack/prompts` (text, select, confirm, spinner, note, task, etc.)
- `ts/vendor/clack/packages/core/src/` — `@clack/core` primitives

## CLI Design Guidelines

Principles for arguments, flags, help, output, errors, interactivity, configuration, and exit codes:

- Use the repo-local `cli-command` skill for command design, implementation, Effect patterns, output conventions, and source-reference guidance.
- Use the repo-local `cli-e2e` skill for Docker-based CLI end-to-end tests under `ts/e2e-tests/cli/`.

Use these when adding new commands or making UX decisions.

## Client Cache Sync

`src/services/composio-clients-cached.ts` spreads the underlying `ComposioToolkitsRepository` and overrides only the methods it caches (`getToolkits`, `getProjectToolkits`, `getToolkitsBySlugs`, `getToolsAsEnums`, `getTriggerTypesAsEnums`, `getTriggerTypes`, `getTools`). Adding a passthrough method to the repository needs no edit there. Edit the cached file in the same change only when a cached method's signature or result changes, or when a new full-catalog fetch should be cached. Validation, search, single-item, and CRUD methods stay passthrough.

## Recording CLI Demos

User-facing CLI commands should ship with VHS recordings (SVG + asciicast) when the command changes a documented workflow, introduces a new visible command surface, or needs demo coverage in release notes. Small internal wiring changes and hidden developer-only helpers can skip recordings if the PR says why. Workflow:

1. Add entry to `recordings/recordings.yaml` (fields: `name`, `command`, `description`, `sleepAfterEnter`, `height: dynamic` for long output).
2. Run `bun scripts/record.ts` — requires `COMPOSIO_API_KEY` and `vhs` on `PATH`.

Outputs land in `recordings/{tapes,svgs,ascii}/<group>/<name>.{tape,svg,ascii}`.

## Release Workflow

Use the repo-local `cli-release` skill before building or publishing first-party CLI binaries.

- A push to `next` touching CLI paths publishes a rolling beta automatically.
- The normal stable path promotes an existing tested beta through the `promote-stable` workflow action.
- `@composio/cli` is ignored by Changesets. Never add a changeset targeting it; it stalls the TypeScript SDK release action. Put human-facing CLI notes in `CHANGELOG.md` directly.
- `package.json` uses a private development sentinel and is never a
  binary-release authority. For an intentional minor or major release,
  dispatch `build-beta` with its optional version input, verify that beta, then
  promote it normally.

### Key Workflow Files

- `.github/workflows/build-cli-binaries.yml` — binary build + release
- `.github/workflows/cli.test-installation.yml` — post-release install smoke tests
- `.github/scripts/cli-release/resolve-release-target.sh` — beta/stable target resolution
- `.changeset/config.json`
