// eslint-disable-next-line no-restricted-imports -- This Effect helper is the sole detached-spawn boundary for CLI source: @effect/platform Command processes are scope-bound and are killed when their scope closes, while these children must outlive the CLI process.
import { spawn } from 'node:child_process';
import { Data, Effect } from 'effect';

export class DetachedProcessSpawnError extends Data.TaggedError(
  'services/DetachedProcessSpawnError'
)<{
  readonly command: string;
  readonly cause: unknown;
}> {}

/**
 * Spawns a process that outlives the CLI: detached from the CLI's process
 * group so terminal signals never reach it, and unref'd so the CLI event loop
 * never waits on it. All stdio is ignored unless stderr passthrough is
 * requested (telemetry debug output).
 */
export const spawnDetached = (
  command: string,
  args: ReadonlyArray<string>,
  options?: { readonly inheritStderr?: boolean }
): Effect.Effect<void, DetachedProcessSpawnError> =>
  Effect.try({
    try: () =>
      spawn(command, [...args], {
        detached: true,
        stdio: options?.inheritStderr === true ? ['ignore', 'ignore', 'inherit'] : 'ignore',
        // Leaving `env` unset makes the child inherit the complete parent environment.
      }),
    catch: cause => new DetachedProcessSpawnError({ command, cause }),
  }).pipe(
    Effect.flatMap(child =>
      Effect.callback<void, DetachedProcessSpawnError>(resume => {
        let settled = false;

        const cleanup = () => {
          child.removeListener('spawn', onSpawn);
          child.removeListener('error', onError);
        };

        const settle = (result: Effect.Effect<void, DetachedProcessSpawnError>) => {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();
          resume(result);
        };

        const onSpawn = () => {
          child.unref();
          settle(Effect.void);
        };

        const onError = (cause: Error) => {
          settle(Effect.fail(new DetachedProcessSpawnError({ command, cause })));
        };

        child.once('spawn', onSpawn);
        child.once('error', onError);
      })
    )
  );
