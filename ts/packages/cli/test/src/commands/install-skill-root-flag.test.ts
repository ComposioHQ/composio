import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import { parseRootInstallSkillRequest } from 'src/commands';

describe('CLI: --install-skill', () => {
  it.effect('parses the default skill name when only a target is provided', () =>
    Effect.gen(function* () {
      const request = yield* parseRootInstallSkillRequest([
        'node',
        'composio',
        '--install-skill',
        'claude',
      ]);
      expect(Option.getOrUndefined(request)).toEqual({ target: 'claude' });
    })
  );

  it.effect('parses an explicit skill name and target', () =>
    Effect.gen(function* () {
      const request = yield* parseRootInstallSkillRequest([
        'node',
        'composio',
        '--install-skill',
        'composio-cli',
        'codex',
      ]);
      expect(Option.getOrUndefined(request)).toEqual({
        skillName: 'composio-cli',
        target: 'codex',
      });
    })
  );

  it.effect('accepts the legacy --instal-skill alias', () =>
    Effect.gen(function* () {
      const request = yield* parseRootInstallSkillRequest([
        'node',
        'composio',
        '--instal-skill',
        'openclaw',
      ]);
      expect(Option.getOrUndefined(request)).toEqual({
        target: 'openclaw',
      });
    })
  );

  it.effect('accepts the root flag after leading global options', () =>
    Effect.gen(function* () {
      const request = yield* parseRootInstallSkillRequest([
        'node',
        'composio',
        '--log-level',
        'debug',
        '--install-skill',
        'claude',
      ]);
      expect(Option.getOrUndefined(request)).toEqual({
        target: 'claude',
      });
    })
  );

  it.effect('does not intercept subcommand flags after a positional command', () =>
    Effect.gen(function* () {
      const request = yield* parseRootInstallSkillRequest([
        'node',
        'composio',
        'upgrade',
        '--install-skill',
        'claude',
      ]);
      expect(Option.isNone(request)).toBe(true);
    })
  );

  it.effect('returns a helpful error when the target is missing', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        parseRootInstallSkillRequest(['node', 'composio', '--install-skill'])
      );
      expect(error.message).toBe(
        'Missing target for --install-skill. Usage: composio --install-skill [skill-name] <claude|codex|openclaw>'
      );
    })
  );

  it.effect('returns a helpful error for invalid targets', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        parseRootInstallSkillRequest(['node', 'composio', '--install-skill', 'cursor'])
      );
      expect(error.message).toBe(
        'Invalid target for --install-skill. Expected one of: claude, codex, openclaw.'
      );
    })
  );
});
