/**
 * Effect.ts integration for `@composio/cli-keyring`.
 *
 * The core package is intentionally Promise-based so Node and Bun
 * consumers can use it without pulling in Effect. This entry point
 * wraps `Entry` in an Effect service so the Composio CLI (which is
 * built on Effect) can access the keyring through its normal layer
 * composition:
 *
 * ```ts
 * import { Effect, Layer } from 'effect';
 * import { KeyringService, KeyringLive } from '@composio/cli-keyring/effect';
 *
 * const program = Effect.gen(function* () {
 *   const keyring = yield* KeyringService;
 *   yield* keyring.setPassword('com.composio.cli', 'default', apiKey);
 * });
 *
 * program.pipe(Effect.provide(KeyringLive));
 * ```
 *
 * This module has a peer dependency on `effect`. Consumers that don't
 * use Effect should import from `@composio/cli-keyring` directly and
 * never touch this file.
 */

import { Context, Effect, Layer } from 'effect';
import { Entry } from './core/entry';
import type { KeyringError } from './core/errors';
import { createDefaultStore, type MacOSBackend } from './index';
import { type CredentialStore, type EntryModifiers, setDefaultStore } from './core/store';

/**
 * Service shape exposed to Effect consumers. Every method returns
 * `Effect.Effect<T, KeyringError>` — callers branch on
 * `Effect.catchTag`-style error handling by matching on
 * `error.details.kind`.
 */
export interface KeyringServiceShape {
  /** Store a UTF-8 password under (service, user). */
  readonly setPassword: (
    service: string,
    user: string,
    password: string,
    modifiers?: EntryModifiers
  ) => Effect.Effect<void, KeyringError>;

  /** Fetch a UTF-8 password; fails with `NoEntry` if missing. */
  readonly getPassword: (
    service: string,
    user: string,
    modifiers?: EntryModifiers
  ) => Effect.Effect<string, KeyringError>;

  /** Store raw bytes under (service, user). */
  readonly setSecret: (
    service: string,
    user: string,
    secret: Uint8Array,
    modifiers?: EntryModifiers
  ) => Effect.Effect<void, KeyringError>;

  /** Fetch raw bytes; fails with `NoEntry` if missing. */
  readonly getSecret: (
    service: string,
    user: string,
    modifiers?: EntryModifiers
  ) => Effect.Effect<Uint8Array, KeyringError>;

  /** Delete the credential; fails with `NoEntry` if missing. */
  readonly deleteCredential: (
    service: string,
    user: string,
    modifiers?: EntryModifiers
  ) => Effect.Effect<void, KeyringError>;

  /**
   * Probe whether the backing store is currently usable. Catches
   * `NoStorageAccess` to return `false` — useful for deciding whether
   * to offer keyring-backed login or fall back to on-disk config.
   */
  readonly isAvailable: Effect.Effect<boolean>;
}

/**
 * Context tag. Resolve with `yield* KeyringService` inside an
 * `Effect.gen` block.
 */
export class KeyringService extends Context.Tag('composio/cli-keyring/KeyringService')<
  KeyringService,
  KeyringServiceShape
>() {}

/**
 * Build a `KeyringServiceShape` from a concrete `CredentialStore`.
 * Factored out so tests can swap in an in-memory mock without going
 * through `setDefaultStore`.
 */
export function makeKeyringService(store: CredentialStore): KeyringServiceShape {
  const entryFor = (service: string, user: string, modifiers?: EntryModifiers): Entry =>
    new Entry(service, user, modifiers ?? {}, store);

  const unsafe = <T>(op: () => Promise<T>): Effect.Effect<T, KeyringError> =>
    Effect.tryPromise({
      try: op,
      // Store operations already throw KeyringError, so we preserve
      // the error verbatim. The `as KeyringError` cast is safe
      // because every path into this helper comes from an `Entry`
      // method or the underlying store, both of which only throw
      // KeyringError.
      catch: err => err as KeyringError,
    });

  return {
    setPassword: (service, user, password, modifiers) =>
      unsafe(() => entryFor(service, user, modifiers).setPassword(password)),
    getPassword: (service, user, modifiers) =>
      unsafe(() => entryFor(service, user, modifiers).getPassword()),
    setSecret: (service, user, secret, modifiers) =>
      unsafe(() => entryFor(service, user, modifiers).setSecret(secret)),
    getSecret: (service, user, modifiers) =>
      unsafe(() => entryFor(service, user, modifiers).getSecret()),
    deleteCredential: (service, user, modifiers) =>
      unsafe(() => entryFor(service, user, modifiers).deleteCredential()),
    isAvailable: Effect.gen(function* () {
      // Probe with a non-existent specifier — we expect NoEntry if
      // the store is healthy, NoStorageAccess if it isn't.
      const probeService = '__composio_cli_keyring_probe__';
      const probeUser = '__probe__';
      const probe = unsafe(() => new Entry(probeService, probeUser, {}, store).getSecret());
      return yield* probe.pipe(
        Effect.match({
          onSuccess: () => true,
          onFailure: err => err.details.kind === 'NoEntry',
        })
      );
    }),
  };
}

/**
 * Live layer that instantiates the platform store on effect-build and
 * registers it as the process-global default (so non-Effect callers
 * in the same process also see it). Provide this once at startup:
 *
 * ```ts
 * BunRuntime.runMain(program.pipe(Effect.provide(KeyringLive)));
 * ```
 *
 * The layer uses `Layer.effect` rather than `Layer.sync` because the
 * macOS FFI backend is dynamically imported — it must stay out of the
 * Node bundle so `bun:ffi` doesn't crash at module load. The extra
 * layer-build cost is a one-shot `import()` per process.
 */
export const KeyringLive: Layer.Layer<KeyringService> = Layer.effect(
  KeyringService,
  Effect.promise(async () => {
    const store = await createDefaultStore();
    setDefaultStore(store);
    return makeKeyringService(store);
  })
);

/**
 * Build a `KeyringLive` layer with an explicit macOS backend choice.
 * Use this instead of `KeyringLive` when the CLI lets the user pick
 * between `subprocess` (safe default) and `ffi` (experimental,
 * requires Developer ID signing). The `backend` parameter is
 * ignored on Linux and other platforms.
 */
export const KeyringLiveWithBackend = (macOSBackend: MacOSBackend): Layer.Layer<KeyringService> =>
  Layer.effect(
    KeyringService,
    Effect.promise(async () => {
      const store = await createDefaultStore({ macOSBackend });
      setDefaultStore(store);
      return makeKeyringService(store);
    })
  );

/** Layer built from an explicit store — used by tests. */
export const KeyringLayer = (store: CredentialStore): Layer.Layer<KeyringService> =>
  Layer.succeed(KeyringService, makeKeyringService(store));
