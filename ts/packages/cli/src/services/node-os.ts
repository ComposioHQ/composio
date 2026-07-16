// eslint-disable-next-line no-restricted-imports -- This Effect service is the sole node:os boundary for CLI source.
import os from 'node:os';
import { Effect } from 'effect';

// Injectable operating-system details for testing purposes.
export class NodeOs extends Effect.Service<NodeOs>()('services/NodeOs', {
  sync: () => ({
    homedir: os.homedir(),
    tmpdir: os.tmpdir(),
    platform: os.platform(),
    arch: os.arch(),
  }),
  dependencies: [],
}) {}

export const defaultNodeOs = ({
  homedir,
  tmpdir = os.tmpdir(),
}: {
  homedir: string;
  tmpdir?: string;
}) => new NodeOs({ homedir, tmpdir, platform: os.platform(), arch: os.arch() });
