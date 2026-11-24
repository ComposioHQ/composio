import { describe, expect, test } from 'bun:test';
import {
  DASHBOARD_SUPPORT_URL,
  MISSING_DETAILS_COMMENT,
  REDIRECT_COMMENT,
  REDIRECT_MARKER,
  REDIRECT_PENDING,
  THRESHOLDS,
  TOOL_REQUEST_COMMENT,
  needsClassification,
  route,
  type IssueContext,
  type JevAnswers,
  type TriageAction,
  type TriageEvent,
} from './route.ts';

const baseAnswers: JevAnswers = {
  account_specific: 0.05,
  hosted_problem: 0.05,
  sdk_code: 0.1,
  new_toolkit: 0.05,
  is_bug: 0.05,
  missing_details: 0.05,
  feature_request: 0.05,
  sdk_area: { ts: 0.05, py: 0.05, cli: 0.05, docs: 0.05, none: 0.8 },
};

const openIssue: IssueContext = { labels: [], state: 'open', closedByWorkflow: false };
const added = (actions: TriageAction[]) => actions.filter(a => a.type === 'add-label').map(a => a.label);
const removed = (actions: TriageAction[]) => actions.filter(a => a.type === 'remove-label').map(a => a.label);
const runAnswers = (
  answers: Partial<JevAnswers>,
  issue: Partial<IssueContext> = {},
  event: TriageEvent = { type: 'opened' }
) => route(event, { ...openIssue, ...issue }, { kind: 'answers', answers: { ...baseAnswers, ...answers } });

describe('needsClassification', () => {
  test('gating across opened, support states, overrides, triage, and dispatch', () => {
    expect(needsClassification({ type: 'opened' }, [])).toBe(true);
    expect(needsClassification({ type: 'edited' }, ['support'])).toBe(false);
    expect(needsClassification({ type: 'reopened' }, ['support: forwarded'])).toBe(false);
    expect(needsClassification({ type: 'author-comment' }, ['support: redirected'])).toBe(false);
    expect(needsClassification({ type: 'labeled', label: 'support' }, ['support'])).toBe(false);
    expect(needsClassification({ type: 'labeled', label: 'support: forwarded' }, ['support: needs human'])).toBe(false);
    expect(needsClassification({ type: 'labeled', label: 'triage' }, ['support', 'triage'])).toBe(true);
    expect(needsClassification({ type: 'labeled', label: 'triage' }, ['support', 'support: forward failed', 'triage'])).toBe(false);
    // Triage or a numbered dispatch on needs human is a fresh classification; other explicit states are preserved.
    expect(needsClassification({ type: 'labeled', label: 'triage' }, ['support', 'support: needs human', 'triage'])).toBe(true);
    expect(needsClassification({ type: 'dispatch' }, ['support', 'support: needs human'])).toBe(true);
    expect(needsClassification({ type: 'dispatch' }, [])).toBe(true);
    for (const state of ['support: forwarded', 'support: redirected', 'support: forward failed']) {
      expect(needsClassification({ type: 'dispatch' }, ['support', state])).toBe(false);
      expect(needsClassification({ type: 'labeled', label: 'triage' }, ['support', state, 'triage'])).toBe(false);
    }
  });
});

