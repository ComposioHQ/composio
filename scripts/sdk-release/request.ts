import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { GitHubReleaseClient, SDK_RELEASE_REPOSITORY } from './github';
import { releaseChoiceSchema, type SdkReleasePlan } from './plan';
import { createPilotPlan } from './preview';

const runIdSchema = z.string().regex(/^[1-9][0-9]*$/);
export const releaseRequestSchema = z
  .object({
    action: z.enum(['preview', 'status', 'retry']).default('preview'),
    typescript: releaseChoiceSchema.default('auto'),
    python: releaseChoiceSchema.default('auto'),
    run_id: runIdSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.action === 'retry' && !value.run_id)
      context.addIssue({
        code: 'custom',
        path: ['run_id'],
        message: 'Retry requires the original run ID',
      });
  });
export type ReleaseRequest = z.infer<typeof releaseRequestSchema>;
const dispatchSchema = z.object({ inputs: z.record(z.string(), z.unknown()).default({}) });
const issueSchema = z.object({ issue: z.object({ body: z.string() }) });

export function parseReleaseRequest(eventName: string, payload: unknown): ReleaseRequest {
  if (eventName === 'workflow_dispatch') {
    const { inputs } = dispatchSchema.parse(payload);
    return releaseRequestSchema.parse({
      ...inputs,
      run_id: inputs.run_id === '' ? undefined : inputs.run_id,
    });
  }
  if (eventName !== 'issues') throw new Error('Unsupported SDK release request event');
  const body = issueSchema.parse(payload).issue.body;
  const fields = new Map<string, string>();
  for (const match of body.matchAll(
    /^### (Action|TypeScript|Python|Original run ID)\r?\n\r?\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm
  )) {
    if (fields.has(match[1])) throw new Error(`Duplicate release field: ${match[1]}`);
    fields.set(match[1], match[2].trim());
  }
  if (!fields.has('Action') || !fields.has('TypeScript') || !fields.has('Python'))
    throw new Error('Use the SDK release request issue form');
  const original = fields.get('Original run ID');
  return releaseRequestSchema.parse({
    action: fields.get('Action'),
    typescript: fields.get('TypeScript'),
    python: fields.get('Python'),
    run_id: !original || original === '_No response_' ? undefined : original,
  });
}

export interface PilotContext {
  actor: string;
  runId: string;
  sourceSha: string;
  issueNumber?: number;
}
export interface PilotResult {
  state: 'preview' | 'existing' | 'nothing-to-release' | 'idle' | 'retrying' | 'run-status';
  message: string;
  pullRequest?: string;
  runUrl?: string;
  plan?: SdkReleasePlan;
}

export async function executePilotRequest(
  github: GitHubReleaseClient,
  request: ReleaseRequest,
  context: PilotContext,
  plan: () => Promise<SdkReleasePlan>
): Promise<PilotResult> {
  const normalized = releaseRequestSchema.parse(request);
  await github.requireActiveMember(context.actor);
  let result: PilotResult;
  try {
    result = await executeAuthorizedPilotRequest(github, normalized, context, plan);
  } catch (error) {
    if (context.issueNumber)
      await github.commentIssue(
        context.issueNumber,
        `The preview could not complete. Inspect the original run: https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${context.runId}`
      );
    throw error;
  }
  if (context.issueNumber)
    await github.commentIssue(
      context.issueNumber,
      `${result.message}\n\n${result.pullRequest ?? result.runUrl ?? ''}`
    );
  return result;
}

