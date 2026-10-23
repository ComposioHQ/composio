import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, Layer } from 'effect';
import * as FileSystem from 'effect/FileSystem';
import { TestClock } from 'effect/testing';
import path from 'node:path';
import * as tempy from 'tempy';
import * as constants from 'src/constants';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { PENDING_LOGIN_FILE_NAME, PendingLoginSession } from 'src/services/pending-login-session';
import { hostOnlyEnvConfigProvider } from 'test/__utils__/live-env-config-provider';

const STARTED = {
  key: 'session-key',
  loginUrl: 'https://dashboard.composio.dev/?cliKey=session-key',
  expiresAt: '1970-01-01T00:10:00.000Z',
  verifier: 'dGVzdC12ZXJpZmllci1mb3ItdGhlLWxvZ2luLXRlc3Q',
};

/** The real service over a fresh home directory, so the file lands in `<home>/.composio`. */
const pendingLoginTest = () => {
  const home = tempy.temporaryDirectory({ prefix: 'pending-login' });
  const file = path.join(home, constants.USER_COMPOSIO_DIR, PENDING_LOGIN_FILE_NAME);
  const layer = Layer.mergeAll(
    Layer.provide(
      PendingLoginSession.Default,
      Layer.mergeAll(
        BunFileSystem.layer,
        BunPath.layer,
        Layer.succeed(NodeOs, NodeOs.of(defaultNodeOs({ homedir: home })))
      )
    ),
    BunFileSystem.layer,
    ConfigProvider.layer(hostOnlyEnvConfigProvider)
  );
  return { file, layer };
};

describe('PendingLoginSession', () => {
  it.effect(
    '[Given] a written login [Then] reads it back from a file only the user can read',
    () => {
      const { file, layer } = pendingLoginTest();
      return Effect.gen(function* () {
        const pending = yield* PendingLoginSession;
        const fs = yield* FileSystem.FileSystem;

        yield* pending.write(STARTED);

        expect(yield* pending.read).toEqual({ ...STARTED, cachedAt: '1970-01-01T00:00:00.000Z' });
        expect((yield* fs.stat(file)).mode & 0o777).toBe(0o600);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] a file an older CLI wrote without a verifier [Then] still reads it, without a verifier',
    () => {
      const { file, layer } = pendingLoginTest();
      return Effect.gen(function* () {
        const pending = yield* PendingLoginSession;
        const fs = yield* FileSystem.FileSystem;
        const { verifier: _verifier, ...olderLogin } = STARTED;
        yield* fs.makeDirectory(path.dirname(file), { recursive: true });
        yield* fs.writeFileString(
          file,
          JSON.stringify({ ...olderLogin, cachedAt: '1970-01-01T00:00:00.000Z' })
        );
        yield* fs.chmod(file, 0o600);

        expect(yield* pending.read).toEqual({
          ...olderLogin,
          cachedAt: '1970-01-01T00:00:00.000Z',
        });
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('[Given] no cached login [Then] fails as missing', () => {
    const { layer } = pendingLoginTest();
    return Effect.gen(function* () {
      const pending = yield* PendingLoginSession;

      const error = yield* Effect.flip(pending.read);

      expect(error).toMatchObject({
        _tag: 'commands/PendingLoginError',
        reason: 'missing',
        message: 'No pending login found. Run `composio login < /dev/null` first.',
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] a file that is not a cached login [Then] fails as invalid', () => {
    const { file, layer } = pendingLoginTest();
    return Effect.gen(function* () {
      const pending = yield* PendingLoginSession;
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, '{"key":"only-a-key"}');

      const error = yield* Effect.flip(pending.read);

      expect(error).toMatchObject({ reason: 'invalid', message: 'Pending login cache is invalid' });
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] a login cached over ten minutes ago [Then] deletes it and fails as expired',
    () => {
      const { file, layer } = pendingLoginTest();
      return Effect.gen(function* () {
        const pending = yield* PendingLoginSession;
        const fs = yield* FileSystem.FileSystem;
        yield* pending.write(STARTED);

        yield* TestClock.adjust('10 minutes');
        expect(yield* pending.read).toMatchObject({ key: STARTED.key });

        yield* TestClock.adjust('1 millis');
        const error = yield* Effect.flip(pending.read);

        expect(error).toMatchObject({
          reason: 'expired',
          message: 'Pending login expired. Run `composio login < /dev/null` again.',
        });
        expect(yield* fs.exists(file)).toBe(false);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] a cached login [When] cleared twice [Then] the file is gone and both succeed',
    () => {
      const { file, layer } = pendingLoginTest();
      return Effect.gen(function* () {
        const pending = yield* PendingLoginSession;
        const fs = yield* FileSystem.FileSystem;
        yield* pending.write(STARTED);

        yield* pending.clear;
        yield* pending.clear;

        expect(yield* fs.exists(file)).toBe(false);
      }).pipe(Effect.provide(layer));
    }
  );
});
