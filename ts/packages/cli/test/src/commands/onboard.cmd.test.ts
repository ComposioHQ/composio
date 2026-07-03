import { describe, expect, it, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { detectOnboardingTargets, parseTargetList } from 'src/onboarding/targets';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const temporaryHomes: string[] = [];

const makeTemporaryHome = () => {
  const home = mkdtempSync(path.join(tmpdir(), 'composio-onboard-'));
  temporaryHomes.push(home);
  return home;
};

describe('CLI: composio onboard', () => {
  afterEach(() => {
    for (const home of temporaryHomes.splice(0)) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('detects every supported agent marker', () => {
    const home = makeTemporaryHome();
    for (const marker of ['.claude', '.codex', '.cursor', '.dust', '.openclaw']) {
      mkdirSync(path.join(home, marker));
    }

    expect(detectOnboardingTargets(home).map(target => target.id)).toEqual([
      'claude',
      'codex',
      'cursor',
      'dust',
      'openclaw',
    ]);
  });

  it('parses and deduplicates requested targets', () => {
    expect(parseTargetList('cursor, claude, cursor')).toEqual(['cursor', 'claude']);
    expect(() => parseTargetList('cursor,zed')).toThrow(/Unsupported onboarding target: zed/);
  });

  layer(TestLive())(it => {
    it.scoped('prints the browser onboarding handoff in non-interactive mode', () =>
      Effect.gen(function* () {
        yield* cli(['onboard', '--yes', '--no-skill-install']);

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Logging you in...');
        expect(output).toContain(
          'https://dashboard.composio.dev/?cliKey=te00st11-d0c4-4efa-8117-c638886063e0&onboarding=1&email=1'
        );
        expect(output).toContain(
          'Email connection and consent are completed in the browser onboarding flow.'
        );
        expect(output).toContain('composio link <toolkit>');
      })
    );

    it.scoped('shows onboard options in command help', () =>
      Effect.gen(function* () {
        yield* cli(['onboard', '--help']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('--targets');
        expect(output).toContain('--no-skill-install');
        expect(output).toContain('--yes');
      })
    );
  });
});
