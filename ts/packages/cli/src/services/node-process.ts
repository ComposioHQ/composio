import process from 'node:process';
import { Context, Effect, Layer } from 'effect';

export interface NodeProcessShape {
  readonly cwd: string;
  readonly execPath: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  /**
   * Sets the code the process exits with once it ends on its own, so a
   * command can report a failure it recovered from.
   */
  readonly setExitCode: (code: number) => Effect.Effect<void>;
}

// Service that wraps `node:process`, for testing purposes.
export class NodeProcess extends Context.Service<NodeProcess, NodeProcessShape>()(
  'services/NodeProcess'
) {
  static readonly Default: Layer.Layer<NodeProcess> = Layer.sync(NodeProcess, () => ({
    cwd: process.cwd(),
    execPath: process.execPath,
    platform: process.platform,
    arch: process.arch,
    setExitCode: code =>
      Effect.sync(() => {
        process.exitCode = code;
      }),
  }));
}
