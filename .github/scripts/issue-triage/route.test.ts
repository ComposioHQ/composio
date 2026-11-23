import { describe, expect, test } from 'bun:test';
import {
  DASHBOARD_SUPPORT_URL,
  MISSING_DETAILS_COMMENT,
  REDIRECT_COMMENT,
  THRESHOLDS,
  TOOL_REQUEST_COMMENT,
  needsClassification,
  route,
  type IssueContext,
  type JevAnswers,
  type TriageAction,
} from './route.ts';

function makeAnswers(overrides: Partial<JevAnswers> = {}): JevAnswers {
  return {
    account_specific: 0.05,
    hosted_problem: 0.05,
    sdk_code: 0.1,
    new_toolkit: 0.05,
    is_bug: 0.05,
    missing_details: 0.05,
    feature_request: 0.05,
    sdk_area: { ts: 0.05, py: 0.05, cli: 0.05, docs: 0.05, none: 0.8 },
    ...overrides,
  };
}

function makeIssue(overrides: Partial<IssueContext> = {}): IssueContext {
  return {
    labels: [],
    state: 'open',
    closedByWorkflow: false,
    ...overrides,
  };
}

function addedLabels(actions: TriageAction[]): string[] {
  return actions.filter(a => a.type === 'add-label').map(a => a.label);
}

function removedLabels(actions: TriageAction[]): string[] {
  return actions.filter(a => a.type === 'remove-label').map(a => a.label);
}

describe('needsClassification', () => {
  test('classifies newly opened issues without support labels', () => {
    expect(needsClassification({ type: 'opened' }, [])).toBe(true);
    expect(needsClassification({ type: 'opened' }, ['bug'])).toBe(true);
  });

  test('skips classification when issue already carries support or a support state', () => {
    expect(needsClassification({ type: 'edited' }, ['support'])).toBe(false);
    expect(needsClassification({ type: 'reopened' }, ['support: forwarded'])).toBe(false);
    expect(needsClassification({ type: 'opened' }, ['support: needs human'])).toBe(false);
  });

  test('skips classification on author-comment and manual support label events', () => {
    expect(needsClassification({ type: 'author-comment' }, ['support: redirected'])).toBe(false);
    expect(needsClassification({ type: 'labeled', label: 'support' }, ['support'])).toBe(false);
    expect(
      needsClassification({ type: 'labeled', label: 'support: forwarded' }, [
        'support: needs human',
        'support: forwarded',
      ])
    ).toBe(false);
  });

  test('classifies on triage label unless issue has a support state, and always on dispatch', () => {
    expect(needsClassification({ type: 'labeled', label: 'triage' }, ['triage'])).toBe(true);
    expect(needsClassification({ type: 'labeled', label: 'triage' }, ['support', 'triage'])).toBe(
      true
    );
    expect(
      needsClassification({ type: 'labeled', label: 'triage' }, [
        'support',
        'support: forward failed',
        'triage',
      ])
    ).toBe(false);
    expect(
      needsClassification({ type: 'labeled', label: 'triage' }, [
        'support',
        'support: needs human',
        'triage',
      ])
    ).toBe(false);
    expect(needsClassification({ type: 'dispatch' }, ['support: forwarded'])).toBe(true);
  });
});

describe('non-support triage characterization', () => {
  test('TypeScript SDK bug gets ts, bug, and jkomyno with no support labels or comment', () => {
    const actions = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({
          sdk_code: 0.9,
          is_bug: 0.9,
          sdk_area: { ts: 0.9, py: 0.02, cli: 0.02, docs: 0.02, none: 0.04 },
        }),
      }
    );
    expect(addedLabels(actions)).toEqual(['bug', 'ts']);
    expect(actions.find(a => a.type === 'add-assignees')).toEqual({
      type: 'add-assignees',
      assignees: ['jkomyno'],
    });
    expect(actions.some(a => a.type === 'comment' || a.type === 'close' || a.type === 'forward')).toBe(
      false
    );
  });

  test('docs, cli, and py areas map to their respective labels and assignees', () => {
    for (const [area, assignees] of [
      ['docs', ['shawnesquivel', 'Sushmithamallesh']],
      ['py', ['jkomyno']],
      ['cli', ['CryogenicPlanet']],
    ] as const) {
      const actions = route(
        { type: 'opened' },
        makeIssue(),
        {
          kind: 'answers',
          answers: makeAnswers({
            sdk_code: 0.9,
            sdk_area: { ts: 0.01, py: 0.01, cli: 0.01, docs: 0.01, none: 0.05, [area]: 0.9 },
          }),
        }
      );
      expect(addedLabels(actions)).toEqual([area]);
      expect(actions.find(a => a.type === 'add-assignees')).toEqual({
        type: 'add-assignees',
        assignees: [...assignees],
      });
    }
  });

  test('non-actionable bug report gets bug label and fixed missing-details note', () => {
    const actions = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({ is_bug: 0.85, missing_details: 0.85 }),
      }
    );
    expect(addedLabels(actions)).toEqual(['bug']);
    const comment = actions.find(a => a.type === 'comment');
    expect(comment?.body).toBe(MISSING_DETAILS_COMMENT);
    expect(comment?.body).toContain('steps to reproduce');
    expect(actions.some(a => a.type === 'close')).toBe(false);
  });

  test('open tool request is labeled, pointed at the request board, and closed', () => {
    const actions = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({ new_toolkit: 0.9, missing_details: 0.9 }),
      }
    );
    expect(addedLabels(actions)).toEqual(['tool-request']);
    const comments = actions.filter(a => a.type === 'comment');
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe(TOOL_REQUEST_COMMENT);
    expect(comments[0].body).toContain('https://request.composio.dev/boards/tool-requests');
    expect(actions.some(a => a.type === 'close')).toBe(true);
  });

  test('tool request that is also a bug is never closed and gets bug label instead', () => {
    const actions = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({ new_toolkit: 0.9, is_bug: 0.9, missing_details: 0.9 }),
      }
    );
    expect(addedLabels(actions)).toEqual(['bug']);
    expect(actions.find(a => a.type === 'comment')?.body).toBe(MISSING_DETAILS_COMMENT);
    expect(actions.some(a => a.type === 'close')).toBe(false);
  });

  test('feature request gets feature-request label and stays open even with high new_toolkit', () => {
    const actions = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({ feature_request: 0.85, new_toolkit: 0.85 }),
      }
    );
    expect(addedLabels(actions)).toEqual(['feature-request']);
    expect(actions.some(a => a.type === 'close')).toBe(false);
  });
});

