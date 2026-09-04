import os from 'node:os';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';

describe('NodeOs', () => {
  it.effect('exposes operating-system details through an Effect service', () =>
    Effect.gen(function* () {
      const nodeOs = yield* NodeOs;

      expect(nodeOs).toMatchObject({
        homedir: os.homedir(),
        tmpdir: os.tmpdir(),
        platform: os.platform(),
        arch: os.arch(),
      });
    }).pipe(Effect.provide(NodeOs.Default))
  );

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
