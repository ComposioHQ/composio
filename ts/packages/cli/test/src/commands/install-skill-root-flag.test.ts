import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import { parseRootInstallSkillRequest } from 'src/commands';

const parseRequest = (argv: ReadonlyArray<string>) =>
  Effect.runSync(parseRootInstallSkillRequest(argv));

const parseError = (argv: ReadonlyArray<string>) =>
  parseRootInstallSkillRequest(argv).pipe(Effect.flip, Effect.runSync);

describe('CLI: --install-skill', () => {
  it('parses the default skill name when only a target is provided', () => {
    expect(
      Option.getOrUndefined(parseRequest(['node', 'composio', '--install-skill', 'claude']))
    ).toEqual({ target: 'claude' });
  });

  it('parses an explicit skill name and target', () => {
    expect(
      Option.getOrUndefined(
        parseRequest(['node', 'composio', '--install-skill', 'composio-cli', 'codex'])
      )
    ).toEqual({
      skillName: 'composio-cli',
      target: 'codex',
    });
  });

  it('accepts the legacy --instal-skill alias', () => {
    expect(
      Option.getOrUndefined(parseRequest(['node', 'composio', '--instal-skill', 'openclaw']))
    ).toEqual({
      target: 'openclaw',
    });
  });

  it('accepts the root flag after leading global options', () => {
    expect(
      Option.getOrUndefined(
        parseRequest(['node', 'composio', '--log-level', 'debug', '--install-skill', 'claude'])
      )
    ).toEqual({
      target: 'claude',
    });
  });

  it('does not intercept subcommand flags after a positional command', () => {
    expect(
      Option.isNone(parseRequest(['node', 'composio', 'upgrade', '--install-skill', 'claude']))
    ).toBe(true);
  });

  it('returns a helpful error when the target is missing', () => {
    expect(parseError(['node', 'composio', '--install-skill']).message).toBe(
      'Missing target for --install-skill. Usage: composio --install-skill [skill-name] <claude|codex|openclaw>'
    );
  });

  it('returns a helpful error for invalid targets', () => {
    expect(parseError(['node', 'composio', '--install-skill', 'cursor']).message).toBe(
      'Invalid target for --install-skill. Expected one of: claude, codex, openclaw.'
    );
  });
});
