import os from 'node:os';
import { Effect } from 'effect';

// Service to that wraps `node:os`, for testing purposes.
export class NodeOs extends Effect.Service<NodeOs>()('services/NodeOs', {
  sync: () => ({
    homedir: os.homedir(),
  }),
  dependencies: [],
}) {}
