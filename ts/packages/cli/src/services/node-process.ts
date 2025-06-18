import process from 'node:process';
import { Effect } from 'effect';

// Service to that wraps `node:process`, for testing purposes.
export class NodeProcess extends Effect.Service<NodeProcess>()('services/NodeProcess', {
  sync: () => ({
    cwd: process.cwd(),
    platform: process.platform,
    arch: process.arch,
  }),
  dependencies: [],
}) {}
