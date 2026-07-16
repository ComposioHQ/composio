import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';

describe('NodeOs', () => {
  it('exposes operating-system details through an Effect service', () => {
    const nodeOs = Effect.runSync(NodeOs.pipe(Effect.provide(NodeOs.Default)));

    expect(nodeOs).toMatchObject({
      homedir: os.homedir(),
      tmpdir: os.tmpdir(),
      platform: os.platform(),
      arch: os.arch(),
    });
  });

  it('supports deterministic home and temporary directories in tests', () => {
    expect(
      defaultNodeOs({
        homedir: '/test/home',
        tmpdir: '/test/tmp',
      })
    ).toMatchObject({
      homedir: '/test/home',
      tmpdir: '/test/tmp',
      platform: os.platform(),
      arch: os.arch(),
    });
  });
});
