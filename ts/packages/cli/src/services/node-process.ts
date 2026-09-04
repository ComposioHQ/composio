import process from 'node:process';
import { Context, Layer } from 'effect';

export interface NodeProcessShape {
  readonly cwd: string;
  readonly execPath: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
}

// Service that wraps `node:process`, for testing purposes.
export class NodeProcess extends Context.Tag('services/NodeProcess')<
  NodeProcess,
  NodeProcessShape
>() {
  static readonly Default: Layer.Layer<NodeProcess> = Layer.sync(NodeProcess, () => ({
    cwd: process.cwd(),
    execPath: process.execPath,
    platform: process.platform,
    arch: process.arch,
  }));
}
