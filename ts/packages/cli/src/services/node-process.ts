import process from 'node:process';
import { Context, Layer } from 'effect';

export interface NodeProcessShape {
  readonly cwd: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
}

// Service to that wraps `node:process`, for testing purposes.
export class NodeProcess extends Context.Service<NodeProcess, NodeProcessShape>()(
  'services/NodeProcess'
) {
  static readonly Default: Layer.Layer<NodeProcess> = Layer.succeed(NodeProcess, {
    cwd: process.cwd(),
    platform: process.platform,
    arch: process.arch,
  });
}
