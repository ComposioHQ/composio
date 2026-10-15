import { Effect, Layer } from 'effect';
import { NodeProcess } from 'src/services/node-process';

/**
 * A `NodeProcess` that records the exit code a handler sets instead of
 * touching the real process, so a test can assert it.
 */
export const recordingNodeProcess = (cwd = '/tmp') => {
  let exitCode: number | undefined;
  const layer = Layer.succeed(
    NodeProcess,
    NodeProcess.of({
      cwd,
      execPath: `${cwd}/composio`,
      platform: 'darwin',
      arch: 'arm64',
      setExitCode: code =>
        Effect.sync(() => {
          exitCode = code;
        }),
    })
  );
  return { layer, exitCode: () => exitCode };
};
