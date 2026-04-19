import { describe, expect, it } from '@effect/vitest';
import { parseRootInstallSkillRequest } from 'src/commands';

describe('CLI: --install-skill', () => {
  it('parses the default skill name when only a target is provided', () => {
    expect(
      parseRootInstallSkillRequest(['node', 'composio', '--install-skill', 'claude'])
    ).toEqual({
      _tag: 'parsed',
      target: 'claude',
    });
  });

  it('parses an explicit skill name and target', () => {
    expect(
      parseRootInstallSkillRequest([
        'node',
        'composio',
        '--install-skill',
        'composio-cli',
        'codex',
      ])
    ).toEqual({
      _tag: 'parsed',
      skillName: 'composio-cli',
      target: 'codex',
    });
  });

  it('accepts the legacy --instal-skill alias', () => {
    expect(
      parseRootInstallSkillRequest(['node', 'composio', '--instal-skill', 'openclaw'])
    ).toEqual({
      _tag: 'parsed',
      target: 'openclaw',
    });
  });

  it('accepts the root flag after leading global options', () => {
    expect(
      parseRootInstallSkillRequest([
        'node',
        'composio',
        '--log-level',
        'debug',
        '--install-skill',
        'claude',
      ])
    ).toEqual({
      _tag: 'parsed',
      target: 'claude',
    });
  });

  it('does not intercept subcommand flags after a positional command', () => {
    expect(
      parseRootInstallSkillRequest(['node', 'composio', 'upgrade', '--install-skill', 'claude'])
    ).toBeUndefined();
  });

  it('returns a helpful error when the target is missing', () => {
    expect(parseRootInstallSkillRequest(['node', 'composio', '--install-skill'])).toEqual({
      _tag: 'error',
      message:
        'Missing target for --install-skill. Usage: composio --install-skill [skill-name] <claude|codex|openclaw>',
    });
  });

  it('returns a helpful error for invalid targets', () => {
    expect(parseRootInstallSkillRequest(['node', 'composio', '--install-skill', 'cursor'])).toEqual(
      {
        _tag: 'error',
        message:
          'Invalid target for --install-skill. Expected one of: claude, codex, openclaw.',
      }
    );
  });
});