describe('non-support triage characterization', () => {
  test('SDK areas map to labels and assignees without comments or closes', () => {
    for (const [area, assignees] of [
      ['ts', ['jkomyno']],
      ['py', ['jkomyno']],
      ['cli', ['CryogenicPlanet']],
      ['docs', ['shawnesquivel', 'Sushmithamallesh']],
    ] as const) {
      const actions = runAnswers({
        is_bug: area === 'ts' ? 0.9 : 0.05,
        sdk_area: { ts: 0.01, py: 0.01, cli: 0.01, docs: 0.01, none: 0.05, [area]: 0.9 },
      });
      expect(added(actions)).toEqual(area === 'ts' ? ['bug', 'ts'] : [area]);
      expect(actions.find(a => a.type === 'add-assignees')).toEqual({ type: 'add-assignees', assignees: [...assignees] });
      expect(actions.some(a => a.type === 'comment' || a.type === 'close' || a.type === 'forward')).toBe(false);
    }
  });

  test('non-actionable bug gets bug label and fixed missing-details note', () => {
    const actions = runAnswers({ is_bug: 0.85, missing_details: 0.85 });
    expect(added(actions)).toEqual(['bug']);
    expect(actions.find(a => a.type === 'comment')?.body).toBe(MISSING_DETAILS_COMMENT);
    expect(actions.some(a => a.type === 'close')).toBe(false);
  });

  test('an SDK feature request gets both its area and feature-request labels', () => {
    const actions = runAnswers({
      feature_request: 0.85,
      sdk_area: { ...baseAnswers.sdk_area, ts: 0.9, none: 0.05 },
    });
    expect(added(actions)).toEqual(['ts', 'feature-request']);
    expect(actions.some(a => a.type === 'close')).toBe(false);
  });

  test('open tool request is labeled, pointed at request board, and closed unless bug or feature-request', () => {
    const req = runAnswers({ new_toolkit: 0.9, missing_details: 0.9 });
    expect(added(req)).toEqual(['tool-request']);
    expect(req.filter(a => a.type === 'comment').map(a => a.body)).toEqual([TOOL_REQUEST_COMMENT]);
    expect(req.some(a => a.type === 'close')).toBe(true);

    const bug = runAnswers({ new_toolkit: 0.9, is_bug: 0.9, missing_details: 0.9 });
    expect(added(bug)).toEqual(['bug']);
    expect(bug.find(a => a.type === 'comment')?.body).toBe(MISSING_DETAILS_COMMENT);
    expect(bug.some(a => a.type === 'close')).toBe(false);

    const feat = runAnswers({ new_toolkit: 0.9, feature_request: 0.85 });
    expect(added(feat)).toEqual(['feature-request']);
    expect(feat.some(a => a.type === 'close')).toBe(false);
  });
});

describe('support routing outcomes', () => {
  test('account-specific above high bar redirects, comments, closes, and skips SDK triage', () => {
    const actions = runAnswers({
      account_specific: 0.95,
      is_bug: 0.9,
      sdk_area: { ts: 0.9, py: 0.02, cli: 0.02, docs: 0.02, none: 0.04 },
    });
    expect(added(actions)).toEqual(['support', 'support: redirected']);
    const comment = actions.find(a => a.type === 'comment')?.body;
    expect(comment).toBe(REDIRECT_COMMENT);
    expect(comment).toContain(DASHBOARD_SUPPORT_URL);
    expect(actions.some(a => a.type === 'close')).toBe(true);
    expect(actions.some(a => a.type === 'add-assignees' || a.type === 'forward')).toBe(false);
  });

  test('hosted above threshold forwards without close, missing-details note, or tool-request close', () => {
    const hosted = runAnswers({ hosted_problem: 0.9, missing_details: 0.9, new_toolkit: 0.95 });
    expect(added(hosted)).toEqual(['support', 'support: forwarded']);
    expect(hosted.some(a => a.type === 'forward')).toBe(true);
    expect(hosted.some(a => a.type === 'close' || a.type === 'comment')).toBe(false);
  });

  test('unclear bands (including account-unclear with high hosted) set needs human without forward or close', () => {
    for (const answers of [
      { account_specific: THRESHOLDS.accountUnclear },
      { hosted_problem: THRESHOLDS.hostedUnclear },
      { account_specific: THRESHOLDS.accountUnclear, hosted_problem: 0.95 },
    ]) {
      const actions = runAnswers(answers);
      expect(added(actions)).toEqual(['support', 'support: needs human']);
      expect(actions.some(a => a.type === 'forward' || a.type === 'close')).toBe(false);
    }
  });

  test('Python SDK bug with hosted signal keeps py, bug, and assignees alongside forwarded', () => {
    const actions = runAnswers({
      hosted_problem: 0.9,
      is_bug: 0.9,
      sdk_area: { ts: 0.02, py: 0.9, cli: 0.02, docs: 0.02, none: 0.04 },
    });
    expect(added(actions)).toEqual(['support', 'support: forwarded', 'bug', 'py']);
    expect(actions.find(a => a.type === 'add-assignees')).toEqual({ type: 'add-assignees', assignees: ['jkomyno'] });
    expect(actions.some(a => a.type === 'forward')).toBe(true);
  });

  test('existing explicit support states are preserved when answers arrive', () => {
    for (const state of ['support: forwarded', 'support: redirected', 'support: forward failed']) {
      const actions = runAnswers(
        { account_specific: 0.99, hosted_problem: 0.9, new_toolkit: 0.95 },
        { labels: ['support', state] },
        { type: 'dispatch' }
      );
      expect(actions).toEqual([]);
    }
  });

  test('only opened events and explicit triage may auto-close; edits and reopens go to needs human', () => {
    for (const type of ['edited', 'reopened'] as const) {
      const actions = runAnswers({ account_specific: 0.95 }, {}, { type });
      expect(added(actions)).toEqual(['support', 'support: needs human']);
      expect(actions.some(a => a.type === 'close' || a.type === 'comment')).toBe(false);

      // A tool request on edit is labeled but never commented on or closed.
      const tool = runAnswers({ new_toolkit: 0.9 }, {}, { type });
      expect(added(tool)).toEqual(['tool-request']);
      expect(tool.some(a => a.type === 'close' || a.type === 'comment')).toBe(false);
    }
    for (const event of [{ type: 'dispatch' }, { type: 'labeled', label: 'triage' }] as const) {
      const actions = runAnswers({ account_specific: 0.95 }, { labels: ['triage'] }, event);
      expect(actions.some(a => a.type === 'close')).toBe(true);
      expect(removed(actions)).toEqual(['triage']);
    }
  });

  test('fresh classification of needs human can redirect or forward, and weak signals keep needs human', () => {
    const labels = ['support', 'support: needs human', 'triage'];
    const redirect = runAnswers({ account_specific: 0.95 }, { labels }, { type: 'labeled', label: 'triage' });
    expect(added(redirect)).toEqual(['support: redirected']);
    expect(removed(redirect)).toEqual(['support: needs human', 'triage']);
    expect(redirect.some(a => a.type === 'close')).toBe(true);

    const forward = runAnswers({ hosted_problem: 0.9 }, { labels }, { type: 'labeled', label: 'triage' });
    expect(added(forward)).toEqual(['support: forwarded']);
    expect(forward.some(a => a.type === 'forward')).toBe(true);

    const weak = runAnswers({ new_toolkit: 0.95 }, { labels }, { type: 'labeled', label: 'triage' });
    expect(added(weak)).toEqual([]);
    expect(removed(weak)).toEqual(['triage']);
    expect(weak.some(a => a.type === 'forward' || a.type === 'close' || a.type === 'comment')).toBe(false);
  });
});

