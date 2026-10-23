/**
 * The browser login that `composio login` started without waiting: its session key, URL, and
 * the verifier that proves this machine started it, cached in
 * `<cache dir>/pending-login-session.json` so that `composio login --poll` can complete it
 * from another process. `composio dev init` starts the same browser login, so the
 * file outlives any one command.
 */
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import type { Config, PlatformError } from 'effect';
import { ExpectedFailure } from 'src/effects/expected-failure';
import { Clock, Context, Data, DateTime, Effect, Layer, Schema } from 'effect';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { atomicWritePrivateFileString, ensurePrivateFileMode } from 'src/utils/atomic-write';
import { NodeOs } from './node-os';

export const PENDING_LOGIN_FILE_NAME = 'pending-login-session.json';

/** How long a cached login stays usable, counted from when it was cached. */
const PENDING_LOGIN_TTL_MS = 10 * 60 * 1000;

export const PendingLogin = Schema.Struct({
  key: Schema.String,
  loginUrl: Schema.String,
  expiresAt: Schema.String,
  cachedAt: Schema.String,
  /** The session's proof verifier; absent from a file an older CLI wrote. */
  verifier: Schema.optional(Schema.String),
});
export type PendingLogin = Schema.Schema.Type<typeof PendingLogin>;

export class PendingLoginError extends Data.TaggedError('commands/PendingLoginError')<{
  readonly message: string;
  readonly reason: 'invalid' | 'io' | 'missing' | 'expired' | 'outdated';
  readonly cause?: unknown;
}> {
  /**
   * No login was started, it expired, or an older CLI started it without a verifier; a cache
   * that cannot be read or decoded is a defect.
   */
  get [ExpectedFailure]() {
    return this.reason === 'missing' || this.reason === 'expired' || this.reason === 'outdated';
  }
}

export type PendingLoginSessionShape = {
  /** Caches a started login, stamped with the current time, in a file only the user can read. */
  readonly write: (
    session: Omit<PendingLogin, 'cachedAt'>
  ) => Effect.Effect<void, Config.ConfigError | PlatformError.PlatformError>;
  /**
   * The cached login. Fails with `missing` when there is none, `io` or `invalid` when the file
   * cannot be read or decoded, and `expired` (after deleting it) when it is past its TTL.
   */
  readonly read: Effect.Effect<
    PendingLogin,
    PendingLoginError | Config.ConfigError | PlatformError.PlatformError
  >;
  /** Deletes the cached login; a missing file is not an error. */
  readonly clear: Effect.Effect<void>;
};

const decodePendingLogin = Schema.decodeUnknownEffect(Schema.fromJsonString(PendingLogin));

const isExpired = (cachedAt: string, now: number) => {
  const cachedAtMs = Date.parse(cachedAt);
  return !Number.isFinite(cachedAtMs) || now - cachedAtMs > PENDING_LOGIN_TTL_MS;
};

const makePendingLoginSession = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const os = yield* NodeOs;

  // Resolved on every call: the cache directory comes from configuration read at call time.
  const filePath = setupCacheDir.pipe(
    Effect.map(cacheDir => path.join(cacheDir, PENDING_LOGIN_FILE_NAME)),
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path),
    Effect.provideService(NodeOs, os)
  );

  const clear = filePath.pipe(
    Effect.flatMap(target => fs.remove(target)),
    Effect.ignore
  );

  const write: PendingLoginSessionShape['write'] = session =>
    Effect.gen(function* () {
      const target = yield* filePath;
      const cachedAt = DateTime.formatIso(yield* DateTime.now);
      const payload: PendingLogin = { ...session, cachedAt };
      yield* atomicWritePrivateFileString({
        fs,
        target,
        contents: `${JSON.stringify(payload, null, 2)}\n`,
      });
    });

  const read = Effect.gen(function* () {
    const target = yield* filePath;
    yield* fs.exists(target).pipe(
      Effect.filterOrFail(
        exists => exists,
        () =>
          new PendingLoginError({
            message: 'No pending login found. Run `composio login < /dev/null` first.',
            reason: 'missing',
          })
      )
    );
    const raw = yield* ensurePrivateFileMode({ fs, target }).pipe(
      Effect.andThen(fs.readFileString(target, 'utf8')),
      Effect.mapError(
        cause =>
          new PendingLoginError({
            message: 'Failed to read pending login cache',
            reason: 'io',
            cause,
          })
      )
    );
    const session = yield* decodePendingLogin(raw).pipe(
      Effect.mapError(
        cause =>
          new PendingLoginError({
            message: 'Pending login cache is invalid',
            reason: 'invalid',
            cause,
          })
      )
    );
    const now = yield* Clock.currentTimeMillis;
    if (isExpired(session.cachedAt, now)) {
      yield* clear;
      return yield* new PendingLoginError({
        message: 'Pending login expired. Run `composio login < /dev/null` again.',
        reason: 'expired',
      });
    }
    return session;
  });

  return { write, read, clear } satisfies PendingLoginSessionShape;
});

export class PendingLoginSession extends Context.Service<
  PendingLoginSession,
  PendingLoginSessionShape
>()('services/PendingLoginSession') {
  static readonly Default: Layer.Layer<
    PendingLoginSession,
    never,
    FileSystem.FileSystem | Path.Path | NodeOs
  > = Layer.effect(PendingLoginSession, makePendingLoginSession);
}
