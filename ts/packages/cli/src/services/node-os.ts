// eslint-disable-next-line no-restricted-imports -- This Effect service is the sole node:os boundary for CLI source.
import os from 'node:os';
import { Context, Layer } from 'effect';

export interface NodeOsShape {
  readonly homedir: string;
  readonly tmpdir: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
}

// Injectable operating-system details for testing purposes.
export class NodeOs extends Context.Service<NodeOs, NodeOsShape>()('services/NodeOs') {
  static readonly Default: Layer.Layer<NodeOs> = Layer.succeed(NodeOs, {
    homedir: os.homedir(),
    tmpdir: os.tmpdir(),
    platform: os.platform(),
    arch: os.arch(),
  });
}

export const defaultNodeOs = ({
  homedir,
  tmpdir = os.tmpdir(),
}: {
  homedir: string;
  tmpdir?: string;
}): NodeOsShape => NodeOs.of({ homedir, tmpdir, platform: os.platform(), arch: os.arch() });
