import { Command } from '@effect/cli';
import { describe, expect, layer, vi } from '@effect/vitest';
import { Effect } from 'effect';
import { $defaultCmd } from 'src/commands/$default.cmd';
import { withBackgroundUpdateCheck } from 'src/commands/background-update-check';
import { versionCmd } from 'src/commands/version.cmd';
import { TestLive } from 'test/__utils__';

const makeRunner = (start: () => void) => {
  const version = versionCmd.pipe(Command.withHandler(() => Effect.void));
  const other = Command.make('other').pipe(Command.withHandler(() => Effect.void));
  const root = $defaultCmd.pipe(Command.withSubcommands([version, other]), command =>
    withBackgroundUpdateCheck(command, start)
  );

  return Command.run(root, {
    name: 'composio',
    executable: 'composio',
    version: '0.0.0-test',
  });
};

describe('withBackgroundUpdateCheck', () => {
  layer(TestLive())(it => {
    it.scoped('skips the background request for an explicit version check', () =>
      Effect.gen(function* () {
        const start = vi.fn();

        yield* makeRunner(start)(['node', 'composio', 'version', '--check']);

        expect(start).not.toHaveBeenCalled();
      })
    );

    it.scoped('uses parsed root options when identifying an explicit version check', () =>
      Effect.gen(function* () {
        const start = vi.fn();
        const run = makeRunner(start);

        yield* run(['node', 'composio', '--log-level', 'debug', 'version', '--check']);
        yield* run(['node', 'composio', '--log-level=debug', 'version', '--check']);

        expect(start).not.toHaveBeenCalled();
      })
    );

    it.scoped('starts the background request for other parsed commands', () =>
      Effect.gen(function* () {
        const start = vi.fn();
        const run = makeRunner(start);

        yield* run(['node', 'composio', 'version']);
        yield* run(['node', 'composio', 'other']);

        expect(start).toHaveBeenCalledTimes(2);
      })
    );
  });
});
