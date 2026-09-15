# Effect v4 core patterns

These are the patterns actually in the migrated source, not idealized examples. Every
excerpt below cites the file it came from — read that file for full context and to
confirm it still matches (it is the compile-checked source of truth, this reference is
not).

## Services: `Context.Service` + explicit layers

V4 has no `Effect.Service`, `Context.Tag`, or `Context.GenericTag`, and it does not
auto-generate a `.Default` layer the way v3's `Effect.Service` did. Define the service
with `Context.Service` and build the layer yourself.

Simple case with no dependencies, from `ts/packages/cli/src/services/node-os.ts`:

```ts
import os from 'node:os';
import { Context, Layer } from 'effect';

export interface NodeOsShape {
  readonly homedir: string;
  readonly tmpdir: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
}

export class NodeOs extends Context.Service<NodeOs, NodeOsShape>()('services/NodeOs') {
  static readonly Default: Layer.Layer<NodeOs> = Layer.succeed(NodeOs, {
    homedir: os.homedir(),
    tmpdir: os.tmpdir(),
    platform: os.platform(),
    arch: os.arch(),
  });
}
```

`@composio/cli-keyring/src/effect.ts` uses the identical shape for its `KeyringService`:
`Context.Service<KeyringService, KeyringServiceShape>()('composio/cli-keyring/KeyringService')`.

This repo's convention is a static layer field on the class — `Default` on most
services (`NodeOs`, `NodeProcess`, `ComposioClientSingleton`, `ComposioToolkitsRepository`,
`JsPackageManagerDetector`, `CommandRunner`, `ProjectEnvironmentDetector`), `layer` on a
few (`UpgradeBinary`, `SetupSkillInstaller`). **Check the service's
own class before writing `.Default` or `.layer`** — the two names are not
interchangeable and picking the wrong one is a real compile error, not a style nit.

For services with dependencies, compose the layer where it is consumed rather than
inside the class, e.g. `ts/packages/cli/src/cli-main.ts`:

```ts
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { Context, Layer } from 'effect';

declare class ComposioToolkitsRepository extends Context.Service<
  ComposioToolkitsRepository,
  object
>()('x') {
  static readonly Default: Layer.Layer<ComposioToolkitsRepository, never, NodeOs>;
}
declare class NodeOs extends Context.Service<NodeOs, object>()('y') {
  static readonly Default: Layer.Layer<NodeOs>;
}
declare const ConfigLive: Layer.Layer<never>;
type RequiredLayer = Layer.Layer<ComposioToolkitsRepository>;

export const ComposioToolkitsRepositoryLive = Layer.provide(
  ComposioToolkitsRepository.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default, ConfigLive)
) satisfies RequiredLayer;
```

Construct an instance shape (mocks, `.of({...})`) with `X.of({...})` — `new X(...)` on a
`Context.Service` class only produces the type-level service-key brand, not a runtime
instance (see the mocks in `ts/packages/cli/test/__utils__/services/test-layer.ts`, e.g.
`ComposioToolkitsRepository.of({ getToolkits: () => Effect.succeed(...), ... })`). Where
a plain function parameter needs the resolved shape rather than the class, use the
exported `...Shape` type or `Context.Service.Shape<typeof X>` (see
`TestLiveInput.commandRunner?: Context.Service.Shape<typeof CommandRunner>` in the same
file), not the bare class name.

## Errors: `Data.TaggedError` (default) and `Schema.TaggedError` (schema-backed)

The established convention in this repo — stated in `ts/packages/cli/AGENTS.md`'s
"Effect safety and migration seams" section — is: never wrap a plain `Error` in
`Effect.fail` for an expected failure; give it a `Data.TaggedError` with structured
fields and a preserved cause, then recover with `catchTag`/`catchTags`. This is
unchanged from v3 and is what nearly every error in `src/services/*.ts` uses, e.g.
`ts/packages/cli/src/services/composio-clients.ts`:

