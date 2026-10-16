import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { buildRootCommand } from 'src/commands';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const rootNames = (experimental: boolean) =>
  buildRootCommand({
    isDevModeEnabled: true,
    isExperimentalFeatureEnabled: () => experimental,
  }).subcommands.flatMap(group => group.commands.map(cmd => cmd.name));

describe('CLI experimental feature visibility', () => {
  it('keeps experimental commands out of the stable command tree', () => {
    expect(rootNames(false)).not.toContain('listen');
    expect(rootNames(true)).toContain('listen');
  });

  describe.each([
    { listen: false, helpAlias: 'Failure' },
    { listen: true, helpAlias: 'Success' },
  ])('listen=$listen', ({ listen, helpAlias }) => {
    layer(TestLive({ cliUserConfig: { experimentalFeatures: { listen } } }))(it => {
      it.effect('uses the same visibility for root help and help aliases', () =>
        Effect.gen(function* () {
          yield* cli(['--help']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true, stream: 'stdout' })).join(
            '\n'
          );
          expect(output.includes('listen')).toBe(listen);
          const result = yield* Effect.result(cli(['help', 'listen']));
          expect(result._tag).toBe(helpAlias);
        })
      );
    });
  });
});
