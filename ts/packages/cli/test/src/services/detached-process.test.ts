import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { DetachedProcessSpawnError, spawnDetached } from 'src/services/detached-process';

describe('spawnDetached', () => {
  it.effect('fails when the executable does not exist', () =>
    Effect.gen(function* () {
      const command = '__composio_missing_detached_process__';
      const error = yield* spawnDetached(command, []).pipe(Effect.flip);

      expect(error).toBeInstanceOf(DetachedProcessSpawnError);
      expect(error.command).toBe(command);
      expect(String(error.cause)).toContain('ENOENT');
    })
  );

  it.effect('succeeds after the child process spawns', () =>
    Effect.gen(function* () {
      yield* spawnDetached(process.execPath, ['-e', 'process.exit(0)']);
    })
  );
});
