import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

type Step = { id?: string; uses: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Job = {
  environment?: string;
  concurrency?: { group: string; 'cancel-in-progress': boolean; queue?: string };
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
  expect(workflow.jobs.apply.concurrency?.group).toBe(
    "issue-triage-${{ needs.classify.outputs.mode == 'sweep' && 'sweep' || needs.classify.outputs.issue_number }}"
  );
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
  async function runClassify(opts: { issueNumber?: string; eventName?: string; pullRequest?: boolean; state?: string }) {
    const outputs: Record<string, string> = {};
    let issueReads = 0;
    await runInNewContext(`(async () => {\n${script}\n})()`, {
      __load: async (p: string) => (p.endsWith('route.ts') ? routeMod : jevMod),
      process: { env: { ISSUE_NUMBER: opts.issueNumber ?? '', TYPESAFE_API_KEY: 'key' } },
      context: { eventName: opts.eventName ?? 'workflow_dispatch', repo: { owner: 'ComposioHQ', repo: 'composio' }, payload: {} },
      github: {
        rest: {
          issues: {
            get: async () => {
              issueReads++;
              return { data: { title: 't', body: 'b', state: opts.state ?? 'open', labels: [], ...(opts.pullRequest ? { pull_request: {} } : {}) } };
            },
          },
        },
      },
      core: { setOutput: (k: string, v: string) => { outputs[k] = v; }, warning: () => {} },
    });
    return { outputs, issueReads };
  }

  expect(await runClassify({ issueNumber: '', eventName: 'workflow_dispatch' })).toEqual({
    outputs: { mode: 'sweep', issue_number: '' },
    issueReads: 0,
  });
  expect((await runClassify({ issueNumber: '42', state: 'closed' })).outputs).toEqual({});
  for (const bad of ['abc', '0', '-1', '1.5']) {
    await expect(runClassify({ issueNumber: bad })).rejects.toThrow('Invalid issue_number');
  }
  await expect(runClassify({ issueNumber: '42', pullRequest: true })).rejects.toThrow('Cannot triage a pull request');
});
