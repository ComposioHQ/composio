import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { REDIRECT_PENDING, type JevAnswers } from '../.github/scripts/issue-triage/route.ts';

type Step = { id?: string; uses: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Job = {
  environment?: string;
  concurrency?: { group: string; 'cancel-in-progress': boolean; queue?: string };
  strategy?: { 'fail-fast': boolean; matrix: { batch: string } };
  permissions: Record<string, string>;
  steps: Step[];
  needs?: string;
  if?: string;
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

const rawWorkflow = readFileSync(new URL('../.github/workflows/issue-triage.yml', import.meta.url), 'utf8');
const workflow = Bun.YAML.parse(rawWorkflow) as Workflow;
const authStep = workflow.jobs.authorize.steps[0];
const classifyStep = workflow.jobs.classify.steps.find(s => s.id === 'classify')!;
const applyStep = workflow.jobs.apply.steps.find(s => s.uses.startsWith('actions/github-script@'))!;

async function runAuthorize(opts: {
  eventName?: string;
  actor?: string;
  payload?: Record<string, unknown>;
  permission?: string;
  permissionError?: { status: number };
}) {
  const outputs: Record<string, string> = {};
  let permissionCalls = 0;
  await runInNewContext(`(async () => {\n${String(authStep.with?.script)}\n})()`, {
    context: {
      eventName: opts.eventName ?? 'issues',
      actor: opts.actor ?? 'user',
      repo: { owner: 'ComposioHQ', repo: 'composio' },
      payload: opts.payload ?? {},
    },
    github: {
      rest: {
        repos: {
          getCollaboratorPermissionLevel: async () => {
            permissionCalls++;
            if (opts.permissionError) throw opts.permissionError;
            return { data: { permission: opts.permission ?? 'none' } };
          },
        },
      },
    },
    core: { setOutput: (k: string, v: string) => { outputs[k] = v; }, info: () => {} },
  });
  return { outputs, permissionCalls };
}

test('permissions, environments, secrets, triggers, and checkout settings are strictly scoped', () => {
  expect(workflow.permissions).toEqual({});
  expect(workflow.jobs.authorize.permissions).toEqual({});
  expect(workflow.jobs.classify.permissions).toEqual({ issues: 'read', contents: 'read' });
  expect(workflow.jobs.classify.permissions['id-token']).toBeUndefined();
  expect(workflow.jobs.classify.environment).toBe('issue-triage');
  expect(workflow.jobs.apply.environment).toBeUndefined();
  expect(workflow.jobs.apply.permissions).toEqual({ issues: 'write', contents: 'read' });
  expect(Object.keys(classifyStep.env ?? {}).sort()).toEqual(['ISSUE_NUMBER', 'TYPESAFE_API_KEY']);
  expect(applyStep.env?.TYPESAFE_API_KEY).toBeUndefined();
  expect(applyStep.env?.PLAIN_API_KEY).toBe('${{ secrets.PLAIN_API_KEY }}');
  expect(rawWorkflow).not.toContain('ANTHROPIC_API_KEY');
  expect(rawWorkflow).not.toContain('api.anthropic.com');
  expect(rawWorkflow).not.toMatch(/import\(\s*["']\.\//);
  expect(workflow.on.issues.types).toEqual(['opened', 'reopened', 'edited', 'labeled']);
  expect(workflow.on.issue_comment.types).toEqual(['created']);
  expect(workflow.on.workflow_dispatch.inputs.issue_number.required).toBe(false);
  for (const job of [workflow.jobs.classify, workflow.jobs.apply]) {
    const checkout = job.steps.find(s => s.uses.startsWith('actions/checkout@'));
    expect(checkout?.with?.ref).toBe('next');
    expect(checkout?.with?.['persist-credentials']).toBe(false);
    expect(checkout?.with?.['sparse-checkout']).toBe('.github/scripts/issue-triage');
  }
  expect(workflow.jobs.apply.needs).toBe('classify');
  expect(workflow.jobs.apply.if).toBe("needs.classify.outputs.mode != ''");
  // Sweeps and individual runs map an issue to the same concurrency group.
  expect(workflow.jobs.apply.concurrency).toEqual({ group: 'issue-triage-apply-${{ matrix.batch.group }}', 'cancel-in-progress': false, queue: 'max' });
  expect(workflow.jobs.apply.strategy?.['fail-fast']).toBe(false);
  expect(workflow.jobs.apply.strategy?.matrix.batch).toContain('fromJSON(needs.classify.outputs.batches');
  expect(applyStep.env?.ISSUE_NUMBERS).toBe('${{ toJSON(matrix.batch.numbers) }}');
  expect(rawWorkflow).not.toContain('getByUsername');
});

test('authorize admits opened issues and author comments on redirected issues only', async () => {
  const opened = await runAuthorize({ eventName: 'issues', actor: 'outsider', payload: { action: 'opened' } });
  expect(opened.outputs.allowed).toBe('true');
  expect(opened.permissionCalls).toBe(0);

  const reply = await runAuthorize({
    eventName: 'issue_comment',
    actor: 'reporter',
    payload: { action: 'created', issue: { user: { login: 'reporter' }, labels: [{ name: 'support: redirected' }] } },
  });
  expect(reply.outputs.allowed).toBe('true');
  expect(reply.permissionCalls).toBe(0);

  for (const payload of [
    { action: 'created', issue: { user: { login: 'other' }, labels: [{ name: 'support: redirected' }] } },
    { action: 'created', issue: { user: { login: 'reporter' }, labels: [{ name: 'support: forwarded' }] } },
    { action: 'created', issue: { user: { login: 'reporter' }, pull_request: {}, labels: [{ name: 'support: redirected' }] } },
  ]) {
    const res = await runAuthorize({ eventName: 'issue_comment', actor: 'reporter', payload, permission: 'admin' });
    expect(res.outputs.allowed).toBe('false');
    expect(res.permissionCalls).toBe(0);
  }
});

test('authorize requires write access for labels, edits, reopens, and dispatch, and rejects errors', async () => {
  for (const [label, permission, expected] of [
    ['triage', 'write', 'true'],
    ['support', 'maintain', 'true'],
    ['support: forwarded', 'admin', 'true'],
    ['bug', 'admin', 'false'],
    ['support', 'read', 'false'],
  ] as const) {
    const res = await runAuthorize({ eventName: 'issues', payload: { action: 'labeled', label: { name: label } }, permission });
    expect(res.outputs.allowed).toBe(expected);
  }
  expect((await runAuthorize({ eventName: 'workflow_dispatch', permissionError: { status: 404 } })).outputs.allowed).toBe('false');
  for (const status of [403, 500]) {
    await expect(runAuthorize({ eventName: 'workflow_dispatch', permissionError: { status } })).rejects.toEqual({ status });
  }
});

test('classify rejects invalid issue numbers and pull requests, and emits sweep on blank dispatch', async () => {
  const routeMod = await import('../.github/scripts/issue-triage/route.ts');
  const jevMod = await import('../.github/scripts/issue-triage/jev.ts');
  const script = String(classifyStep.with?.script)
    .replace(/const \[\{ pathToFileURL \}, \{ resolve \}\] = .+;\n/, '')
    .replace(/const load = .+;/, 'const load = p => __load(p);');
  async function runClassify(opts: {
    issueNumber?: string;
    eventName?: string;
    pullRequest?: boolean;
    state?: string;
    labels?: string[];
    listed?: { number: number; pull_request?: object }[];
  }) {
    const outputs: Record<string, string> = {};
    let issueReads = 0;
    await runInNewContext(`(async () => {\n${script}\n})()`, {
      __load: async (p: string) => (p.endsWith('route.ts') ? routeMod : jevMod),
      process: { env: { ISSUE_NUMBER: opts.issueNumber ?? '', TYPESAFE_API_KEY: 'key' } },
      context: { eventName: opts.eventName ?? 'workflow_dispatch', repo: { owner: 'ComposioHQ', repo: 'composio' }, payload: {} },
      github: {
        paginate: async (fn: (p: unknown) => Promise<{ data: unknown }>, params: unknown) => (await fn(params)).data,
        rest: {
          issues: {
            listForRepo: async () => ({ data: opts.listed ?? [] }),
            get: async () => {
              issueReads++;
              return { data: { title: 't', body: 'b', state: opts.state ?? 'open', labels: (opts.labels ?? []).map(name => ({ name })), ...(opts.pullRequest ? { pull_request: {} } : {}) } };
            },
          },
        },
      },
      core: { setOutput: (k: string, v: string) => { outputs[k] = v; }, warning: () => {} },
    });
    return { outputs, issueReads };
  }

  // Blank dispatch lists every open forward-failed issue (read-only, no per-issue reads, PRs excluded).
  expect(
    await runClassify({ issueNumber: '', eventName: 'workflow_dispatch', listed: [{ number: 9 }, { number: 3 }, { number: 5, pull_request: {} }] })
  ).toEqual({ outputs: { mode: 'sweep', batches: JSON.stringify([{ group: 9, numbers: [9] }, { group: 3, numbers: [3] }]) }, issueReads: 0 });
  expect((await runClassify({ issueNumber: '', eventName: 'workflow_dispatch' })).outputs).toEqual({});
  const many = Array.from({ length: 300 }, (_, i) => ({ number: i + 1 }));
  const batches = JSON.parse((await runClassify({ issueNumber: '', listed: many })).outputs.batches) as { group: number; numbers: number[] }[];
  expect(batches).toHaveLength(64);
  expect(batches.flatMap(batch => batch.numbers).sort((a, b) => a - b)).toEqual(many.map(issue => issue.number));

  const retry = (await runClassify({ issueNumber: '42', labels: ['support', 'support: forward failed'] })).outputs;
  expect(retry.mode).toBe('none');
  const [single] = JSON.parse(retry.batches) as typeof batches;
  expect(single.numbers).toEqual([42]);
  expect(single.group).toBe(batches.find(batch => batch.numbers.includes(42))?.group);
  expect((await runClassify({ issueNumber: '42', state: 'closed' })).outputs).toEqual({});
  for (const bad of ['abc', '0', '-1', '1.5']) {
    await expect(runClassify({ issueNumber: bad })).rejects.toThrow('Invalid issue_number');
  }
  await expect(runClassify({ issueNumber: '42', pullRequest: true })).rejects.toThrow('Cannot triage a pull request');
});

// --- Apply step against a stateful mock GitHub and a mocked Plain HTTP layer (real route.ts and plain.ts) ---

const baseAnswers: JevAnswers = {
  account_specific: 0.05, hosted_problem: 0.05, sdk_code: 0.1, new_toolkit: 0.05, is_bug: 0.05, missing_details: 0.05,
  feature_request: 0.05, sdk_area: { ts: 0.05, py: 0.05, cli: 0.05, docs: 0.05, none: 0.8 },
};
const answers = (o: Partial<JevAnswers>): JevAnswers => ({ ...baseAnswers, ...o });
const boom = (status = 500) => Object.assign(new Error('mock write failure'), { status });
const opened = { eventName: 'issues', payload: { action: 'opened' } };
const triageLabeled = { eventName: 'issues', payload: { action: 'labeled', label: { name: 'triage' } } };
const reply = { eventName: 'issue_comment', payload: { action: 'created' } };

const applyScript = String(applyStep.with?.script)
  .replace(/const \[\{ pathToFileURL \}, \{ resolve \}\] = .+;\n/, '')
  .replace(/const load = .+;/, 'const load = p => __load(p);');

type World = ReturnType<typeof createWorld>;
function createWorld(init: { state?: 'open' | 'closed'; labels?: string[]; closedBy?: string; user?: { login: string; id?: number } | null } = {}) {
  const w = {
    state: init.state ?? 'open',
    labels: new Set(init.labels ?? []),
    closedBy: init.closedBy ?? (init.state === 'closed' ? 'github-actions[bot]' : ''),
    user: init.user === undefined ? { login: 'synthetic-reporter', id: 4242 } : init.user,
    comments: [] as { user: { login: string }; body: string }[],
    repoLabels: new Set<string>(),
    calls: [] as string[],
    plainOps: [] as string[],
    thread: false,
    plainDown: false,
    failures: [] as string[],
    failOn: undefined as ((op: string, arg: string) => Error | undefined) | undefined,
    /** Runs the real inline apply step once; resolves to the thrown error, if any. */
    async run(opts: { mode: string; eventName?: string; payload?: Record<string, unknown>; answers?: JevAnswers; issueNumbers?: number[] }) {
      w.failures = [];
      const hit = (op: string, arg = '') => {
        w.calls.push(arg ? `${op}:${arg}` : op);
        const error = w.failOn?.(op, arg);
        if (error) throw error;
      };
      const fetchFn = (async (_url: unknown, init: RequestInit = {}) => {
        const { query } = JSON.parse(String(init.body)) as { query: string };
        const op = String(query.match(/\b(?:query|mutation)\s+(\w+)/)?.[1]);
        w.plainOps.push(op);
        if (w.plainDown) return new Response(JSON.stringify({ errors: [{ extensions: { code: 'INTERNAL_SERVER_ERROR' } }] }), { status: 500 });
        if (op === 'supportThread') return new Response(JSON.stringify({ data: { threadsByExternalId: { edges: w.thread ? [{ node: { id: 't_1' } }] : [] } } }));
        if (op === 'upsertCustomer') return new Response(JSON.stringify({ data: { upsertCustomer: { customer: { id: 'c_1' } } } }));
        w.thread = true;
        return new Response(JSON.stringify({ data: { createThread: { thread: { id: 't_1' } } } }));
      }) as typeof fetch;
      const plainMod = await import('../.github/scripts/issue-triage/plain.ts');
      const routeMod = await import('../.github/scripts/issue-triage/route.ts');
      const github = {
        paginate: async (fn: (p: unknown) => Promise<{ data: unknown }>, params: unknown) => (await fn(params)).data,
        rest: {
          issues: {
            get: async ({ issue_number }: { issue_number: number }) => {
              const error = w.failOn?.('get', String(issue_number));
              if (error) throw error;
              return {
                data: {
                  number: issue_number, title: 'Synthetic title', body: 'Synthetic body', html_url: `https://example.invalid/issues/${issue_number}`, state: w.state,
                  labels: [...w.labels].map(name => ({ name })), user: w.user, closed_by: w.closedBy ? { login: w.closedBy } : null,
                },
              };
            },
            update: async (p: { state: 'open' | 'closed' }) => {
              hit(p.state === 'closed' ? 'close' : 'reopen');
              w.state = p.state;
              w.closedBy = p.state === 'closed' ? 'github-actions[bot]' : '';
            },
            addLabels: async (p: { labels: string[] }) => {
              hit('addLabels', p.labels.join(','));
              for (const l of p.labels) w.labels.add(l);
            },
            removeLabel: async (p: { name: string }) => {
              hit('removeLabel', p.name);
              if (!w.labels.delete(p.name)) throw Object.assign(new Error('Label does not exist'), { status: 404 });
            },
            createComment: async (p: { body: string }) => {
              hit('comment');
              w.comments.push({ user: { login: 'github-actions[bot]' }, body: p.body });
            },
            listComments: async () => ({ data: w.comments }),
            addAssignees: async () => hit('assign'),
            getLabel: async (p: { name: string }) => {
              if (!w.repoLabels.has(p.name)) throw Object.assign(new Error('Not Found'), { status: 404 });
            },
            createLabel: async (p: { name: string }) => {
              hit('createLabel', p.name);
              w.repoLabels.add(p.name);
            },
          },
        },
      };
      try {
        await runInNewContext(`(async () => {\n${applyScript}\n})()`, {
          __load: async (p: string) =>
            p.endsWith('route.ts') ? routeMod : { forwardIssueToPlain: (i: never, o: object) => plainMod.forwardIssueToPlain(i, { ...o, fetchFn } as never) },
          process: { env: { MODE: opts.mode, ANSWERS: JSON.stringify(opts.answers ?? {}), ISSUE_NUMBERS: JSON.stringify(opts.issueNumbers ?? [42]), PLAIN_API_KEY: 'mock-plain-key' } },
          context: { eventName: opts.eventName ?? 'workflow_dispatch', repo: { owner: 'ComposioHQ', repo: 'composio' }, payload: opts.payload ?? {} },
          github,
          core: { setFailed: (m: string) => { w.failures.push(m); }, info: () => {}, warning: () => {} },
        });
        return undefined;
      } catch (error) {
        return error as Error;
      }
    },
  };
  return w;
}
const sorted = (w: World) => [...w.labels].sort();

test('redirect persists its labels before commenting or closing, then clears the pending marker', async () => {
  const w = createWorld();
  expect(await w.run({ mode: 'answers', answers: answers({ account_specific: 0.95 }), ...opened })).toBeUndefined();
  const labelWrite = w.calls.findIndex(c => c.startsWith('addLabels:') && c.includes('support: redirected'));
  expect(labelWrite).toBeGreaterThanOrEqual(0);
  expect(labelWrite).toBeLessThan(w.calls.indexOf('comment'));
  expect(w.calls.indexOf('comment')).toBeLessThan(w.calls.indexOf('close'));
  expect(w.calls.at(-1)).toBe(`removeLabel:${REDIRECT_PENDING}`);
  expect(w.state).toBe('closed');
  expect(sorted(w)).toEqual(['support', 'support: redirected']);
  expect(w.comments).toHaveLength(1);
});

test('a failed redirect label write posts nothing and closes nothing', async () => {
  const w = createWorld();
  w.failOn = op => (op === 'addLabels' ? boom() : undefined);
  expect(await w.run({ mode: 'answers', answers: answers({ account_specific: 0.95 }), ...opened })).toMatchObject({ message: 'mock write failure' });
  expect(w.calls).not.toContain('comment');
  expect(w.calls).not.toContain('close');
  expect(w.state).toBe('open');
});

test('a partially applied redirect is retried by numbered dispatch without a duplicate comment', async () => {
  for (const failing of ['comment', 'close']) {
    const w = createWorld();
    w.failOn = op => (op === failing ? boom() : undefined);
    expect(await w.run({ mode: 'answers', answers: answers({ account_specific: 0.95 }), ...opened })).toBeDefined();
    expect(w.state).toBe('open');
    expect(w.labels.has('support: redirected') && w.labels.has(REDIRECT_PENDING)).toBe(true);

    w.failOn = undefined;
    expect(await w.run({ mode: 'none' })).toBeUndefined();
    expect(w.comments).toHaveLength(1);
    expect(w.state).toBe('closed');
    expect(sorted(w)).toEqual(['support', 'support: redirected']);
  }
});

test('maintainer reopen or dispatch on a finished redirect never closes it again; edits never auto-close', async () => {
  const w = createWorld({ labels: ['support', 'support: redirected'] });
  await w.run({ mode: 'none', eventName: 'issues', payload: { action: 'reopened' } });
  await w.run({ mode: 'none' });
  w.labels.add('triage');
  await w.run({ mode: 'none', ...triageLabeled });
  expect(w.calls).toEqual([]);
  expect(w.state).toBe('open');

  const edited = createWorld();
  await edited.run({ mode: 'answers', answers: answers({ account_specific: 0.95 }), eventName: 'issues', payload: { action: 'edited' } });
  expect(edited.state).toBe('open');
  expect(sorted(edited)).toEqual(['support', 'support: needs human']);
  expect(edited.comments).toHaveLength(0);
});

test('triage on a needs human issue is a fresh classification', async () => {
  const w = createWorld({ labels: ['support', 'support: needs human', 'triage'] });
  expect(await w.run({ mode: 'answers', answers: answers({ hosted_problem: 0.9 }), ...triageLabeled })).toBeUndefined();
  expect(sorted(w)).toEqual(['support', 'support: forwarded']);
  expect(w.plainOps).toEqual(['supportThread', 'upsertCustomer', 'createThread']);
});

test('concurrent label creation is idempotent; other creation errors still fail', async () => {
  const w = createWorld();
  w.failOn = op =>
    op === 'createLabel' ? Object.assign(new Error('exists'), { status: 422, response: { data: { errors: [{ code: 'already_exists' }] } } }) : undefined;
  expect(await w.run({ mode: 'answers', answers: answers({ hosted_problem: 0.9 }), ...opened })).toBeUndefined();
  expect(sorted(w)).toEqual(['support', 'support: forwarded']);

  const bad = createWorld();
  bad.failOn = op => (op === 'createLabel' ? Object.assign(new Error('invalid'), { status: 422, response: { data: { errors: [{ code: 'invalid' }] } } }) : undefined);
  expect(await bad.run({ mode: 'answers', answers: answers({ hosted_problem: 0.9 }), ...opened })).toMatchObject({ message: 'invalid' });
});

test('numbered retry of forward failed goes straight to Plain, keeps the failed state until success, and reuses the thread', async () => {
  const w = createWorld({ labels: ['support', 'support: forward failed'] });
  w.plainDown = true;
  expect(await w.run({ mode: 'none' })).toBeUndefined();
  expect(w.failures).toHaveLength(1);
  expect(sorted(w)).toEqual(['support', 'support: forward failed']);
  expect(w.plainOps).toEqual(['supportThread']);

  // Plain recovers, but cleanup fails after the thread exists: the failed marker must survive.
  w.plainDown = false;
  w.plainOps = [];
  w.failOn = (op, arg) => (op === 'removeLabel' && arg === 'support: forward failed' ? boom() : undefined);
  expect(await w.run({ mode: 'none' })).toBeDefined();
  expect(w.thread).toBe(true);
  expect(w.labels.has('support: forward failed')).toBe(true);

  w.failOn = undefined;
  w.plainOps = [];
  expect(await w.run({ mode: 'none' })).toBeUndefined();
  expect(w.plainOps).toEqual(['supportThread']);
  expect(sorted(w)).toEqual(['support', 'support: forwarded']);
  expect(w.failures).toHaveLength(0);
});

test('a Plain customer without a GitHub user ID fails visibly and keeps the failed state', async () => {
  const w = createWorld({ labels: ['support', 'support: forward failed'], user: { login: 'synthetic-reporter' } });
  expect(await w.run({ mode: 'none' })).toBeUndefined();
  expect(w.failures[0]).toContain('GitHub author ID is unavailable');
  expect(w.plainOps).toEqual(['supportThread']);
  expect(sorted(w)).toEqual(['support', 'support: forward failed']);
});

test('sweep re-checks each issue under its lock and only retries open forward-failed issues', async () => {
  for (const init of [
    { state: 'closed' as const, labels: ['support', 'support: forward failed'] },
    { labels: ['support', 'support: forwarded'] },
  ]) {
    const w = createWorld(init);
    expect(await w.run({ mode: 'sweep' })).toBeUndefined();
    expect(w.calls).toEqual([]);
    expect(w.plainOps).toEqual([]);
  }
  const ok = createWorld({ labels: ['support', 'support: forward failed', 'triage'] });
  expect(await ok.run({ mode: 'sweep' })).toBeUndefined();
  expect(sorted(ok)).toEqual(['support', 'support: forwarded']);
});

test('a sweep batch keeps going after an issue fails to load', async () => {
  const w = createWorld({ labels: ['support', 'support: forward failed'] });
  w.failOn = (op, arg) => (op === 'get' && arg === '106' ? boom() : undefined);

  expect(await w.run({ mode: 'sweep', issueNumbers: [106, 42] })).toBeUndefined();
  expect(w.failures).toHaveLength(1);
  expect(w.failures[0]).toMatch(/^Retry failed for #106: .*mock write failure$/);
  expect(sorted(w)).toEqual(['support', 'support: forwarded']);
});

test('reporter recovery is resumable after every failure point and never reopens human-closed issues', async () => {
  const redirected = { state: 'closed' as const, labels: ['support', 'support: redirected'] };

  // Plain failure after the reopen: open + forward failed, picked up by the normal sweep.
  const a = createWorld(redirected);
  a.plainDown = true;
  expect(await a.run({ mode: 'none', ...reply })).toBeUndefined();
  expect(a.state).toBe('open');
  expect(sorted(a)).toEqual(['support', 'support: forward failed']);
  a.plainDown = false;
  expect(await a.run({ mode: 'sweep' })).toBeUndefined();
  expect(sorted(a)).toEqual(['support', 'support: forwarded']);

  // Reopen failure: still closed and redirected, so the reporter's next reply resumes.
  const b = createWorld(redirected);
  b.failOn = op => (op === 'reopen' ? boom() : undefined);
  expect(await b.run({ mode: 'none', ...reply })).toBeDefined();
  expect(b.state).toBe('closed');
  expect(b.plainOps).toEqual([]);
  b.failOn = undefined;
  expect(await b.run({ mode: 'none', ...reply })).toBeUndefined();
  expect(b.state).toBe('open');
  expect(sorted(b)).toEqual(['support', 'support: forwarded']);

  // Exception after Plain returned: thread exists, issue open and still marked failed, so the sweep finishes it.
  const c = createWorld(redirected);
  c.failOn = (op, arg) => (op === 'addLabels' && arg === 'support: forwarded' ? boom() : undefined);
  expect(await c.run({ mode: 'none', ...reply })).toBeDefined();
  expect(c.state === 'open' && c.thread && c.labels.has('support: forward failed')).toBe(true);
  c.failOn = undefined;
  c.plainOps = [];
  expect(await c.run({ mode: 'sweep' })).toBeUndefined();
  expect(c.plainOps).toEqual(['supportThread']);
  expect(sorted(c)).toEqual(['support', 'support: forwarded']);

  // Closed by a human: never reopened, nothing written, Plain untouched.
  const human = createWorld({ ...redirected, closedBy: 'synthetic-maintainer' });
  expect(await human.run({ mode: 'none', ...reply })).toBeUndefined();
  expect(human.calls).toEqual([]);
  expect(human.plainOps).toEqual([]);
  expect(human.state).toBe('closed');
});
