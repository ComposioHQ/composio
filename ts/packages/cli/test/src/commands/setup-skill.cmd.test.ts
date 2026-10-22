import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach, vi } from 'vitest';
import { installSkill } from 'src/effects/install-skill';
import { cli, TestLive } from 'test/__utils__';

vi.mock('src/effects/install-skill', async original => ({
  ...(await original<typeof import('src/effects/install-skill')>()),
  installSkill: vi.fn(() => Effect.void),
}));

describe('composio setup skill', () => {
  afterEach(() => vi.clearAllMocks());
  layer(TestLive())(it => {
    it.effect('passes the selected target and optional name to the installer', () =>
      Effect.gen(function* () {
        yield* cli(['setup', 'skill', 'claude']);
        expect(installSkill).toHaveBeenLastCalledWith({ target: 'claude', skillName: undefined });
        yield* cli(['setup', 'skill', 'codex', '--name', 'custom-skill']);
        expect(installSkill).toHaveBeenLastCalledWith({
          target: 'codex',
          skillName: 'custom-skill',
        });
        yield* cli(['setup', 'skill', 'openclaw']);
        expect(installSkill).toHaveBeenLastCalledWith({ target: 'openclaw', skillName: undefined });
      })
    );
    it.effect.each([
      { args: ['setup', 'skill'], error: { _tag: 'MissingArgument', argument: 'target' } },
      {
        args: ['setup', 'skill', 'cursor'],
        error: { _tag: 'InvalidValue', option: 'target', value: 'cursor' },
      },
      {
        args: ['setup', 'skill', 'claude', '--name'],
        error: { _tag: 'InvalidValue', option: 'name' },
      },
    ])('rejects invalid targets and missing names before installation: $args', ({ args, error }) =>
      Effect.gen(function* () {
        const failure = yield* Effect.flip(cli(args));

        expect(failure).toMatchObject({
          _tag: 'ShowHelp',
          commandPath: ['composio', 'setup', 'skill'],
          errors: [error],
        });
        expect(installSkill).not.toHaveBeenCalled();
      })
    );
  });
});
