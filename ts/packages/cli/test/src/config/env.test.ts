import { describe, it } from '@effect/vitest';
import { deepStrictEqual } from '@effect/vitest/utils';
import { Config, ConfigProvider, Effect } from 'effect';
import { flag, hasEnvironmentRoot, optionalFlag, optionalString } from 'src/config/env';

const read = <A>(config: Config.Config<A>, env: Record<string, string>) =>
  config.parse(ConfigProvider.fromEnvRecord(env));

describe('config readers', () => {
  it.effect('optionalString trims and treats blank as unset', () =>
    Effect.gen(function* () {
      deepStrictEqual(yield* read(optionalString('X'), {}), undefined);
      deepStrictEqual(yield* read(optionalString('X'), { X: '   ' }), undefined);
      deepStrictEqual(yield* read(optionalString('X'), { X: ' value ' }), 'value');
    })
  );

  it.effect('flags are tolerant: blank falls back, off-words disable, anything else enables', () =>
    Effect.gen(function* () {
      const flags = Config.all({
        blank: flag('BLANK', true),
        off: flag('OFF', true),
        typo: flag('TYPO'),
        unset: optionalFlag('UNSET'),
      });
      deepStrictEqual(yield* read(flags, { BLANK: '', OFF: 'No', TYPO: 'maybe' }), {
        blank: true,
        off: false,
        typo: true,
        unset: undefined,
      });
    })
  );

  it.effect('hasEnvironmentRoot matches a bare root and any underscore-prefixed child', () =>
    Effect.gen(function* () {
      const roots = Config.all({
        codex: hasEnvironmentRoot('CODEX'),
        claude: hasEnvironmentRoot('CLAUDE'),
      });
      deepStrictEqual(yield* read(roots, { CODEX_HOME: '/x', claude_home: '/y' }), {
        codex: true,
        claude: false,
      });
      deepStrictEqual(yield* read(roots, { CLAUDE: '1' }), { codex: false, claude: true });
    })
  );
});
