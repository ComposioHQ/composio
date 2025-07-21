import os from 'node:os';
import { Effect } from 'effect';

// Service to that wraps `node:os`, for testing purposes.
export class NodeOs extends Effect.Service<NodeOs>()('services/NodeOs', {
  sync: () => ({
    homedir: os.homedir(),
    platform: os.platform(),
    arch: os.arch(),
  }),
  dependencies: [],
}) {}

export const defaultNodeOs = ({ homedir }: { homedir: string }) =>
  new NodeOs({ homedir, platform: os.platform(), arch: os.arch() });