```ts
import { Data } from 'effect';

export class InvalidToolkitsError extends Data.TaggedError('services/InvalidToolkitsError')<{
  readonly invalidToolkits: ReadonlyArray<string>;
  readonly availableToolkits: ReadonlyArray<string>;
}> {}
```

Reach for `Schema.TaggedError` instead only when the error itself needs to be
Schema-encoded/decoded (e.g. it crosses a JSON boundary). It is defined in
`ts/vendor/effect/packages/effect/src/Schema.ts` and shaped like:

```ts
import { Schema } from 'effect';

class NotFound extends Schema.TaggedError<NotFound>()('NotFound', {
  id: Schema.String,
}) {}
```

Either way, recover with `Effect.catchTag`, `Effect.catchTags`, `Match.valueTags`, or a
`Predicate.isTagged` guard — never a manual `error._tag === '...'` branch.

## Promise boundaries

`Effect.tryPromise({ try, catch })` for a Promise that can reject and needs a typed
error; `Effect.promise` turns rejection into a defect (only for Promises that are
truly infallible). No `async`/`await` or `try`/`catch` inside Effect-hosted code — both
are ESLint-banned in `ts/packages/cli/src`. From `@composio/cli-keyring`'s
`effect.ts`, both `Effect.tryPromise` and `Effect.promise` kept their v3 signatures
unchanged in v4.

## `Effect.gen` vs `Effect.fn`: which form where

All of these wrap a generator, and all are lazy in the same way: the body is
`suspend`-wrapped, so it **re-runs on every execution** of the resulting effect — which is
why `Effect.retry`/`Effect.repeat` redo the work instead of replaying a cached result
(`gen` in `ts/vendor/effect/packages/effect/src/internal/effect.ts`).
`Effect.fnUntracedEager` is the one eager variant. The axis that actually differs is **what
the expression is** — an Effect value or a function — and **what the tracer records**:

- `Effect.gen(function* () {...})` produces an Effect **value**. The default for one-shot
  workflows and named module consts, from `ts/packages/cli/src/analytics/dispatch.ts`:

  ```ts no-check
  const getUserApiKey = Effect.gen(function* () {
    const envApiKey = configuredString(
      yield* optionalString('COMPOSIO_USER_API_KEY').parse(getEnvironmentProvider())
    );
    if (envApiKey) {
      return envApiKey;
    }
    // ...
  });
  ```

- `(params) => Effect.gen(function* () {...})` is a plain function returning an effect —
  the default for parameterized helpers, from
  `ts/packages/cli/scripts/generate-toolkit-slugs.ts`:

  ```ts no-check
  const fetchPage = (params: {
    baseUrl: string;
    headers: Record<string, string>;
    cursor?: string;
  }): Effect.Effect<ToolkitsPageDecoded, ToolkitFetchError> =>
    Effect.gen(function* () {
      // ...
    });
  ```

- `Effect.fn(function* (...) {...})` also returns a **function**, but every effect it
  produces carries stack-frame annotations for both the call site and the definition site
  (`makeFn` updates `CurrentStackFrame`) — this is what feeds the CLI's span-chain recovery
  from `Cause.StackTrace` in error reports. The named form `Effect.fn('span.name')(...)`
  additionally opens a **tracing span** per call; `Effect.fnUntraced` drops the frames.
  Use it for service-shape members and combinator callbacks whose failures should be
  attributable, from `ts/packages/cli/src/services/composio-clients.ts`:

  ```ts no-check
  return {
    get: Effect.fn(function* () {
      // ...
    }) satisfies () => Effect.Effect<_RawComposioClient, NoSuchElementError, never>,
    getFor: Effect.fn(function* (params: {
      userApiKey?: string;
      orgId?: string;
      projectId?: string;
    }) {
      // ...
    }),
  };
  ```

  The named form's per-call span is additive to those frames; add the name when the span
  should appear in error reports, otherwise leave it off.

