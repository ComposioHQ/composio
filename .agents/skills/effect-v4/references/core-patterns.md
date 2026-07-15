# Effect v4 core patterns

Read this when porting services, layers, errors, Promise boundaries, or core combinators. For exhaustive changes, consult the matching file under `ts/vendor/effect/migration/`.

## Common renames and rewrites

| Effect v3                                             | Effect v4 beta                                               |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| `Context.Tag`, `Context.GenericTag`, `Effect.Service` | `Context.Service`                                            |
| generated service `.Default`                          | explicit `Layer.succeed`, `Layer.effect`, or `Layer.provide` |
| `Schema.TaggedError`                                  | `Schema.TaggedErrorClass`                                    |
| `Effect.catchAll`                                     | `Effect.catch`                                               |
| `Effect.catchAllCause`                                | `Effect.catchCause`                                          |
| `Effect.catchAllDefect`                               | `Effect.catchDefect`                                         |
| `Effect.catchSome`                                    | `Effect.catchFilter`                                         |
| `Either`                                              | `Result`                                                     |
| `FiberRef`                                            | `Context.Reference`                                          |
| `Runtime<R>`                                          | `ManagedRuntime` or a platform runtime entrypoint            |
| `Effect.async`                                        | `Effect.callback`                                            |

Schema is a substantial rewrite. Read `ts/vendor/effect/migration/schema.md` before translating schemas, optionality, transformations, JSON Schema, or parse errors.

## Services, layers, errors, and Promise boundaries

```ts
import { Context, Effect, Layer, Schema } from 'effect';

class LookupError extends Schema.TaggedErrorClass<LookupError>()('LookupError', {
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
- Define layers separately and wire them explicitly; do not recreate v3's implicit `.Default` convention.
- Preserve a live infrastructure cause on internal typed errors when observability needs it, but omit or redact it from public serialization.
- Use `Effect.tryPromise({ try, catch })` for rejecting Promises. `Effect.promise` turns rejection into a defect.
- Prefer `Effect.catchTag`, `Effect.catchTags`, `Match`, and predicate helpers over manual `_tag` comparisons.
- Re-check fiber lifetime, layer memoization, Scope, Cause, and runtime behavior against the dedicated upstream migration guides; those changes are not safe mechanical renames.