describe('overrides, recovery, closed issues, and boundaries', () => {
  test('author-comment reopens and forwards only workflow-closed redirected issues', () => {
    const ok = route(
      { type: 'author-comment' },
      { labels: ['support', 'support: redirected'], state: 'closed', closedByWorkflow: true },
      { kind: 'none' }
    );
    expect(ok.some(a => a.type === 'reopen')).toBe(true);
    expect(ok.some(a => a.type === 'forward')).toBe(true);
    expect(removed(ok)).toEqual(['support: redirected']);
    expect(added(ok)).toEqual(['support: forwarded']);
    expect(ok.some(a => a.type === 'comment')).toBe(false);

    expect(
      route(
        { type: 'author-comment' },
        { labels: ['support', 'support: redirected'], state: 'closed', closedByWorkflow: false },
        { kind: 'none' }
      )
    ).toEqual([]);
    expect(
      route({ type: 'author-comment' }, { labels: ['bug'], state: 'closed', closedByWorkflow: true }, { kind: 'none' })
    ).toEqual([]);
  });

  test('author-comment resumes a half-recovered open issue but never a maintainer-reopened redirect', () => {
    const open = (labels: string[]) => ({ labels, state: 'open' as const, closedByWorkflow: false });
    const resumed = route({ type: 'author-comment' }, open(['support', 'support: redirected', 'support: forward failed']), { kind: 'none' });
    expect(resumed.some(a => a.type === 'forward')).toBe(true);
    expect(resumed.some(a => a.type === 'reopen')).toBe(false);
    expect(route({ type: 'author-comment' }, open(['support', 'support: redirected']), { kind: 'none' })).toEqual([]);

    // An early reply that lands before an unfinished redirect closes is forwarded, not lost to a later close.
    const early = route({ type: 'author-comment' }, open(['support', 'support: redirected', REDIRECT_PENDING]), { kind: 'none' });
    expect(early.some(a => a.type === 'forward')).toBe(true);
    expect(removed(early)).toEqual(['support: redirected']);
    expect(early.some(a => a.type === 'close' || a.type === 'reopen')).toBe(false);
  });

  test('forward failed retries directly on dispatch or triage, and unfinished redirects resume only with the pending marker', () => {
    const none = { kind: 'none' } as const;
    const failed = { ...openIssue, labels: ['support', 'support: forward failed'] };
    const dispatch = route({ type: 'dispatch' }, failed, none);
    expect(dispatch.some(a => a.type === 'forward')).toBe(true);
    expect(added(dispatch)).toEqual(['support: forwarded']);
    expect(removed(dispatch)).toEqual(['support: forward failed']);
    // Failed state wins over a stale redirected label left by a partial recovery.
    const both = route({ type: 'dispatch' }, { ...openIssue, labels: ['support', 'support: redirected', 'support: forward failed', 'triage'] }, none);
    expect(both.some(a => a.type === 'forward')).toBe(true);
    expect(both.some(a => a.type === 'close')).toBe(false);

    const pending = { ...openIssue, labels: ['support', 'support: redirected', REDIRECT_PENDING, 'triage'] };
    for (const event of [{ type: 'dispatch' }, { type: 'labeled', label: 'triage' }] as const) {
      const resume = route(event, pending, none);
      expect(resume.filter(a => a.type === 'comment').map(a => a.body)).toEqual([REDIRECT_COMMENT]);
      expect(resume.some(a => a.type === 'close')).toBe(true);
      expect(removed(resume)).toEqual(['triage']);
    }
    expect(route({ type: 'edited' }, pending, none)).toEqual([]);
    expect(route({ type: 'reopened' }, pending, none)).toEqual([{ type: 'remove-label', label: REDIRECT_PENDING }]);
    expect(route({ type: 'dispatch' }, { ...openIssue, labels: ['support', 'support: redirected'] }, none)).toEqual([]);
    expect(REDIRECT_COMMENT.startsWith(REDIRECT_MARKER)).toBe(true);
  });

  test('closed issues ignore all events except author-comment; failures add only triage', () => {
    for (const event of [{ type: 'opened' }, { type: 'edited' }, { type: 'labeled', label: 'triage' }, { type: 'dispatch' }] as const) {
      expect(runAnswers({ hosted_problem: 0.95 }, { state: 'closed', closedByWorkflow: true }, event)).toEqual([]);
    }
    expect(route({ type: 'opened' }, openIssue, { kind: 'failed' })).toEqual([{ type: 'add-label', label: 'triage' }]);
  });

  test('maintainer overrides, bare support, triage retry on forward failed, and no-op edits', () => {
    const swap = route(
      { type: 'labeled', label: 'support: forwarded' },
      { ...openIssue, labels: ['support', 'support: needs human', 'support: forwarded'] },
      { kind: 'none' }
    );
    expect(swap.some(a => a.type === 'forward')).toBe(true);
    expect(removed(swap)).toEqual(['support: needs human']);

    const bare = route({ type: 'labeled', label: 'support' }, { ...openIssue, labels: ['support'] }, { kind: 'none' });
    expect(bare.some(a => a.type === 'forward')).toBe(true);
    expect(added(bare)).toEqual(['support: forwarded']);

    const retry = route(
      { type: 'labeled', label: 'triage' },
      { ...openIssue, labels: ['support', 'support: forward failed', 'triage'] },
      { kind: 'none' }
    );
    expect(retry.some(a => a.type === 'forward')).toBe(true);
    expect(removed(retry)).toEqual(['support: forward failed', 'triage']);
    expect(added(retry)).toEqual(['support: forwarded']);

    const forwarded = { ...openIssue, labels: ['support', 'support: forwarded'] };
    expect(route({ type: 'edited' }, forwarded, { kind: 'none' })).toEqual([]);
    expect(route({ type: 'reopened' }, forwarded, { kind: 'none' })).toEqual([]);
  });

  test('exact threshold boundaries route to the documented side', () => {
    expect(added(runAnswers({ account_specific: THRESHOLDS.accountRedirect }))).toEqual(['support', 'support: redirected']);
    expect(added(runAnswers({ account_specific: THRESHOLDS.accountRedirect - 0.001 }))).toEqual(['support', 'support: needs human']);
    expect(added(runAnswers({ hosted_problem: THRESHOLDS.hostedForward }))).toEqual(['support', 'support: forwarded']);
    expect(added(runAnswers({ hosted_problem: THRESHOLDS.hostedForward - 0.001 }))).toEqual(['support', 'support: needs human']);
  });
});