When in doubt: value → `Effect.gen`; function → a plain arrow returning `Effect.gen`,
upgrading to `Effect.fn` when failure attribution in error reports is worth the annotation.
Do not migrate one form to the other wholesale.

## v3 → v4 rename table (historical — recognize stale patterns, don't copy them)

Verified against `ts/vendor/effect/migration/v3-to-v4.md` and this migration's own
notes. If you see the left column in code or in your own memory of Effect, it is v3 and
needs translation.

| v3                                                                   | v4                                                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Context.Tag`, `Context.GenericTag`, `Effect.Service`                | `Context.Service`                                                                                  |
| generated `.Default` layer                                           | explicit static `Default`/`layer` you define with `Layer.succeed`/`Layer.effect`/`Layer.provide`   |
| `@effect/cli`, `@effect/platform`                                    | `effect/unstable/cli`, `effect` core / `effect/unstable/*`                                         |
| `Effect.catchAll` / `catchAllCause` / `catchAllDefect` / `catchSome` | `Effect.catch` / `catchCause` / `catchDefect` / `catchFilter`                                      |
| `Either`                                                             | `Result` (not Effect-yieldable directly — wrap with `Effect.fromResult(...)` inside `Effect.gen`)  |
| `ParseResult.ParseError`, `ParseResult.*`                            | `Schema.SchemaError`, `SchemaIssue.*`                                                              |
| `Schema.decodeUnknown` / `Schema.decode` / `Schema.encode`           | `Schema.decodeUnknownEffect` / `Schema.decodeEffect` / `Schema.encodeEffect`                       |
| `Schema.parseJson(schema)`                                           | `Schema.fromJsonString(schema)`                                                                    |
| `Schema.Literal(a, b)`, `Schema.Union(A, B)` (variadic)              | `Schema.Literals([a, b])`, `Schema.Union([A, B])` (array arg)                                      |
| `Schema.Record({ key, value })`                                      | `Schema.Record(key, value)`                                                                        |
| `Schema.optionalWith(schema, { default })`                           | `schema.pipe(Schema.withDecodingDefaultType(Effect.succeed(value)))`                               |
| `.annotations({...})`                                                | `.annotate({...})`                                                                                 |
| `Predicate.isRecord`                                                 | removed — use `Predicate.isObject` (or a local `isObject && !Array.isArray` helper)                |
| `Cause.isInterruptedOnly`                                            | `Cause.hasInterruptsOnly`                                                                          |
| `Cause.failureOption`                                                | `Cause.findFail` / `Cause.findErrorOption`                                                         |
| `FiberRef` (e.g. `Console`, `ConfigProvider`, `MinimumLogLevel`)     | `Context.Reference`, provided via a `Layer`, not `Effect.with*` combinators                        |
| `Effect.withConfigProvider(provider)`                                | `Effect.provideService(ConfigProvider.ConfigProvider, provider)` / `Layer.succeed(...)`            |
| `ConfigProvider.fromMap(map)`                                        | `ConfigProvider.fromEnv({ env })` (no direct Map constructor)                                      |
| `configProvider.load(config)`                                        | `config.parse(provider)`                                                                           |
| `Effect.runtime<R>()` + `Runtime.runFork/runPromise`                 | `Effect.context<R>()` + `Effect.runForkWith`/`runPromiseWith(services)`                            |
| `LogLevel.Info` etc. (namespace of constants)                        | plain string-literal union (`'Info'`, note `'Warn'` not `'Warning'`)                               |
| `it.scoped` (`@effect/vitest`)                                       | removed — `it.effect` already runs `Effect.scoped`                                                 |
| `ValidationError`, `HelpDoc`, `CommandDescriptor` (`@effect/cli`)    | `CliError`, plain `HelpDoc` data shape, public `Command` fields only — no descriptor introspection |

For anything not in this table, or any prerelease-to-prerelease drift, verify against
`ts/vendor/effect/migration/*.md` and the actual `ts/vendor/effect/packages/effect/src`
source before writing code — do not extrapolate from this table alone.
