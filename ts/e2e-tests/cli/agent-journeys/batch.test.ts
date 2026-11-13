import { describe, expect, it } from 'bun:test';
import {
  fingerprint,
  renderComparison,
  summarize,
  type BatchInfo,
  type RunRecord,
} from './src/batch';

const run = (fields: Partial<RunRecord>): RunRecord => ({
  journey: 'consumer-slack-message',
  split: 'train',
  arm: 'skill',
  attempt: 1,
  fingerprint: 'f',
  outcome: 'passed',
  checks: [],
  detours: [],
  stop: 'finished',
  modelTurns: 3,
  commands: [],
  costUsd: 0.01,
  durationMs: 1000,
  ...fields,
});

const info = (fields: Partial<BatchInfo> = {}): BatchInfo => ({
  id: 'batch',
  startedAt: '2026-11-11T00:00:00.000Z',
  agent: 'claude-code',
  agentVersion: '2.1.310',
  model: 'claude-haiku-5-5',
  runs: 3,
  arms: ['skill'],
  journeys: ['consumer-slack-message'],
  revision: 'abc',
  dirty: false,
  skillSha256: 'skill-a',
  harnessSha256: 'harness-a',
  cliSha256: 'cli-a',
  maxCostUsd: 1,
  ...fields,
});

describe('summarize', () => {
  it('leaves infra failures out of every rate', () => {
    const [cell] = summarize([
      run({ attempt: 1 }),
      run({ attempt: 2, outcome: 'failed', checks: [{ name: 'it went to #general', ok: false }] }),
      run({ attempt: 3, outcome: 'infra' }),
    ]);
    expect(cell?.n).toBe(2);
    expect(cell?.infra).toBe(1);
    expect(cell?.passAt1).toBe(0.5);
    expect(cell?.passAtK).toBe(1);
    expect(cell?.passHatK).toBe(0);
    expect(cell?.failedChecks).toEqual({ 'it went to #general': 1 });
  });

  it('counts a run with a detour toward the wrong-tree rate, passed or not', () => {
    const detour = [{ name: 'no `composio dev` command ran', ok: false }];
    const [cell] = summarize([run({ detours: detour }), run({ attempt: 2 })]);
    expect(cell?.wrongTreeRate).toBe(0.5);
    expect(cell?.passAt1).toBe(1);
  });
});

describe('fingerprint', () => {
  const parts = {
    journey: 'first-run-login',
    agent: 'claude-code' as const,
    agentVersion: '2.1.310',
    model: 'claude-haiku-5-5',
    harnessSha256: 'h',
    cliSha256: 'i',
  };

  it('changes with the skill on the skill arm only', () => {
    expect(fingerprint({ ...parts, arm: 'skill', skillSha256: 'a' })).not.toBe(
      fingerprint({ ...parts, arm: 'skill', skillSha256: 'b' })
    );
    expect(fingerprint({ ...parts, arm: 'no-skill', skillSha256: 'a' })).toBe(
      fingerprint({ ...parts, arm: 'no-skill', skillSha256: 'b' })
    );
  });

  it('changes with the harness, the CLI and the model', () => {
    const base = fingerprint({ ...parts, arm: 'skill', skillSha256: 'a' });
    expect(fingerprint({ ...parts, arm: 'skill', skillSha256: 'a', harnessSha256: 'x' })).not.toBe(
      base
    );
    expect(fingerprint({ ...parts, arm: 'skill', skillSha256: 'a', cliSha256: 'x' })).not.toBe(
      base
    );
    expect(
      fingerprint({ ...parts, arm: 'skill', skillSha256: 'a', model: 'claude-opus-5-5' })
    ).not.toBe(base);
  });
});

describe('renderComparison', () => {
  const baseline = { info: info(), runs: [run({ outcome: 'failed' }), run({ attempt: 2 })] };

  it('reports the change in pass@1 per journey and split', () => {
    const candidate = {
      info: info({ id: 'after', skillSha256: 'skill-b' }),
      runs: [run({}), run({ attempt: 2 })],
    };
    const text = renderComparison(baseline, candidate, { arm: 'skill', allowHarnessChange: false });
    expect(text).toContain('| train | consumer-slack-message | 50% → 100% | +50 |');
  });

  it('refuses batches graded by different harnesses', () => {
    const candidate = { info: info({ harnessSha256: 'harness-b' }), runs: [run({})] };
    expect(() =>
      renderComparison(baseline, candidate, { arm: 'skill', allowHarnessChange: false })
    ).toThrow(/different harnesses/);
  });
});
