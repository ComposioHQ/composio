import { describe, expect, test } from 'bun:test';
import { evaluate, type ScoredIssue } from '../scripts/issue-triage/calibrate.ts';
import { THRESHOLDS } from '../scripts/issue-triage/route.ts';
import { answers } from './issue-triage-harness.ts';

describe('calibration metrics', () => {
  const scored = (number: number, labels: string[], overrides: Parameters<typeof answers>[0]): ScoredIssue => ({
    number,
    title: 'Synthetic',
    body: 'Synthetic',
    labels,
    created_at: '2026-04-02T00:00:00Z',
    answers: answers(overrides),
  });

  test('support precision is scoped to SDK-labeled negatives; other labels never become negatives', () => {
    const result = evaluate(
      [
        scored(1, ['support'], { hosted_problem: 0.9 }), // true positive
        scored(2, ['ts'], { hosted_problem: 0.9 }), // SDK-labeled negative flagged as support
        scored(3, ['py'], {}), // SDK-labeled negative, correctly not support
        scored(4, ['bug'], { hosted_problem: 0.9 }), // a bug label does not establish a support negative
      ],
      {},
      THRESHOLDS
    );
    expect(result).toMatchObject({ tp: 1, fp: 1, fn: 0, sdkTotal: 2, precisionVsSdkLabeledNegatives: 0.5 });
    expect('precision' in result).toBe(false);
  });
});
