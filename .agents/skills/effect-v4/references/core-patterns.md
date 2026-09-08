# Effect v4 core patterns

Read this when porting services, layers, errors, Promise boundaries, or core combinators. For exhaustive changes, consult the matching file under `ts/vendor/effect/migration/`.

## Common renames and rewrites

| Effect v3                                            | Effect v4 beta                                               |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `Context.Tag(id)<Self, Shape>()`                     | `Context.Service<Self, Shape>()(id)`                         |
| `Context.GenericTag`, `Effect.Tag`, `Effect.Service` | `Context.Service`                                            |
| generated service `.Default`                         | explicit `Layer.succeed`, `Layer.effect`, or `Layer.provide` |
| `Schema.TaggedError`                                 | `Schema.TaggedError` (same name; class-based fields API)     |
| `Effect.catchAll`                                    | `Effect.catch`                                               |
| `Effect.catchAllCause`                               | `Effect.catchCause`                                          |
| `Effect.catchAllDefect`                              | `Effect.catchDefect`                                         |
| `Effect.catchSome`                                   | `Effect.catchFilter`                                         |
| `Effect.catchSomeCause`                              | `Effect.catchCauseFilter`                                    |
| `Either`                                             | `Result`                                                     |
| `FiberRef`                                           | `Context.Reference`                                          |
| `Runtime<R>`                                         | `ManagedRuntime` or a platform runtime entrypoint            |
| `Effect.async`                                       | `Effect.callback`                                            |

Earlier v4 betas exported `Schema.TaggedErrorClass` and `Schema.ErrorClass`; the pinned beta renamed them back to `Schema.TaggedError` and `Schema.Error`. Reject either spelling that the installed package does not export.

Schema is a substantial rewrite. Read `ts/vendor/effect/migration/schema.md` before translating schemas, optionality, transformations, JSON Schema, or parse errors.

## Services, layers, errors, and Promise boundaries

```ts
import { Context, Effect, Layer, Schema } from 'effect';

class LookupError extends Schema.TaggedError<LookupError>()('LookupError', {
  id: Schema.String,
}) {}

class UserStore extends Context.Service<
  UserStore,
  {
    readonly find: (id: string) => Effect.Effect<string, LookupError>;
  }
>()('composio/cli/UserStore') {}

const UserStoreLive = Layer.succeed(
  UserStore,
  UserStore.of({
    find: id =>
      Effect.tryPromise({
        try: () => Promise.resolve(`user:${id}`),
        catch: () => new LookupError({ id }),
      }),
  })
);

const loadUser = Effect.fn('loadUser')(function* (id: string) {
  const users = yield* UserStore;
  return yield* users.find(id);
});

export const program = loadUser('user_123').pipe(
  Effect.catchTag('LookupError', error => Effect.succeed(`missing:${error.id}`)),
  Effect.provide(UserStoreLive)
);
```

## Porting rules

- Yield services explicitly so dependencies remain visible.
- Keep layers explicit. The current CLI already defines `Context.Tag` services with a hand-written `static readonly Default` layer and `Service.of({ ... })` test doubles; that shape ports to `Context.Service` with the same explicit layer. V4 never generates a layer, and its `make` option only stores the constructor effect.
- Preserve a live infrastructure cause on internal typed errors when observability needs it, but omit or redact it from public serialization.
- Use `Effect.tryPromise({ try, catch })` for rejecting Promises. `Effect.promise` turns rejection into a defect.
- Prefer `Effect.catchTag`, `Effect.catchTags`, `Match`, and predicate helpers over manual `_tag` comparisons.
- Re-check fiber lifetime, layer memoization, Scope, Cause, and runtime behavior against the dedicated upstream migration guides; those changes are not safe mechanical renames.
