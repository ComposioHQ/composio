# Effect v4 CLI testing

The CLI test suite (`ts/packages/cli/test/`) runs on `effect@4.0.0-beta.99` and
`@effect/vitest@4.0.0-beta.99` (pinned exactly, matching `ts/packages/cli/package.json` and the
workspace catalog in `pnpm-workspace.yaml`). `@effect/cli` and `@effect/platform` no longer exist
as dependencies — their functionality moved into `effect`/`effect/unstable/*`. Read
`ts/packages/cli/test/__utils__/services/test-layer.ts` before writing a new test suite; it is the
canonical example of every pattern below. For source-side v4 conventions (service definitions,
typed errors, the `effect/unstable/cli` command surface) rather than test-specific ones, use the
repo-local `effect-v4` skill.

## Runner APIs

- `it.effect` is the default tester. It runs inside `Effect.scoped` automatically, so a v3-style
  `it.scoped` is unnecessary — the beta.99 `@effect/vitest` still exports `it.scoped` for advanced
  cases, but every suite in this repo uses `it.effect` uniformly; do not reintroduce `it.scoped`.
- `it.live` runs against the real (non-`TestClock`) environment; reach for it only when a test must
  observe real wall-clock behavior.
- Reusable service layers go through `layer(...)`, not manual `Effect.provide` scattered per test:

```ts
import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, pkg, TestLive, MockConsole } from 'test/__utils__';

describe('CLI: composio', () => {
  layer(TestLive())(it => {
    it.effect("[Given] no arguments [Then] prints composio's version from package.json", () =>
      Effect.gen(function* () {
        yield* cli(['version']);
        const lines = yield* MockConsole.getLines();
        expect(lines.join('\n')).toContain(pkg.version);
      })
    );
  });

  const testConfigProvider = ConfigProvider.fromEnv({
    env: { DEBUG_OVERRIDE_VERSION: '1.2.3-test' },
  }).pipe(extendConfigProvider);

  layer(TestLive({ baseConfigProvider: testConfigProvider }))('with config override', it => {
    it.effect('[Given] `DEBUG_OVERRIDE_VERSION` env var [Then] prints overridden version', () =>
      Effect.gen(function* () {
        yield* cli(['version']);
        const lines = yield* MockConsole.getLines();
        expect(lines.join('\n')).toContain('1.2.3-test');
      })
    );
  });
});
```

`TestLive` (exported as `TestLayer` from `test/__utils__/services/test-layer.ts`, re-exported as
`TestLive` from `test/__utils__/index.ts`) takes an optional `TestLiveInput` — `fixture`,
`toolkitsData`, `authConfigsData`, `connectedAccountsData`, `triggersData`, `realtimeData`,
`cliUserConfig`, `stdin`, `toolsExecutor`, `toolRouter`, `commandRunner`, `setupSkillInstaller`,
`terminalUI`, `baseConfigProvider` — and builds the full service graph a CLI invocation needs, with
network calls mocked out. Smaller, module-local suites that only touch one or two services build a
narrower `Layer.mergeAll(...)` inline instead of pulling in the full `TestLive` (see
`test/src/effects/decode-connected-account-list.test.ts`), and unit-level suites that only need a
single service override can pass a bare `Layer.succeed(Service, {...})` straight into
`Effect.provide` (see `test/src/effects/detect-platform.test.ts`).

## Explicit test layers, not `.Default`

v4's `Context.Service` classes have no auto-generated `.Default` layer the way v3's
`Effect.Service` classes did. Every service in `src/services/` now exports an explicit static layer
(`NodeOs.Default`, `JsPackageManagerDetector.Default`, `ProjectEnvironmentDetector.Default`,
`ProjectContext.Default`; a smaller set uses `.layer` instead — `UpgradeBinary.layer`,
`TriggersRealtime.layer`) built with `Layer.effect(this, this.make)` or an equivalent
`Layer.succeed`/`Layer.effect` composition. Match whichever static the service under test actually
exports — check the service file itself; do not assume `.Default` universally.

For mocks, construct the service shape with `Service.of({...})` (not `new Service({...})` — v4
`Context.Service` class constructors are type-metadata-only and no longer double as a runtime shape
constructor) and wrap it with `Layer.succeed(Service, Service.of({...}))`.

## The `@effect/platform-bun` subpath rule

Never import the `@effect/platform-bun` package barrel (`import { BunContext } from
'@effect/platform-bun'`) from `src/` or `test/`. The barrel re-exports `BunRedis`, which requires
the native `bun` package at module-load time and crashes the Node-hosted Vitest runner immediately
on import, before any test in the file can run — even if the file never touches Redis. Always
import the specific subpath instead:

```ts
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import * as BunServices from '@effect/platform-bun/BunServices';
```

`BunServices.layer` is the v4 replacement for v3's `BunContext.layer` — it bundles
FileSystem/Path/Terminal/Stdio/ChildProcessSpawner/Crypto in one layer. Reach for the narrower
`BunFileSystem.layer` / `BunPath.layer` when a suite only needs filesystem/path, to keep the
provided service set legible. `test-layer.ts` composes exactly this set of subpath imports; treat
any new `@effect/platform-bun` import elsewhere in the CLI package as a rule violation, not a style
choice.

## Other v4 test-surface renames worth knowing

- `Either` → `Result`: `Effect.either` → `Effect.result`, `Either.isLeft` → `Result.isFailure`,
  `.left`/`.right` → `.failure`/`.success`.
- `ParseResult.ParseError` → `Schema.SchemaError`; assert with `Schema.isSchemaError(error)`.
- `Effect.catchAll` → `Effect.catch`; `Effect.fork` → `Effect.forkChild` (bare fork) /
  `Effect.forkDetach` (daemon-style, was `Effect.forkDaemon`).
- `Console.Console` and `ConfigProvider.ConfigProvider` are `Context.Reference`s, not FiberRef- or
  Layer-hidden state — provide them with `Layer.succeed`/`Layer.effect` and prefer
  `Layer.provideMerge` over `Layer.provide` when the reference's value must stay visible to
  everything downstream (see the `ConfigProvider` comment in `test-layer.ts` for the bug this
  distinction fixed).
- `TestClock` and `FastCheck` live under `effect/testing`, not the core `effect` barrel.

## CLI behavior matrix

Port tests by contract, not file count:

- root and subcommand help, version, built-ins, aliases, and flag collisions;
- required, optional, repeated, invalid, and dash-leading arguments, including `--`;
- stdout data versus stderr decoration in interactive and piped modes;
- CLI framework errors (`effect/unstable/cli`'s `CliError`) versus Composio domain error
  (`Data.TaggedError`) rendering and exit-code mapping;
- shared service layers, config providers, filesystem/process adapters, interruption, time, and
  cleanup;
- direct binary smoke tests and Docker CLI E2E after unit and package checks pass.