async function executeAuthorizedPilotRequest(
  github: GitHubReleaseClient,
  normalized: ReleaseRequest,
  context: PilotContext,
  plan: () => Promise<SdkReleasePlan>
): Promise<PilotResult> {
  if (normalized.action === 'retry') {
    const original = await github.getRun(runIdSchema.parse(normalized.run_id));
    if (
      original.path !== '.github/workflows/sdk.release.yml' ||
      original.head_branch !== 'next' ||
      original.repository.full_name !== SDK_RELEASE_REPOSITORY
    )
      throw new Error('Run does not belong to the guarded SDK release pilot on next');
    if (original.status !== 'completed')
      return {
        state: 'run-status',
        message: `Original retry is ${original.status}. New language choices are ignored.`,
        runUrl: original.html_url,
      };
    if (
      !['failure', 'cancelled', 'timed_out'].includes(original.conclusion ?? '') ||
      original.run_attempt >= 50 ||
      Date.now() - Date.parse(original.created_at) >= 30 * 24 * 60 * 60 * 1000
    )
      throw new Error(
        'Retry requires a failed original SDK release pilot within 30 days and 50 attempts'
      );
    await github.rerunFailedJobs(String(original.id));
    return {
      state: 'retrying',
      message: 'Retrying the original run. New language choices are ignored.',
      runUrl: original.html_url,
    };
  }
  if (normalized.action === 'status' && normalized.run_id) {
    const original = await github.getRun(normalized.run_id);
    if (
      original.path !== '.github/workflows/sdk.release.yml' ||
      original.repository.full_name !== SDK_RELEASE_REPOSITORY
    )
      throw new Error('Run does not belong to the SDK release workflow');
    return {
      state: 'run-status',
      message: `Original run: ${original.status}${original.conclusion ? ` (${original.conclusion})` : ''}.`,
      runUrl: original.html_url,
    };
  }
  const current = await github.findPilotPullRequest();
  if (current)
    return {
      state: 'existing',
      message: 'A preview is already active; no new versions were allocated.',
      pullRequest: current.html_url,
    };
  if (normalized.action === 'status')
    return { state: 'idle', message: 'No active SDK release preview.' };
  const selected = await plan();
  if (!selected.releases.length)
    return {
      state: 'nothing-to-release',
      message: 'Nothing to release. Registry baselines were reconciled.',
      plan: selected,
    };
  const pullRequest = await github.createPilotPullRequest(
    context.runId,
    context.sourceSha,
    JSON.stringify(
      {
        mode: 'preview',
        inputBase: context.sourceSha,
        originalRunId: context.runId,
        plan: selected,
      },
      null,
      2
    ) + '\n'
  );
  return {
    state: 'preview',
    message: 'Plan-only draft prepared. Publication is unavailable in this pilot.',
    pullRequest,
    plan: selected,
  };
}

if (import.meta.main) {
  const env = z
    .object({
      GITHUB_EVENT_NAME: z.enum(['issues', 'workflow_dispatch']),
      GITHUB_EVENT_PATH: z.string(),
      GITHUB_REPOSITORY: z.literal(SDK_RELEASE_REPOSITORY),
      GITHUB_REF: z.literal('refs/heads/next'),
      GITHUB_SHA: z.string().regex(/^[a-f0-9]{40}$/),
      GITHUB_RUN_ID: runIdSchema,
      SDK_RELEASE_TOKEN: z.string().min(1),
      GITHUB_STEP_SUMMARY: z.string(),
    })
    .parse(process.env);
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
  const envelope = z
    .object({
      sender: z.object({ login: z.string() }),
      issue: z.object({ number: z.number().int().positive() }).optional(),
      repository: z.object({
        full_name: z.literal(SDK_RELEASE_REPOSITORY),
        default_branch: z.literal('next'),
      }),
    })
    .parse(event);
  const request = parseReleaseRequest(env.GITHUB_EVENT_NAME, event);
  const result = await executePilotRequest(
    new GitHubReleaseClient(env.SDK_RELEASE_TOKEN),
    request,
    {
      actor: envelope.sender.login,
      runId: env.GITHUB_RUN_ID,
      sourceSha: env.GITHUB_SHA,
      issueNumber: env.GITHUB_EVENT_NAME === 'issues' ? envelope.issue?.number : undefined,
    },
    () => createPilotPlan(process.cwd(), request)
  );
  await writeFile('sdk-release-preview.json', JSON.stringify(result, null, 2) + '\n');
  const rows = result.plan?.releases
    .map(
      release =>
        `| ${release.name} | ${result.plan?.recommended.find(recommended => recommended.name === release.name)?.newVersion ?? 'none'} | ${release.newVersion} |`
    )
    .join('\n');
  await writeFile(
    env.GITHUB_STEP_SUMMARY,
    `${result.message}\n\n${result.pullRequest ?? result.runUrl ?? ''}\n\n${rows ? `| Package | Recommended | Selected |\n| --- | --- | --- |\n${rows}\n` : ''}`
  );
}
