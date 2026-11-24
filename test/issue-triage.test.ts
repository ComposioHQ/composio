import { describe, expect, test } from 'bun:test';
import { Cause, Effect, Exit, Layer, Option } from 'effect';
import { StepOutputs } from '../scripts/lib/actions.ts';
import { GitHubApiError } from '../scripts/lib/github.ts';
import { Issues, WORKFLOW_BOT, type Issue } from '../scripts/issue-triage/issues.ts';
import { Jev, JevError, type JevAnswers } from '../scripts/issue-triage/jev.ts';
import { Unreachable } from '../scripts/issue-triage/http.ts';
import { REDIRECT_PENDING, REDIRECTED } from '../scripts/issue-triage/route.ts';
import {
  admission,
  apply,
  REQUEST_LABELS,
  authorize,
  classify,
  WorkflowRun,
  type Classification,
  type EventPayload,
} from '../scripts/issue-triage/workflow.ts';
import { answers, fakePlain, plainLayer, runWith } from './issue-triage-harness.ts';

type Step = { id?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Job = {
  environment?: string;
  concurrency?: { group: string; 'cancel-in-progress': boolean; queue?: string };
  strategy?: { 'fail-fast': boolean; matrix: { batch: string } };
  permissions: Record<string, string>;
  steps: Step[];
  needs?: string;
  if?: string;
  'timeout-minutes'?: number | string;
};
type Workflow = {
  permissions: Record<string, string>;
  jobs: Record<'authorize' | 'classify' | 'apply', Job>;
  on: {
    issues: { types: string[] };
    issue_comment: { types: string[] };
    workflow_dispatch: { inputs: { issue_number: { required: boolean } } };
  };
};

const rawWorkflow = await Bun.file(new URL('../.github/workflows/issue-triage.yml', import.meta.url)).text();
const workflow = Bun.YAML.parse(rawWorkflow) as Workflow;
const scriptStep = (job: Job) => job.steps.find(step => step.run?.startsWith('bun scripts/issue-triage/main.ts'));

describe('workflow', () => {
  test('permissions, environments, secrets, triggers, and checkouts are strictly scoped', () => {
    const { authorize: auth, classify: cls, apply: app } = workflow.jobs;
    expect(workflow.permissions).toEqual({});
    expect(auth.permissions).toEqual({ contents: 'read' });
    expect(cls.permissions).toEqual({ issues: 'read', contents: 'read' });
    expect(cls.environment).toBe('issue-triage');
    expect(app.environment).toBeUndefined();
    expect(app.permissions).toEqual({ issues: 'write', contents: 'read' });

    expect(scriptStep(auth)?.run).toBe('bun scripts/issue-triage/main.ts authorize');
    expect(scriptStep(cls)?.run).toBe('bun scripts/issue-triage/main.ts classify');
    expect(scriptStep(app)?.run).toBe('bun scripts/issue-triage/main.ts apply');
    expect(Object.keys(scriptStep(auth)?.env ?? {})).toEqual(['GITHUB_TOKEN']);
    expect(Object.keys(scriptStep(cls)?.env ?? {}).sort()).toEqual(['GITHUB_TOKEN', 'TYPESAFE_API_KEY']);
    expect(Object.keys(scriptStep(app)?.env ?? {}).sort()).toEqual(['CLASSIFICATION', 'GITHUB_TOKEN', 'ISSUE_NUMBERS', 'PLAIN_API_KEY']);
    expect(scriptStep(app)?.env?.PLAIN_API_KEY).toBe('${{ secrets.PLAIN_API_KEY }}');
    expect(rawWorkflow).not.toContain('ANTHROPIC_API_KEY');
    expect(rawWorkflow).not.toContain('actions/github-script');

    expect(workflow.on.issues.types).toEqual(['opened', 'reopened', 'edited', 'labeled']);
    expect(workflow.on.issue_comment.types).toEqual(['created']);
    expect(workflow.on.workflow_dispatch.inputs.issue_number.required).toBe(false);
    for (const job of [auth, cls, app]) {
      const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'));
      expect(checkout?.with).toEqual({ ref: 'next', 'persist-credentials': false });
      expect(job.steps.some(step => step.run === 'pnpm install --frozen-lockfile --ignore-scripts')).toBe(true);
    }
  });

  test('apply runs per issue group, serialized, and never cancels a sibling batch', () => {
    const app = workflow.jobs.apply;
    // The job-level pre-filter must match the script's admission rule.
    expect(workflow.jobs.authorize.if).toContain(`contains(github.event.issue.labels.*.name, '${REDIRECTED}')`);
    expect(workflow.jobs.authorize.if).toContain(`contains(fromJSON('${JSON.stringify(REQUEST_LABELS)}'), github.event.label.name)`);
    expect(app.needs).toBe('classify');
    expect(app.if).toBe("needs.classify.outputs.classification != ''");
    expect(app.concurrency).toEqual({ group: 'issue-triage-apply-${{ matrix.batch.group }}', 'cancel-in-progress': false, queue: 'max' });
    expect(app.strategy?.['fail-fast']).toBe(false);
    expect(app.strategy?.matrix.batch).toContain('fromJSON(needs.classify.outputs.batches');
    expect(scriptStep(app)?.env?.ISSUE_NUMBERS).toBe('${{ toJSON(matrix.batch.numbers) }}');
  });
});

// --- In-memory GitHub, real routing and Plain client over a fake Plain backend ---

type Fail = (op: string, arg: string) => GitHubApiError | undefined;
const boom = (status = 500) => new GitHubApiError({ status, method: 'POST', path: '/mock', message: 'mock write failure' });

interface WorldInit {
  readonly state?: 'open' | 'closed';
  readonly labels?: string[];
  readonly closedBy?: string;
  readonly author?: { login: string; id?: number };
  readonly pullRequest?: boolean;
  readonly openFailed?: number[];
  readonly permission?: boolean | GitHubApiError;
}

function createWorld(init: WorldInit = {}) {
  const plain = fakePlain();
  const w = {
    state: init.state ?? 'open',
    labels: new Set(init.labels ?? []),
    closedBy: init.closedBy ?? (init.state === 'closed' ? WORKFLOW_BOT : ''),
    comments: [] as string[],
    repoLabels: new Set<string>(),
    calls: [] as string[],
    permissionChecks: 0,
    failOn: undefined as Fail | undefined,
    plain: plain.state,
    outputs: new Map<string, string>(),
  };
  const hit = (op: string, arg = '', effect: () => void = () => {}) =>
    Effect.suspend(() => {
      w.calls.push(arg ? `${op}:${arg}` : op);
      const error = w.failOn?.(op, arg);
      return error ? Effect.fail(error) : Effect.sync(effect);
    });
  const issue = (number: number): Issue => ({
    number,
    title: 'Synthetic title',
    body: 'Synthetic body',
    url: `https://example.invalid/issues/${number}`,
    state: w.state,
    labels: [...w.labels],
    author: init.author ?? { login: 'synthetic-reporter', id: 4242 },
    closedByWorkflow: w.closedBy === WORKFLOW_BOT,
    isPullRequest: init.pullRequest === true,
  });
  const issues = Layer.succeed(
    Issues,
    Issues.of({
      get: number => {
        const error = w.failOn?.('get', String(number));
        return error ? Effect.fail(error) : Effect.sync(() => issue(number));
      },
      listOpen: () => Effect.succeed(init.openFailed ?? []),
      canWrite: () =>
        Effect.suspend(() => {
          w.permissionChecks++;
          const permission = init.permission ?? false;
          return typeof permission === 'boolean' ? Effect.succeed(permission) : Effect.fail(permission);
        }),
      ensureLabel: ({ name }) => (w.repoLabels.has(name) ? Effect.void : hit('createLabel', name, () => w.repoLabels.add(name))),
      addLabels: (_, labels) => hit('addLabels', labels.join(','), () => labels.forEach(label => w.labels.add(label))),
      removeLabel: (_, label) => hit('removeLabel', label, () => w.labels.delete(label)),
      hasWorkflowComment: (_, marker) => Effect.sync(() => w.comments.some(body => body.includes(marker))),
      comment: (_, body) => hit('comment', '', () => w.comments.push(body)),
      setState: (_, state) =>
        hit(state === 'closed' ? 'close' : 'reopen', '', () => {
          w.state = state;
          w.closedBy = state === 'closed' ? WORKFLOW_BOT : '';
        }),
      assign: () => hit('assign'),
    })
  );

  const run = async <A, E>(
    effect: Effect.Effect<A, E, Issues | Jev | WorkflowRun | StepOutputs | import('../scripts/issue-triage/plain.ts').Plain>,
    options: { eventName?: string; payload?: EventPayload; actor?: string; attempt?: number; jev?: (title: string) => Effect.Effect<JevAnswers, JevError> } = {}
  ) => {
    w.outputs.clear();
    const layer = Layer.mergeAll(
      issues,
      plainLayer('mock-plain-key'),
      StepOutputs.memory(w.outputs),
      Layer.succeed(Jev, Jev.of({ classify: ({ title }) => options.jev?.(title) ?? Effect.succeed(answers({})) })),
      Layer.succeed(
        WorkflowRun,
        WorkflowRun.of({
          eventName: options.eventName ?? 'workflow_dispatch',
          payload: options.payload ?? {},
          actor: options.actor ?? 'maintainer',
          attempt: options.attempt ?? 1,
          repository: 'ComposioHQ/composio',
        })
      )
    );
    const exit = await runWith(effect.pipe(Effect.provide(layer)), plain.fetch);
    return Exit.isSuccess(exit) ? undefined : Option.getOrThrow(Cause.findErrorOption(exit.cause));
  };
  return { ...w, world: w, plainState: plain.state, run, sorted: () => [...w.labels].sort() };
}

const opened = { eventName: 'issues', payload: { action: 'opened' } } as const;
const triageLabeled = { eventName: 'issues', payload: { action: 'labeled', label: { name: 'triage' } } } as const;
const reply = { eventName: 'issue_comment', payload: { action: 'created' } } as const;
const fresh = (overrides: Partial<JevAnswers>): Classification => ({ kind: 'answers', answers: answers(overrides) });
const none: Classification = { kind: 'none' };
const sweep: Classification = { kind: 'sweep' };

describe('authorize', () => {
  const issuePayload = (login: string, labels: string[], extra: object = {}): EventPayload => ({
    action: 'created',
    issue: { number: 1, user: { login }, labels: labels.map(name => ({ name })), ...extra },
  });

  test('admits opened issues and reporter replies on redirected issues without a permission check', () => {
    expect(admission('issues', { action: 'opened' }, 'outsider')).toBe('allow');
    expect(admission('issue_comment', issuePayload('reporter', ['support: redirected']), 'reporter')).toBe('allow');
    for (const payload of [
      issuePayload('other', ['support: redirected']),
      issuePayload('reporter', ['support: forwarded']),
      issuePayload('reporter', ['support: redirected'], { pull_request: {} }),
    ]) {
      expect(admission('issue_comment', payload, 'reporter')).toBe('deny');
    }
  });

  test.each([
    ['triage', 'check-permission'],
    ['support', 'check-permission'],
    ['support: forwarded', 'check-permission'],
    ['bug', 'deny'],
  ])('a %p label event needs %p', (name, expected) => {
    expect(admission('issues', { action: 'labeled', label: { name } }, 'maintainer')).toBe(expected);
  });

  test('labels, edits, reopens, and dispatch need write access; lookup errors fail the job', async () => {
    for (const permission of [true, false]) {
      const w = createWorld({ permission });
      expect(await w.run(authorize, { eventName: 'workflow_dispatch' })).toBeUndefined();
      expect(w.outputs.get('allowed')).toBe(String(permission));
      expect(w.world.permissionChecks).toBe(1);
    }
    const errored = createWorld({ permission: boom(403) });
    expect(await errored.run(authorize, { eventName: 'issues', payload: { action: 'edited' } })).toMatchObject({ status: 403 });
    expect(errored.outputs.has('allowed')).toBe(false);
  });
});

describe('classify', () => {
  test('a blank dispatch sweeps open forward-failed issues, batched by issue group', async () => {
    const w = createWorld({ openFailed: [9, 3, 73] });
    expect(await w.run(classify, { payload: { inputs: { issue_number: ' ' } } })).toBeUndefined();
    expect(JSON.parse(w.outputs.get('classification') ?? '')).toEqual({ kind: 'sweep' });
    expect(JSON.parse(w.outputs.get('batches') ?? '')).toEqual([
      { group: 3, numbers: [3] },
      { group: 9, numbers: [9, 73] },
    ]);
    expect(w.calls).toEqual([]);

    const idle = createWorld();
    expect(await idle.run(classify, { payload: { inputs: null } })).toBeUndefined();
    expect(idle.outputs.size).toBe(0);

    const many = createWorld({ openFailed: Array.from({ length: 300 }, (_, i) => i + 1) });
    await many.run(classify);
    const groups = JSON.parse(many.outputs.get('batches') ?? '') as { group: number; numbers: number[] }[];
    expect(groups).toHaveLength(64);
    expect(groups.flatMap(group => group.numbers).sort((a, b) => a - b)).toEqual(Array.from({ length: 300 }, (_, i) => i + 1));
  });

  test('a numbered dispatch on forward failed skips Jev and keeps its issue group', async () => {
    const w = createWorld({ labels: ['support', 'support: forward failed'] });
    expect(await w.run(classify, { payload: { inputs: { issue_number: '42' } } })).toBeUndefined();
    expect(JSON.parse(w.outputs.get('classification') ?? '')).toEqual({ kind: 'none' });
    expect(JSON.parse(w.outputs.get('batches') ?? '')).toEqual([{ group: 42, numbers: [42] }]);
  });

  test('a Jev failure is handed to apply as failed', async () => {
    const w = createWorld();
    const jev = () => Effect.fail(new JevError({ reason: new Unreachable() }));
    expect(await w.run(classify, { ...opened, payload: { action: 'opened', issue: { number: 42, user: null, labels: [] } }, jev })).toBeUndefined();
    expect(JSON.parse(w.outputs.get('classification') ?? '')).toEqual({ kind: 'failed' });
  });

  test('closed issues produce nothing; bad numbers and pull requests fail with typed errors', async () => {
    const closed = createWorld({ state: 'closed' });
    expect(await closed.run(classify, { payload: { inputs: { issue_number: '42' } } })).toBeUndefined();
    expect(closed.outputs.size).toBe(0);
    for (const input of ['abc', '0', '-1', '1.5']) {
      expect(await createWorld().run(classify, { payload: { inputs: { issue_number: input } } })).toMatchObject({
        _tag: 'InvalidIssueNumber',
        input,
      });
    }
    expect(await createWorld({ pullRequest: true }).run(classify, { payload: { inputs: { issue_number: '42' } } })).toMatchObject({
      _tag: 'NotAnIssue',
      number: 42,
    });
  });
});

describe('apply', () => {
  const applyOne = (classification: Classification, numbers: number[] = [42]) => apply(classification, numbers);

  test('redirect persists its labels before commenting or closing, then clears the pending marker', async () => {
    const w = createWorld();
    expect(await w.run(applyOne(fresh({ account_specific: 0.95 })), opened)).toBeUndefined();
    const labelWrite = w.calls.findIndex(call => call.startsWith('addLabels:') && call.includes('support: redirected'));
    expect(labelWrite).toBeGreaterThanOrEqual(0);
    expect(labelWrite).toBeLessThan(w.calls.indexOf('comment'));
    expect(w.calls.indexOf('comment')).toBeLessThan(w.calls.indexOf('close'));
    expect(w.calls.at(-1)).toBe(`removeLabel:${REDIRECT_PENDING}`);
    expect(w.world.state).toBe('closed');
    expect(w.sorted()).toEqual(['support', 'support: redirected']);
    expect(w.comments).toHaveLength(1);
  });

  test('a failed redirect label write posts nothing and closes nothing', async () => {
    const w = createWorld();
    w.world.failOn = op => (op === 'addLabels' ? boom() : undefined);
    expect(await w.run(applyOne(fresh({ account_specific: 0.95 })), opened)).toMatchObject({ _tag: 'ApplyFailed' });
    expect(w.calls).not.toContain('comment');
    expect(w.calls).not.toContain('close');
    expect(w.world.state).toBe('open');
  });

  test.each(['comment', 'close'])('re-running after a failed %s finishes the redirect without a duplicate comment', async failing => {
    const w = createWorld();
    const classification = fresh({ account_specific: 0.95 });
    w.world.failOn = op => (op === failing ? boom() : undefined);
    expect(await w.run(applyOne(classification), opened)).toBeDefined();
    expect(w.world.state).toBe('open');
    expect(w.world.labels.has('support: redirected') && w.world.labels.has(REDIRECT_PENDING)).toBe(true);

    w.world.failOn = undefined;
    expect(await w.run(applyOne(classification), { ...opened, attempt: 2 })).toBeUndefined();
    expect(w.comments).toHaveLength(1);
    expect(w.world.state).toBe('closed');
    expect(w.sorted()).toEqual(['support', 'support: redirected']);
  });

  test('re-running apply finishes cleanup on an already closed redirect', async () => {
    const w = createWorld();
    const classification = fresh({ account_specific: 0.95 });
    w.world.failOn = (op, arg) => (op === 'removeLabel' && arg === REDIRECT_PENDING ? boom() : undefined);
    expect(await w.run(applyOne(classification), opened)).toBeDefined();
    expect(w.world.state).toBe('closed');
    expect(w.world.labels.has(REDIRECT_PENDING)).toBe(true);

    w.world.failOn = undefined;
    expect(await w.run(applyOne(classification), { ...opened, attempt: 2 })).toBeUndefined();
    expect(w.sorted()).toEqual(['support', 'support: redirected']);
    expect(w.comments).toHaveLength(1);
  });

  test('maintainer reopen or dispatch on a finished redirect never closes it again; edits never auto-close', async () => {
    const w = createWorld({ labels: ['support', 'support: redirected'] });
    await w.run(applyOne(none), { eventName: 'issues', payload: { action: 'reopened' } });
    await w.run(applyOne(none));
    w.world.labels.add('triage');
    await w.run(applyOne(none), triageLabeled);
    expect(w.calls).toEqual([]);
    expect(w.world.state).toBe('open');

    const edited = createWorld();
    await edited.run(applyOne(fresh({ account_specific: 0.95 })), { eventName: 'issues', payload: { action: 'edited' } });
    expect(edited.world.state).toBe('open');
    expect(edited.sorted()).toEqual(['support', 'support: needs human']);
    expect(edited.comments).toHaveLength(0);
  });

  test('triage on a needs human issue is a fresh classification', async () => {
    const w = createWorld({ labels: ['support', 'support: needs human', 'triage'] });
    expect(await w.run(applyOne(fresh({ hosted_problem: 0.9 })), triageLabeled)).toBeUndefined();
    expect(w.sorted()).toEqual(['support', 'support: forwarded']);
    expect(w.plainState.operations).toEqual(['supportThread', 'upsertCustomer', 'createThread']);
  });

  test('a classification failure records the triage label and fails the job', async () => {
    const w = createWorld();
    const error = await w.run(applyOne({ kind: 'failed' }), opened);
    expect(error).toMatchObject({ _tag: 'ApplyFailed', failures: [{ issue: 42 }] });
    expect(w.sorted()).toEqual(['triage']);
  });

  test('numbered retry of forward failed goes straight to Plain, keeps the failed state until success, and reuses the thread', async () => {
    const w = createWorld({ labels: ['support', 'support: forward failed'] });
    w.plainState.down = true;
    expect(await w.run(applyOne(none))).toMatchObject({ _tag: 'ApplyFailed' });
    expect(w.sorted()).toEqual(['support', 'support: forward failed']);
    expect(w.plainState.operations).toEqual(['supportThread']);

    // Plain recovers, but cleanup fails after the thread exists: the failed marker must survive.
    w.plainState.down = false;
    w.plainState.operations = [];
    w.world.failOn = (op, arg) => (op === 'removeLabel' && arg === 'support: forward failed' ? boom() : undefined);
    expect(await w.run(applyOne(none))).toBeDefined();
    expect(w.plainState.thread).toBe(true);
    expect(w.world.labels.has('support: forward failed')).toBe(true);

    w.world.failOn = undefined;
    w.plainState.operations = [];
    expect(await w.run(applyOne(none))).toBeUndefined();
    expect(w.plainState.operations).toEqual(['supportThread']);
    expect(w.sorted()).toEqual(['support', 'support: forwarded']);
  });

  test('re-running apply retries Plain forwarding with saved Jev answers', async () => {
    const w = createWorld();
    const classification = fresh({ hosted_problem: 0.9 });
    w.plainState.down = true;
    expect(await w.run(applyOne(classification), opened)).toBeDefined();
    expect(w.sorted()).toEqual(['support', 'support: forward failed']);

    w.plainState.down = false;
    w.plainState.operations = [];
    expect(await w.run(applyOne(classification), { ...opened, attempt: 2 })).toBeUndefined();
    expect(w.plainState.operations).toEqual(['supportThread', 'upsertCustomer', 'createThread']);
    expect(w.sorted()).toEqual(['support', 'support: forwarded']);
  });

  test('a Plain customer without a GitHub user ID fails visibly and keeps the failed state', async () => {
    const w = createWorld({ labels: ['support', 'support: forward failed'], author: { login: 'synthetic-reporter' } });
    const error = await w.run(applyOne(none));
    expect(error).toMatchObject({ _tag: 'ApplyFailed' });
    expect(error?.message).toContain('GitHub author ID is unavailable');
    expect(w.plainState.operations).toEqual(['supportThread']);
    expect(w.sorted()).toEqual(['support', 'support: forward failed']);
  });

  test('sweep re-checks each issue under its lock and only retries open forward-failed issues', async () => {
    for (const init of [
      { state: 'closed' as const, labels: ['support', 'support: forward failed'] },
      { labels: ['support', 'support: forwarded'] },
    ]) {
      const w = createWorld(init);
      expect(await w.run(applyOne(sweep))).toBeUndefined();
      expect(w.calls).toEqual([]);
      expect(w.plainState.operations).toEqual([]);
    }
    const ok = createWorld({ labels: ['support', 'support: forward failed', 'triage'] });
    expect(await ok.run(applyOne(sweep))).toBeUndefined();
    expect(ok.sorted()).toEqual(['support', 'support: forwarded']);
  });

  test('a batch keeps going after an issue fails to load', async () => {
    const w = createWorld({ labels: ['support', 'support: forward failed'] });
    w.world.failOn = (op, arg) => (op === 'get' && arg === '106' ? boom() : undefined);
    const error = await w.run(applyOne(sweep, [106, 42]));
    expect(error).toMatchObject({ _tag: 'ApplyFailed', failures: [{ issue: 106, message: 'mock write failure' }] });
    expect(w.sorted()).toEqual(['support', 'support: forwarded']);
  });

  test('reporter recovery is resumable after every failure point and never reopens human-closed issues', async () => {
    const redirected = { state: 'closed' as const, labels: ['support', 'support: redirected'] };

    // Plain failure after the reopen: open + forward failed, picked up by the normal sweep.
    const a = createWorld(redirected);
    a.plainState.down = true;
    expect(await a.run(applyOne(none), reply)).toBeDefined();
    expect(a.world.state).toBe('open');
    expect(a.sorted()).toEqual(['support', 'support: forward failed']);
    a.plainState.down = false;
    expect(await a.run(applyOne(sweep))).toBeUndefined();
    expect(a.sorted()).toEqual(['support', 'support: forwarded']);

    // Reopen failure: still closed and redirected, so the reporter's next reply resumes.
    const b = createWorld(redirected);
    b.world.failOn = op => (op === 'reopen' ? boom() : undefined);
    expect(await b.run(applyOne(none), reply)).toBeDefined();
    expect(b.world.state).toBe('closed');
    expect(b.plainState.operations).toEqual([]);
    b.world.failOn = undefined;
    expect(await b.run(applyOne(none), reply)).toBeUndefined();
    expect(b.world.state).toBe('open');
    expect(b.sorted()).toEqual(['support', 'support: forwarded']);

    // Failure after Plain returned: thread exists, issue open and still marked failed, so the sweep finishes it.
    const c = createWorld(redirected);
    c.world.failOn = (op, arg) => (op === 'addLabels' && arg === 'support: forwarded' ? boom() : undefined);
    expect(await c.run(applyOne(none), reply)).toBeDefined();
    expect(c.world.state === 'open' && c.plainState.thread && c.world.labels.has('support: forward failed')).toBe(true);
    c.world.failOn = undefined;
    c.plainState.operations = [];
    expect(await c.run(applyOne(sweep))).toBeUndefined();
    expect(c.plainState.operations).toEqual(['supportThread']);
    expect(c.sorted()).toEqual(['support', 'support: forwarded']);

    // Closed by a human: never reopened, nothing written, Plain untouched.
    const human = createWorld({ ...redirected, closedBy: 'synthetic-maintainer' });
    expect(await human.run(applyOne(none), reply)).toBeUndefined();
    expect(human.calls).toEqual([]);
    expect(human.plainState.operations).toEqual([]);
    expect(human.world.state).toBe('closed');
  });
});
