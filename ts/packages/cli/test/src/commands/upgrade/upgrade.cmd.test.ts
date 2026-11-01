import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach, vi } from 'vitest';
import { APP_VERSION } from 'src/constants';
import { installSkillSafe } from 'src/effects/install-skill';
import { UpgradeBinary, UpgradeBinaryError } from 'src/services/upgrade-binary';
import { cli, TestLive } from 'test/__utils__';

vi.mock('src/effects/install-skill', async original => ({
  ...(await original<typeof import('src/effects/install-skill')>()),
  installSkillSafe: vi.fn(() => Effect.void),
}));

type UpgradeOptions = Parameters<UpgradeBinary['Service']['upgrade']>[0];

/** An upgrader that records its options and answers with `result`. */
const recordingUpgrader = (result: Effect.Effect<string | undefined, UpgradeBinaryError>) => {
  const calls: Array<UpgradeOptions> = [];
  const service = UpgradeBinary.of({
    upgrade: options => {
      calls.push(options);
      return result;
    },
  });
  return { calls, service };
};

describe('CLI: composio upgrade', () => {
  afterEach(() => vi.clearAllMocks());

  layer(TestLive())(it => {
    it.effect.each([
      { args: [], prerelease: false, tag: undefined },
      { args: ['--beta'], prerelease: true, tag: undefined },
      { args: ['-b'], prerelease: true, tag: undefined },
      { args: ['0.13.1'], prerelease: false, tag: '@composio/cli@0.13.1' },
      { args: ['v0.13.1'], prerelease: false, tag: '@composio/cli@0.13.1' },
      { args: ['0.13.1-beta.42'], prerelease: false, tag: '@composio/cli@0.13.1-beta.42' },
      { args: ['@composio/cli@0.13.1'], prerelease: false, tag: '@composio/cli@0.13.1' },
      { args: ['--beta', '0.13.1'], prerelease: true, tag: '@composio/cli@0.13.1' },
    ])(
      '[Given] upgrade $args [Then] asks for prerelease=$prerelease and tag $tag',
      ({ args, prerelease, tag }) =>
        Effect.gen(function* () {
          const upgrader = recordingUpgrader(Effect.succeed('@composio/cli@9.9.9'));

          yield* cli(['upgrade', ...args]).pipe(
            Effect.provideService(UpgradeBinary, upgrader.service)
          );

          expect(upgrader.calls).toEqual([{ prerelease, tag }]);
          expect(installSkillSafe).toHaveBeenCalledExactlyOnceWith({
            releaseTag: '@composio/cli@9.9.9',
          });
        })
    );

    it.effect('[Given] no upgrade happened and no version [Then] installs the running skill', () =>
      Effect.gen(function* () {
        const upgrader = recordingUpgrader(Effect.succeed(undefined));

        yield* cli(['upgrade']).pipe(Effect.provideService(UpgradeBinary, upgrader.service));

        expect(installSkillSafe).toHaveBeenCalledExactlyOnceWith({
          releaseTag: `@composio/cli@${APP_VERSION}`,
        });
      })
    );

    it.effect(
      '[Given] no upgrade happened for a version [Then] installs that version’s skill',
      () =>
        Effect.gen(function* () {
          const upgrader = recordingUpgrader(Effect.succeed(undefined));

          yield* cli(['upgrade', '0.13.1']).pipe(
            Effect.provideService(UpgradeBinary, upgrader.service)
          );

          expect(installSkillSafe).toHaveBeenCalledExactlyOnceWith({
            releaseTag: '@composio/cli@0.13.1',
          });
        })
    );

    it.effect('[Given] the upgrade fails [Then] fails with its error and installs no skill', () =>
      Effect.gen(function* () {
        const upgrader = recordingUpgrader(
          Effect.fail(new UpgradeBinaryError({ message: 'download failed' }))
        );

        const error = yield* cli(['upgrade']).pipe(
          Effect.provideService(UpgradeBinary, upgrader.service),
          Effect.flip
        );

        expect(error).toMatchObject({
          _tag: 'services/UpgradeBinaryError',
          message: 'download failed',
        });
        expect(installSkillSafe).not.toHaveBeenCalled();
      })
    );
  });
});
