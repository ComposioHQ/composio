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

## Errors: `Data.TaggedError` (default) and `Schema.TaggedErrorClass` (schema-backed)

The established convention in this repo — stated in `ts/packages/cli/AGENTS.md`'s
"Effect safety and migration seams" section — is: never wrap a plain `Error` in
`Effect.fail` for an expected failure; give it a `Data.TaggedError` with structured
fields and a preserved cause, then recover with `catchTag`/`catchTags`. This is
unchanged from v3 and is what nearly every error in `src/services/*.ts` uses, e.g.
`ts/packages/cli/src/services/composio-clients.ts`:

```ts
export class InvalidToolkitsError extends Data.TaggedError('services/InvalidToolkitsError')<{
  readonly invalidToolkits: ReadonlyArray<string>;
  readonly availableToolkits: ReadonlyArray<string>;
}> {}
```

Reach for `Schema.TaggedErrorClass` instead only when the error itself needs to be
Schema-encoded/decoded (e.g. it crosses a JSON boundary). It is defined in
`ts/vendor/effect/packages/effect/src/Schema.ts` and shaped like:

```ts
class NotFound extends Schema.TaggedErrorClass<NotFound>()('NotFound', {
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

For anything not in this table, or any beta-to-beta drift, verify against
`ts/vendor/effect/migration/*.md` and the actual `ts/vendor/effect/packages/effect/src`
source before writing code — do not extrapolate from this table alone.