describe('support routing outcomes', () => {
  test('account-specific above high bar redirects, comments, closes, and skips SDK labels', () => {
    const actions = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({
          account_specific: 0.95,
          is_bug: 0.9,
          sdk_area: { ts: 0.9, py: 0.02, cli: 0.02, docs: 0.02, none: 0.04 },
        }),
      }
    );
    expect(addedLabels(actions)).toEqual(['support', 'support: redirected']);
    const comment = actions.find(a => a.type === 'comment');
    expect(comment?.body).toBe(REDIRECT_COMMENT);
    expect(comment?.body).toContain(DASHBOARD_SUPPORT_URL);
    expect(actions.some(a => a.type === 'close')).toBe(true);
    expect(actions.some(a => a.type === 'add-assignees' || a.type === 'forward')).toBe(false);
  });

  test('hosted problem above threshold forwards and stays open without missing-details note', () => {
    const actions = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({ hosted_problem: 0.9, missing_details: 0.9 }),
      }
    );
    expect(addedLabels(actions)).toEqual(['support', 'support: forwarded']);
    expect(actions.some(a => a.type === 'forward')).toBe(true);
    expect(actions.some(a => a.type === 'close' || a.type === 'comment')).toBe(false);
  });

  test('account-specific or hosted inside unclear band sets needs human without forward or close', () => {
    const unclearAccount = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({ account_specific: THRESHOLDS.accountUnclear }),
      }
    );
    expect(addedLabels(unclearAccount)).toEqual(['support', 'support: needs human']);
    expect(unclearAccount.some(a => a.type === 'forward' || a.type === 'close')).toBe(false);

    const unclearHosted = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({ hosted_problem: THRESHOLDS.hostedUnclear }),
      }
    );
    expect(addedLabels(unclearHosted)).toEqual(['support', 'support: needs human']);
    expect(unclearHosted.some(a => a.type === 'forward' || a.type === 'close')).toBe(false);
  });

  test('hosted above threshold with account-specific in unclear band sets needs human', () => {
    const actions = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({
          account_specific: THRESHOLDS.accountUnclear,
          hosted_problem: 0.95,
        }),
      }
    );
    expect(addedLabels(actions)).toEqual(['support', 'support: needs human']);
    expect(actions.some(a => a.type === 'forward' || a.type === 'close')).toBe(false);
  });

  test('Python SDK bug with hosted signal keeps py, bug, and assignees alongside forwarded', () => {
    const actions = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({
          hosted_problem: 0.9,
          sdk_code: 0.85,
          is_bug: 0.9,
          sdk_area: { ts: 0.02, py: 0.9, cli: 0.02, docs: 0.02, none: 0.04 },
        }),
      }
    );
    expect(addedLabels(actions)).toEqual(['support', 'support: forwarded', 'bug', 'py']);
    expect(actions.find(a => a.type === 'add-assignees')).toEqual({
      type: 'add-assignees',
      assignees: ['jkomyno'],
    });
    expect(actions.some(a => a.type === 'forward')).toBe(true);
  });

  test('hosted above threshold with new-toolkit signal forwards with no close or tool-request note', () => {
    const actions = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({ hosted_problem: 0.9, new_toolkit: 0.95 }),
      }
    );
    expect(addedLabels(actions)).toEqual(['support', 'support: forwarded']);
    expect(actions.some(a => a.type === 'forward')).toBe(true);
    expect(actions.some(a => a.type === 'close' || a.type === 'comment')).toBe(false);
  });

  test('existing support state is never redirected again on dispatch', () => {
    const actions = route(
      { type: 'dispatch' },
      makeIssue({ labels: ['support', 'support: forwarded'] }),
      {
        kind: 'answers',
        answers: makeAnswers({ account_specific: 0.99, hosted_problem: 0.9 }),
      }
    );
    expect(addedLabels(actions)).not.toContain('support: redirected');
    expect(actions.some(a => a.type === 'close')).toBe(false);
  });
});

