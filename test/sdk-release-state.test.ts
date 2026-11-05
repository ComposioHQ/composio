import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import { showStatus, stageOutcome } from '../scripts/sdk-release/report';
import {
  DISPLAY,
  STAGES,
  describe as describeState,
  type ReleaseState,
  type Stage,
  type StateName,
} from '../scripts/sdk-release/state';
import { runRelease, type Fetch } from './sdk-release-harness';

const pull = 'https://github.com/ComposioHQ/composio/pull/9';
const run = '77';

/** One example of every state, so the table checks below cover each one. */
const EXAMPLES: { readonly [Name in StateName]: Extract<ReleaseState, { _tag: Name }> } = {
  NeedsInput: { _tag: 'NeedsInput', reason: 'Use the SDK release request issue form' },
  Waiting: { _tag: 'Waiting', pull },
  Blocked: { _tag: 'Blocked', release: '20' },
  Empty: { _tag: 'Empty' },
  InReview: { _tag: 'InReview', pull },
  Abandoned: { _tag: 'Abandoned', pull },
  Refused: { _tag: 'Refused', pull, reason: 'Missing green final-head docs check' },
  Tagged: { _tag: 'Tagged', tag: 'sdk-release/8' },
  Published: { _tag: 'Published', versions: [{ name: '`@composio/core`', version: '1.0.1' }] },
  Failed: {
    _tag: 'Failed',
    stage: 'publish',
    jobs: ['publish-pypi'],
    run: 'https://github.com/ComposioHQ/composio/actions/runs/77',
  },
};
const stages = Object.keys(STAGES) as Stage[];
const ends = (stage: Stage): ReadonlyArray<StateName> => STAGES[stage].to;

describe('release state table', () => {
  test('stages chain: each stage starts where the previous one can end', () => {
    expect(stages).toEqual(['request', 'review', 'publish']);
    for (const [previous, next] of [
      ['request', 'review'],
      ['review', 'publish'],
    ] as const)
      expect(ends(previous)).toContain(STAGES[next].from);
  });

  test('every state ends exactly one stage, apart from Failed, which ends any stage', () => {
    const ended = stages.flatMap(ends);
    expect(new Set(ended).size).toBe(ended.length);
    expect(new Set([...ended, 'Failed'])).toEqual(new Set(Object.keys(EXAMPLES)));
  });

  test('a release stays open only while it can still advance', () => {
    const open = (Object.keys(DISPLAY) as StateName[]).filter(name => DISPLAY[name].close === null);
    expect(open.toSorted()).toEqual(['Failed', 'InReview', 'Tagged']);
    expect(DISPLAY.Published.close).toBe('completed');
    const labels = Object.values(DISPLAY).map(display => display.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test.each(Object.values(EXAMPLES))('$_tag has a status text with its facts', state => {
    const text = describeState(state);
    expect(text.length).toBeGreaterThan(20);
    for (const value of Object.values(state).filter(value => typeof value === 'string'))
      if (value !== state._tag) expect(text).toContain(value);
  });
});

const results = (failed: Record<string, 'failure' | 'cancelled'> = {}) => ({
  plan: 'success' as const,
  prepare: 'skipped' as const,
  ...failed,
});
const outcome = (
  stage: Stage,
  recorded: ReleaseState | undefined,
  failed: Record<string, 'failure' | 'cancelled'> = {}
) =>
  runRelease(
    stageOutcome(
      stage,
      results(failed),
      Option.fromNullishOr(recorded),
      Effect.succeed(EXAMPLES.Published),
      run
    )
  );

describe('stage outcome', () => {
  test('a stage ends in the state its last job recorded', async () => {
    expect(await outcome('request', EXAMPLES.InReview)).toEqual(EXAMPLES.InReview);
    expect(await outcome('review', EXAMPLES.Abandoned)).toEqual(EXAMPLES.Abandoned);
  });

  test('a publish stage whose jobs all passed is published', async () => {
    expect(await outcome('publish', undefined)).toEqual(EXAMPLES.Published);
  });

  test('a failed or cancelled job fails the stage, naming only those jobs', async () => {
    expect(
      await outcome('request', EXAMPLES.InReview, { 'release-pr': 'cancelled', other: 'failure' })
    ).toEqual({
      _tag: 'Failed',
      stage: 'request',
      jobs: ['release-pr', 'other'],
      run: 'https://github.com/ComposioHQ/composio/actions/runs/77',
    });
  });

  test('a state that does not end the stage is refused', async () => {
    await expect(outcome('review', EXAMPLES.Waiting)).rejects.toThrow(
      'The review stage cannot end in Waiting'
    );
  });
});

/** A fake request issue with its comments and labels. */
function requestIssue(comments: { id: number; login: string; body: string }[] = []) {
  const labels = new Set(['SDK release']);
  const writes: string[] = [];
  let state = 'open';
  const fetcher: Fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/repos/ComposioHQ/composio', '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const respond = (data: unknown) => new Response(JSON.stringify(data));
    if (method !== 'GET') writes.push(`${method} ${path}`);
    if (method === 'GET' && path === '/issues/8/comments')
      return respond(comments.map(({ id, login, body }) => ({ id, user: { login }, body })));
    if (method === 'GET' && path === '/issues/8/labels')
      return respond([...labels].map(name => ({ name })));
    if (method === 'POST' && path === '/issues/8/comments') {
      comments.push({ id: comments.length + 1, login: 'github-actions[bot]', body: body.body });
      return respond({ id: comments.length });
    }
    const edited = /^\/issues\/comments\/(\d+)$/.exec(path);
    if (method === 'PATCH' && edited) {
      const comment = comments.find(comment => comment.id === Number(edited[1]));
      if (comment) comment.body = body.body;
      return respond({});
    }
    if (method === 'DELETE' && path.startsWith('/issues/8/labels/')) {
      labels.delete(decodeURIComponent(path.slice('/issues/8/labels/'.length)));
      return respond([]);
    }
    if (method === 'POST' && path === '/issues/8/labels') {
      for (const label of body.labels) labels.add(label);
      return respond([]);
    }
    if (method === 'PATCH' && path === '/issues/8') {
      state = body.state;
      return respond({});
    }
    throw new Error(`Unexpected request: ${method} ${path}`);
  };
  return { fetcher, comments, labels, writes, state: () => state };
}

describe('status on the request issue', () => {
  test('one status comment and one label follow the release, and a final state closes it', async () => {
    const issue = requestIssue();
    await runRelease(showStatus(8, EXAMPLES.InReview, run), issue.fetcher);
    expect(issue.comments).toHaveLength(1);
    expect([...issue.labels]).toEqual(['SDK release', 'sdk-release:in-review']);
    expect(issue.state()).toBe('open');

    await runRelease(showStatus(8, EXAMPLES.Published, run), issue.fetcher);
    expect(issue.comments).toHaveLength(1);
    expect(issue.comments[0].body).toContain('`@composio/core` 1.0.1');
    expect([...issue.labels]).toEqual(['SDK release', 'sdk-release:published']);
    expect(issue.state()).toBe('closed');
  });

  test('a comment that copies the status marker is never edited unless the workflow wrote it', async () => {
    const issue = requestIssue([
      { id: 1, login: 'someone', body: '<!-- sdk-release-status -->\nfake status' },
    ]);
    await runRelease(showStatus(8, EXAMPLES.Waiting, run), issue.fetcher);
    expect(issue.comments[0].body).toContain('fake status');
    expect(issue.comments).toHaveLength(2);
    expect(issue.writes).toContain('POST /issues/8/comments');
  });
});
