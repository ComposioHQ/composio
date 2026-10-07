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

  for (const enabled of [false, true]) {
    layer(TestLive({ cliUserConfig: { experimentalFeatures: { listen: enabled } } }))(it => {
      it.effect(`uses the same visibility for root help and help aliases (listen=${enabled})`, () =>
        Effect.gen(function* () {
          yield* cli(['--help']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true, stream: 'stdout' })).join(
            '\n'
          );
          expect(output.includes('listen')).toBe(enabled);
          const result = yield* Effect.result(cli(['help', 'listen']));
          expect(result._tag === 'Success').toBe(enabled);
        })
      );
    });
  }
});