describe('overrides, recovery, closed issues, and boundaries', () => {
  test('author-comment on workflow-closed redirected issue reopens, forwards, and swaps state', () => {
    const actions = route(
      { type: 'author-comment' },
      makeIssue({
        labels: ['support', 'support: redirected'],
        state: 'closed',
        closedByWorkflow: true,
      }),
      { kind: 'none' }
    );
    expect(actions.some(a => a.type === 'reopen')).toBe(true);
    expect(actions.some(a => a.type === 'forward')).toBe(true);
    expect(removedLabels(actions)).toEqual(['support: redirected']);
    expect(addedLabels(actions)).toEqual(['support: forwarded']);
    expect(actions.some(a => a.type === 'comment')).toBe(false);
  });

  test('author-comment on maintainer-closed redirected issue or non-redirected issue does nothing', () => {
    expect(
      route(
        { type: 'author-comment' },
        makeIssue({
          labels: ['support', 'support: redirected'],
          state: 'closed',
          closedByWorkflow: false,
        }),
        { kind: 'none' }
      )
    ).toEqual([]);

    expect(
      route(
        { type: 'author-comment' },
        makeIssue({ labels: ['bug'], state: 'closed', closedByWorkflow: true }),
        { kind: 'none' }
      )
    ).toEqual([]);
  });

  test('any event other than author-comment on a closed issue produces no actions', () => {
    for (const event of [
      { type: 'opened' },
      { type: 'edited' },
      { type: 'labeled', label: 'triage' },
      { type: 'dispatch' },
    ] as const) {
      expect(
        route(
          event,
          makeIssue({ state: 'closed', closedByWorkflow: true }),
          { kind: 'answers', answers: makeAnswers({ hosted_problem: 0.95 }) }
        )
      ).toEqual([]);
    }
  });

  test('maintainer setting support: forwarded on needs human forwards and removes old state', () => {
    const actions = route(
      { type: 'labeled', label: 'support: forwarded' },
      makeIssue({ labels: ['support', 'support: needs human', 'support: forwarded'] }),
      { kind: 'none' }
    );
    expect(actions.some(a => a.type === 'forward')).toBe(true);
    expect(removedLabels(actions)).toEqual(['support: needs human']);
  });

  test('bare support added by hand forwards and sets support: forwarded', () => {
    const actions = route(
      { type: 'labeled', label: 'support' },
      makeIssue({ labels: ['support'] }),
      { kind: 'none' }
    );
    expect(actions.some(a => a.type === 'forward')).toBe(true);
    expect(addedLabels(actions)).toEqual(['support: forwarded']);
  });

  test('triage label on support: forward failed retries forward and swaps to forwarded', () => {
    const actions = route(
      { type: 'labeled', label: 'triage' },
      makeIssue({ labels: ['support', 'support: forward failed', 'triage'] }),
      { kind: 'none' }
    );
    expect(actions.some(a => a.type === 'forward')).toBe(true);
    expect(removedLabels(actions)).toEqual(['support: forward failed', 'triage']);
    expect(addedLabels(actions)).toEqual(['support: forwarded']);
  });

  test('edited or reopened on issue in support: forwarded produces no actions', () => {
    const issue = makeIssue({ labels: ['support', 'support: forwarded'] });
    expect(route({ type: 'edited' }, issue, { kind: 'none' })).toEqual([]);
    expect(route({ type: 'reopened' }, issue, { kind: 'none' })).toEqual([]);
  });

  test('classification failure adds only triage label', () => {
    expect(route({ type: 'opened' }, makeIssue(), { kind: 'failed' })).toEqual([
      { type: 'add-label', label: 'triage' },
    ]);
  });

  test('exact threshold boundaries route to the documented side', () => {
    const atRedirect = route(
      { type: 'opened' },
      makeIssue(),
      { kind: 'answers', answers: makeAnswers({ account_specific: THRESHOLDS.accountRedirect }) }
    );
    expect(addedLabels(atRedirect)).toEqual(['support', 'support: redirected']);

    const justBelowRedirect = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({ account_specific: THRESHOLDS.accountRedirect - 0.001 }),
      }
    );
    expect(addedLabels(justBelowRedirect)).toEqual(['support', 'support: needs human']);

    const atHosted = route(
      { type: 'opened' },
      makeIssue(),
      { kind: 'answers', answers: makeAnswers({ hosted_problem: THRESHOLDS.hostedForward }) }
    );
    expect(addedLabels(atHosted)).toEqual(['support', 'support: forwarded']);

    const justBelowHosted = route(
      { type: 'opened' },
      makeIssue(),
      {
        kind: 'answers',
        answers: makeAnswers({ hosted_problem: THRESHOLDS.hostedForward - 0.001 }),
      }
    );
    expect(addedLabels(justBelowHosted)).toEqual(['support', 'support: needs human']);
  });
});
