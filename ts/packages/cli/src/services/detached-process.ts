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
    try: () => {
      const child = spawn(command, [...args], {
        detached: true,
        stdio: options?.inheritStderr === true ? ['ignore', 'ignore', 'inherit'] : 'ignore',
        // Leaving `env` unset makes the child inherit the complete parent environment.
      });
      child.on('error', () => undefined);
      child.unref();
    },
    catch: cause => new DetachedProcessSpawnError({ command, cause }),
  });
