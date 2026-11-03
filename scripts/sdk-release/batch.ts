import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { originalCandidates, reuseCandidate } from './artifacts';
import { z } from 'zod';
import { GitHubReleaseApiError, GitHubReleaseClient, SDK_RELEASE_REPOSITORY } from './github';
import { createSdkReleasePlan } from './plan';
import type { CorrectiveInput } from './plan';
import {
  activePreparation,
  batchForPreparation,
  committedBatch,
  currentPublication,
  publicationState,
  sourceTagRun,
} from './coordination';
import { fetchStableRegistryBaseline } from './registry-baseline';
import { parseReleaseRequest, releaseRequestSchema, type ReleaseRequest } from './request';
import {
  batchPath,
  eligibleApproval,
  releaseOutputs,
  releasePatchSchema,
  releaseBatchSchema,
  sourceShaSchema,
  validateReleaseDiff,
  type ReleaseBatch,
} from './source';

const repo = `/repos/${SDK_RELEASE_REPOSITORY}`;
const commitSchema = z.object({
  sha: sourceShaSchema,
  tree: z.object({ sha: sourceShaSchema }),
  parents: z.array(z.object({ sha: sourceShaSchema })),
});
const pullSchema = z.object({
  number: z.number().int().positive(),
  html_url: z.url(),
  body: z.string().nullable(),
  state: z.string(),
  merged: z.boolean().optional(),
  merged_at: z.string().nullable().optional(),
  merge_commit_sha: sourceShaSchema.nullable().optional(),
  user: z.object({ login: z.string() }),
  head: z.object({
    sha: sourceShaSchema,
    ref: z.string(),
    repo: z.object({ full_name: z.string() }).nullable(),
  }),
  base: z.object({ ref: z.string() }),
});
const fileSchema = z.object({ encoding: z.literal('base64'), content: z.string() });
const compareSchema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string(),
        status: z.string(),
        sha: sourceShaSchema,
      })
    )
    .max(299),
});
export async function activeRelease(github: GitHubReleaseClient, batchId?: string) {
  for (let page = 1; ; page++) {
    const pulls = await github.request(
      'GET',
      `${repo}/pulls?state=open&base=next&per_page=100&page=${page}`,
      z.array(pullSchema)
    );
    const pull = pulls.find(
      pull =>
        pull.head.repo?.full_name === SDK_RELEASE_REPOSITORY &&
        /^sdk-release\/batch-\d+$/.test(pull.head.ref) &&
        pull.body?.includes('<!-- sdk-release-batch -->') &&
        (!batchId || pull.head.ref === `sdk-release/batch-${batchId}`)
    );
    if (pull) return pull;
    if (pulls.length < 100) return undefined;
  }
}
async function content(
  github: GitHubReleaseClient,
  path: string,
  sha: string
): Promise<string | null> {
  try {
    const file = await github.request('GET', `${repo}/contents/${path}?ref=${sha}`, fileSchema);
    return Buffer.from(file.content, 'base64').toString('utf8');
  } catch (error) {
    if (error instanceof GitHubReleaseApiError && error.status === 404) return null;
    throw error;
  }
}

export async function commitPreparedRelease(
  github: GitHubReleaseClient,
  value: unknown,
  authorizedValue: ReleaseBatch
): Promise<string> {
  const authorized = releaseBatchSchema.parse(authorizedValue);
  const patch = releasePatchSchema.parse(value);
  if (JSON.stringify(patch.batch) !== JSON.stringify(authorized))
    throw new Error('Prepared batch differs from the authorized request');
  const alreadyCreated = await activeRelease(github, authorized.id);
  if (alreadyCreated) {
    await closeReplacedPull(github, authorized, alreadyCreated.html_url);
    return alreadyCreated.html_url;
  }
  const current = await activeRelease(github);
  if (current && (!authorized.replaces || current.number !== authorized.replaces.number))
    return current.html_url;
  if (authorized.replaces) {
    const previous = await github.request(
      'GET',
      `${repo}/pulls/${authorized.replaces.number}`,
      pullSchema
    );
    if (previous.merged || previous.head.sha !== authorized.replaces.headSha)
      throw new Error(
        'Original release changed during refresh; inspect both candidates before continuing'
      );
  }
  const source = await github.request(
    'GET',
    `${repo}/git/commits/${authorized.inputBase}`,
    commitSchema
  );
  for (const file of patch.files) {
    if ((await content(github, file.path, authorized.inputBase)) !== file.before)
      throw new Error(`Prepared input differs from frozen source: ${file.path}`);
  }
  const planFile = patch.files.find(file => file.path === batchPath);
  if (
    !planFile?.after ||
    JSON.stringify(releaseBatchSchema.parse(JSON.parse(planFile.after))) !==
      JSON.stringify(authorized)
  )
    throw new Error('Prepared source plan changed');
  validateReleaseDiff(patch.files, authorized.plan, authorized.outputs);
  const branch = `sdk-release/batch-${authorized.id}`;
  let originalHead: string | undefined;
  try {
    const existing = await github.request(
      'GET',
      `${repo}/git/ref/heads/${branch}`,
      z.object({ object: z.object({ sha: sourceShaSchema }) })
    );
    originalHead = existing.object.sha;
    const saved = await github.request('GET', `${repo}/git/commits/${originalHead}`, commitSchema);
    const savedDiff = await github.request(
      'GET',
      `${repo}/compare/${authorized.inputBase}...${originalHead}`,
      compareSchema
    );
    if (
      saved.parents.length !== 1 ||
      saved.parents[0].sha !== authorized.inputBase ||
      JSON.stringify(savedDiff.files.map(file => file.filename).sort()) !==
        JSON.stringify(patch.files.map(file => file.path).sort())
    )
      throw new Error('Existing preparation branch no longer matches the original source');
    for (const file of patch.files)
      if ((await content(github, file.path, originalHead)) !== file.after)
        throw new Error('Existing preparation branch differs from the original prepared files');
  } catch (error) {
    if (!(error instanceof GitHubReleaseApiError) || error.status !== 404) throw error;
  }
  if (!originalHead) {
    const blobs = await Promise.all(
      patch.files.map(async file => {
        if (file.after === null)
          return { path: file.path, mode: '100644', type: 'blob', sha: null };
        const blob = await github.request(
          'POST',
          `${repo}/git/blobs`,
          z.object({ sha: sourceShaSchema }),
          { content: Buffer.from(file.after).toString('base64'), encoding: 'base64' }
        );
        return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
      })
    );
    const tree = await github.request(
      'POST',
      `${repo}/git/trees`,
      z.object({ sha: sourceShaSchema }),
      { base_tree: source.tree.sha, tree: blobs }
    );
    const created = await github.request(
      'POST',
      `${repo}/git/commits`,
      z.object({ sha: sourceShaSchema }),
      {
        message: 'chore(release): prepare SDK versions and documentation',
        parents: [authorized.inputBase],
        tree: tree.sha,
      }
    );
    await github.request('POST', `${repo}/git/refs`, z.object({ ref: z.string() }), {
      ref: `refs/heads/${branch}`,
      sha: created.sha,
    });
  }
  const rows = authorized.plan.releases
    .map(
      release =>
        `| ${release.name} | ${authorized.plan.recommended.find(recommendation => recommendation.name === release.name)?.newVersion ?? 'none'} | ${release.newVersion} |`
    )
    .join('\n');
  const pull = await github.request('POST', `${repo}/pulls`, pullSchema, {
    title: 'chore(release): publish SDK packages',
    head: branch,
    base: 'next',
    body: `<!-- sdk-release-batch -->\n<!-- sdk-release-note-exempt: This release PR applies previously reviewed SDK changes and only updates release metadata and generated documentation. -->\nRelease source is frozen at input ${authorized.inputBase}. Later next commits remain pending. Review the full diff and approve the final head. The controller merges that exact head after required checks pass.\n\n${authorized.statusUrl}\n\n| Package | Recommended | Selected |\n| --- | --- | --- |\n${rows}\n\nOriginal preparation run: https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${authorized.originalRunId}`,
  });
  await closeReplacedPull(github, authorized, pull.html_url);
  return pull.html_url;
}

async function closeReplacedPull(
  github: GitHubReleaseClient,
  batch: ReleaseBatch,
  replacementUrl: string
): Promise<void> {
  if (!batch.replaces) return;
  const previous = await github.request(
    'GET',
    `${repo}/pulls/${batch.replaces.number}`,
    pullSchema
  );
  if (previous.state === 'closed' && !previous.merged) return;
  if (previous.merged || previous.head.sha !== batch.replaces.headSha)
    throw new Error(
      `Original release changed during refresh. Replacement is preserved at ${replacementUrl}`
    );
  await github.request('PATCH', `${repo}/pulls/${batch.replaces.number}`, pullSchema, {
    state: 'closed',
  });
  await github.commentIssue(
    batch.replaces.number,
    `Superseded by ${replacementUrl}. The original branch and release evidence are retained. The replacement requires a new approval.`
  );
}

export async function verifyOriginalBatch(
  github: GitHubReleaseClient,
  batch: ReleaseBatch
): Promise<void> {
  const original = await github.getRun(batch.originalRunId);
  if (
    original.path !== '.github/workflows/sdk.release.yml' ||
    original.repository.full_name !== SDK_RELEASE_REPOSITORY ||
    original.head_branch !== 'next'
  )
    throw new Error('Release preparation was not produced by the protected controller');
  const artifact = reuseCandidate(
    await originalCandidates(github, Number(batch.originalRunId)),
    'sdk-authorized-batch',
    Number(batch.originalRunId),
    batch.inputBase
  );
  if (!artifact)
    throw new Error('Original authorized release plan is unavailable; prepare a new release');
  const directory = await mkdtemp(join(tmpdir(), 'sdk-original-plan-'));
  try {
    await github.downloadArtifact(artifact, directory);
    const saved = releaseBatchSchema.parse(
      await Bun.file(join(directory, 'sdk-release-batch.json')).json()
    );
    if (JSON.stringify(saved) !== JSON.stringify(batch))
      throw new Error('Committed release plan differs from the original authorized plan');
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(`${directory}.zip`, { force: true });
  }
}

export async function verifyReleaseHead(github: GitHubReleaseClient, number: number) {
  const pull = await github.request('GET', `${repo}/pulls/${number}`, pullSchema);
  if (
    pull.base.ref !== 'next' ||
    pull.head.repo?.full_name !== SDK_RELEASE_REPOSITORY ||
    !/^sdk-release\/batch-\d+$/.test(pull.head.ref) ||
    !pull.body?.includes('<!-- sdk-release-batch -->')
  )
    throw new Error('Expected an SDK release PR into protected next');
  const raw = await content(github, batchPath, pull.head.sha);
  if (!raw) throw new Error('Missing committed release plan');
  const batch = releaseBatchSchema.parse(JSON.parse(raw));
  await verifyOriginalBatch(github, batch);
  if (pull.head.ref !== `sdk-release/batch-${batch.id}`)
    throw new Error('Release branch and batch do not agree');
  const reviews: { user: string; state: string; commitId: string; permission: string }[] = [];
  for (let page = 1; ; page++) {
    const pageReviews = await github.request(
      'GET',
      `${repo}/pulls/${number}/reviews?per_page=100&page=${page}`,
      z.array(
        z.object({
          user: z.object({ login: z.string() }),
          state: z.string(),
          commit_id: sourceShaSchema,
        })
      )
    );
    for (const review of pageReviews) {
      if (!['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) continue;
      const permission = await github.request(
        'GET',
        `${repo}/collaborators/${encodeURIComponent(review.user.login)}/permission`,
        z.object({ permission: z.string() })
      );
      reviews.push({
        user: review.user.login,
        state: review.state,
        commitId: review.commit_id,
        permission: permission.permission,
      });
    }
    if (pageReviews.length < 100) break;
  }
  if (!eligibleApproval(reviews, pull.user.login, pull.head.sha))
    throw new Error('Final release head lacks an eligible non-author approval');
  const checks = await github.request(
    'GET',
    `${repo}/commits/${pull.head.sha}/check-runs?per_page=100`,
    z.object({
      total_count: z.number().max(100),
      check_runs: z.array(
        z.object({
          name: z.string(),
          head_sha: sourceShaSchema,
          app: z.object({ slug: z.string() }).nullable(),
          conclusion: z.string().nullable(),
        })
      ),
    })
  );
  for (const language of new Set(batch.plan.releases.map(release => release.language))) {
    if (
      !checks.check_runs.some(
        check =>
          check.name === `SDK candidate (${language})` &&
          check.head_sha === pull.head.sha &&
          check.app?.slug === 'github-actions' &&
          check.conclusion === 'success'
      )
    )
      throw new Error(`Missing green final-head ${language} candidate check`);
  }
  const diff = await github.request(
    'GET',
    `${repo}/compare/${batch.inputBase}...${pull.head.sha}`,
    compareSchema
  );
  const files = await Promise.all(
    diff.files.map(async file => ({
      path: file.filename,
      before: await content(github, file.filename, batch.inputBase),
      after: await content(github, file.filename, pull.head.sha),
    }))
  );
  validateReleaseDiff(files, batch.plan, batch.outputs);
  return { pull, batch, diff };
}

export async function mergeApprovedRelease(
  github: GitHubReleaseClient,
  number: number,
  appId: number
): Promise<string> {
  if (await activePreparation(github, process.env.GITHUB_RUN_ID ?? '0'))
    throw new Error('A release refresh is preparing; the previous PR must not merge');
  const { pull } = await verifyReleaseHead(github, number);
  if (!pull.merged) {
    const result = await github.request(
      'PUT',
      `${repo}/pulls/${number}/merge`,
      z.object({ merged: z.boolean(), sha: sourceShaSchema }),
      { sha: pull.head.sha, merge_method: 'squash' }
    );
    if (!result.merged) throw new Error('Protected expected-head merge was not accepted');
  }
  return authorizeSourceTag(github, number, appId);
}

export async function authorizeSourceTag(
  github: GitHubReleaseClient,
  number: number,
  appId: number
): Promise<string> {
  const { pull, batch } = await verifyReleaseHead(github, number);
  if (!pull.merged || !pull.merge_commit_sha) throw new Error('Release PR has not merged');
  await (
    await import('./registry')
  ).verifyPublicationPolicy(
    github,
    new Set(batch.plan.releases.map(release => release.language)),
    appId
  );
  const merged = await github.request(
    'GET',
    `${repo}/git/commits/${pull.merge_commit_sha}`,
    commitSchema
  );
  if (!merged.parents.some(parent => parent.sha === pull.head.sha)) {
    if (merged.parents.length !== 1) throw new Error('Unrecognized release merge topology');
    // GitHub's merged PR records the reviewed head and the resulting squash
    // commit separately. The publication tag retains the reviewed head.
  }

  const tag = `sdk-release/${batch.id}`;
  try {
    const existing = await github.request(
      'GET',
      `${repo}/git/ref/tags/${tag}`,
      z.object({ object: z.object({ type: z.string(), sha: sourceShaSchema }) })
    );
    if (existing.object.type !== 'commit' || existing.object.sha !== pull.head.sha)
      throw new Error('Publication source tag already points to another source');
  } catch (error) {
    if (!(error instanceof GitHubReleaseApiError) || error.status !== 404) throw error;
    await github.request('POST', `${repo}/git/refs`, z.object({ ref: z.string() }), {
      ref: `refs/tags/${tag}`,
      sha: pull.head.sha,
    });
  }
  return tag;
}

export async function executeReleaseRequest(
  github: GitHubReleaseClient,
  value: ReleaseRequest,
  context: {
    actor: string;
    runId: string;
    sourceSha: string;
    issueNumber?: number;
    runAttempt?: number;
  },
  plan: (
    choices?: ReleaseBatch['plan']['choices'],
    corrective?: CorrectiveInput
  ) => Promise<ReleaseBatch['plan']>,
  outputs: typeof releaseOutputs = releaseOutputs
): Promise<{
  message: string;
  batch?: ReleaseBatch;
  reusedBatch?: boolean;
  pullRequest?: string;
  runUrl?: string;
}> {
  const request = releaseRequestSchema.parse(value);
  await github.requireActiveMember(context.actor);
  let result: {
    message: string;
    batch?: ReleaseBatch;
    reusedBatch?: boolean;
    pullRequest?: string;
    runUrl?: string;
  };
  if (request.action === 'retry' || (request.action === 'status' && request.run_id)) {
    let original = await github.getRun(request.run_id!);
    if (
      original.path !== '.github/workflows/sdk.release.yml' ||
      original.repository.full_name !== SDK_RELEASE_REPOSITORY ||
      !(original.head_branch === 'next' || /^sdk-release\/\d+$/.test(original.head_branch ?? ''))
    )
      throw new Error('Run does not belong to a guarded SDK release');
    const latest = await committedBatch(github, 'next');
    const frozen = /^sdk-release\/\d+$/.test(original.head_branch ?? '')
      ? original.head_sha
        ? await committedBatch(github, original.head_sha)
        : undefined
      : latest?.originalRunId === String(original.id)
        ? latest
        : await batchForPreparation(github, String(original.id));
    if (frozen) {
      const publication = await sourceTagRun(github, frozen);
      if (publication) {
        if (
          !publication.head_sha ||
          JSON.stringify(await committedBatch(github, publication.head_sha)) !==
            JSON.stringify(frozen)
        )
          throw new Error('Original publication source differs from its frozen batch');
        const state = await publicationState(github, publication);
        if (state.verified) {
          if (request.action === 'retry')
            await github.request(
              'POST',
              `${repo}/actions/workflows/docs.sdk-change-sync.yml/dispatches`,
              z.unknown(),
              { ref: 'next', inputs: { run_id: String(publication.id) } }
            );
          result = {
            message:
              request.action === 'retry'
                ? 'Packages are verified; retrying documentation on protected next without registry identity or candidate artifacts.'
                : 'Packages published; documentation status is tracked separately.',
            runUrl: publication.html_url,
          };
          if (context.issueNumber)
            await github.commentIssue(context.issueNumber, `${result.message}\n\n${result.runUrl}`);
          return result;
        }
        if (state.terminal)
          throw new Error(
            'Original publication recovery ended; a newly approved higher-version corrective release is required'
          );
        original = publication;
      } else if (original.conclusion === 'success') {
        // Tag authorization is a separate protected-next run after the approved PR merges.
        const pulls = await github.request(
          'GET',
          `${repo}/pulls?state=closed&head=ComposioHQ:sdk-release/batch-${frozen.id}&per_page=100`,
          z.array(pullSchema)
        );
        const merged = pulls.find(pull => pull.merged_at || pull.merged || pull.merge_commit_sha);
        if (merged?.merge_commit_sha) {
          const runs = await github.request(
            'GET',
            `${repo}/actions/workflows/sdk.release.yml/runs?event=pull_request_target&head_sha=${merged.merge_commit_sha}&per_page=100`,
            z.object({ workflow_runs: z.array((await import('./github')).releaseRunSchema) })
          );
          const failed = [];
          for (const run of runs.workflow_runs)
            if (
              (await github.jobs(String(run.id))).some(
                job => job.name === 'source-tag' && job.conclusion === 'failure'
              )
            )
              failed.push(run);
          if (failed.length !== 1)
            throw new Error(
              'Cannot uniquely identify the original failed source-tag authorization run'
            );
          original = failed[0];
        }
      }
    }
    if (request.action === 'status' || original.status !== 'completed')
      result = {
        message: `Original run is ${original.status}${original.conclusion ? ` (${original.conclusion})` : ''}. Retry ignores new bump choices.`,
        runUrl: original.html_url,
      };
    else {
      if (
        !['failure', 'cancelled', 'timed_out'].includes(original.conclusion ?? '') ||
        original.run_attempt >= 50 ||
        Date.now() - Date.parse(original.created_at) >= 30 * 86400000
      )
        throw new Error('Original release cannot be retried');
      await github.rerunFailedJobs(String(original.id));
      result = {
        message: 'Retrying the original run. New bump choices are ignored.',
        runUrl: original.html_url,
      };
    }
  } else {
    const current = await activeRelease(github);
    const preparation = await activePreparation(github, context.runId);
    const publication = await currentPublication(github);
    if (preparation || publication?.active) {
      result = {
        message: 'A release is already active; no competing versions were allocated.',
        runUrl: preparation?.html_url ?? publication?.run?.html_url ?? publication?.batch.statusUrl,
        ...(current ? { pullRequest: current.html_url } : {}),
      };
      if (context.issueNumber)
        await github.commentIssue(context.issueNumber, `${result.message}\n\n${result.runUrl}`);
      return result;
    }
    if ((current && request.action !== 'refresh') || request.action === 'status')
      result = current
        ? {
            message: 'A release is already active; no competing versions were allocated.',
            pullRequest: current.html_url,
          }
        : { message: 'No active SDK release.' };
    else {
      if ((context.runAttempt ?? 1) > 1) {
        const artifact = reuseCandidate(
          await originalCandidates(github, Number(context.runId)),
          'sdk-authorized-batch',
          Number(context.runId),
          context.sourceSha
        );
        if (artifact) {
          const directory = await mkdtemp(join(tmpdir(), 'sdk-retry-plan-'));
          try {
            await github.downloadArtifact(artifact, directory);
            const saved = releaseBatchSchema.parse(
              await Bun.file(join(directory, 'sdk-release-batch.json')).json()
            );
            if (saved.id !== context.runId || saved.inputBase !== context.sourceSha)
              throw new Error('Original preparation plan identity differs');
            return {
              message: 'Reusing the original authorized release plan. New choices are ignored.',
              batch: saved,
              reusedBatch: true,
            };
          } finally {
            await rm(directory, { recursive: true, force: true });
            await rm(`${directory}.zip`, { force: true });
          }
        }
        if (
          (await github.jobs(context.runId)).some(
            job =>
              job.name === 'authorize' &&
              job.steps.some(
                step =>
                  step.name === 'Retain authorized release input' && step.conclusion === 'success'
              )
          )
        )
          throw new Error(
            'Original authorized release input was deleted; submit a new request instead of reallocating versions in an old run'
          );
      }
      let previous: ReleaseBatch | undefined;
      if (request.action === 'refresh') {
        if (!current) throw new Error('No active release candidate to refresh');
        const saved = await content(github, batchPath, current.head.sha);
        if (!saved) throw new Error('Active release has no frozen plan');
        previous = releaseBatchSchema.parse(JSON.parse(saved));
        await verifyOriginalBatch(github, previous);
      }
      let corrective: CorrectiveInput | undefined;
      if (publication?.run?.head_sha) {
        const outstanding = publication.terminal
          ? [
              ...publication.batch.plan.releases,
              ...(publication.batch.plan.corrective?.releases.filter(
                release =>
                  !publication.batch.plan.releases.some(selected => selected.name === release.name)
              ) ?? []),
            ]
          : (publication.batch.plan.corrective?.releases.filter(
              release =>
                !publication.batch.plan.releases.some(selected => selected.name === release.name)
            ) ?? []);
        if (outstanding.length)
          corrective = await (
            await import('./registry')
          ).correctiveInventory(
            process.cwd(),
            publication.batch,
            publication.run.head_sha,
            outstanding
          );
      }
      const selected = await plan(previous?.plan.choices, corrective);
      if (
        previous &&
        selected.releases.some(release => {
          const original = previous.plan.releases.find(entry => entry.name === release.name);
          return original && original.oldVersion !== release.oldVersion;
        })
      )
        throw new Error(
          'Refresh changed the original version baseline; reconcile the active release first'
        );
      if (!selected.releases.length)
        result = { message: 'Nothing to release. Stable registry baselines were reconciled.' };
      else {
        const date = new Date().toISOString().slice(0, 10);
        const statusUrl = `https://github.com/${SDK_RELEASE_REPOSITORY}/issues/${context.issueNumber ?? (await createStatusIssue(github, context.runId))}`;
        const batch = releaseBatchSchema.parse({
          schemaVersion: 1,
          id: context.runId,
          originalRunId: context.runId,
          inputBase: context.sourceSha,
          date,
          statusUrl,
          plan: selected,
          ...(previous && current
            ? { replaces: { number: current.number, headSha: current.head.sha } }
            : {}),
          outputs: await outputs(
            process.cwd(),
            date,
            context.runId,
            new Set(selected.releases.map(release => release.language)),
            new Set(selected.releases.map(release => release.name))
          ),
        });
        result = {
          message:
            'Release preparation authorized. The concrete release PR requires final-head approval and green checks.',
          batch,
        };
      }
    }
  }
  if (context.issueNumber)
    await github.commentIssue(
      context.issueNumber,
      `${result.message}\n\n${result.pullRequest ?? result.runUrl ?? `https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${context.runId}`}`
    );
  return result;
}

if (import.meta.main) {
  const mode = z.enum(['authorize', 'commit', 'tag', 'merge', 'report']).parse(Bun.argv[2]);
  const env = z
    .object({
      SDK_RELEASE_TOKEN: z.string().min(1),
      GITHUB_RUN_ID: z.string().regex(/^[1-9][0-9]*$/),
      GITHUB_SHA: sourceShaSchema,
      GITHUB_EVENT_PATH: z.string(),
      GITHUB_EVENT_NAME: z.string(),
      GITHUB_OUTPUT: z.string(),
      GITHUB_STEP_SUMMARY: z.string(),
      SDK_RELEASE_APP_ID: z.coerce.number().int().positive(),
    })
    .parse(process.env);
  const github = new GitHubReleaseClient(env.SDK_RELEASE_TOKEN);
  const event: unknown = await Bun.file(env.GITHUB_EVENT_PATH).json();
  const envelope = z
    .object({
      sender: z.object({ login: z.string() }),
      issue: z.object({ number: z.number().int().positive() }).optional(),
      pull_request: z.object({ number: z.number().int().positive() }).optional(),
    })
    .parse(event);
  if (mode === 'report') {
    const runId = z
      .object({ workflow_run: z.object({ id: z.number().int().positive() }) })
      .parse(event).workflow_run.id;
    const { report } = await (
      await import('./publication')
    ).reportPublication(github, String(runId), env.SDK_RELEASE_APP_ID);
    if (report.registryVerified)
      await github.request(
        'POST',
        `${repo}/actions/workflows/docs.sdk-change-sync.yml/dispatches`,
        z.unknown(),
        { ref: 'next', inputs: { run_id: String(runId) } }
      );
    await writeFile(
      env.GITHUB_OUTPUT,
      `registry-verified=${report.registryVerified}\noriginal-run-id=${report.runId}\n`,
      { flag: 'a' }
    );
    await writeFile(
      env.GITHUB_STEP_SUMMARY,
      `Publication status updated for original run ${runId}. Registry verified: ${report.registryVerified}; docs: ${report.docs}.\n`
    );
  } else if (mode === 'merge') {
    const current = await activeRelease(github);
    if (current) {
      try {
        await writeFile(
          env.GITHUB_STEP_SUMMARY,
          `Approved publication source: ${await mergeApprovedRelease(github, current.number, env.SDK_RELEASE_APP_ID)}\n`
        );
      } catch (error) {
        if (error instanceof GitHubReleaseApiError) throw error;
        await writeFile(
          env.GITHUB_STEP_SUMMARY,
          `Release awaits current-head approval or successful candidate checks: ${current.html_url}\n${error instanceof Error ? error.message : 'not eligible'}\n`
        );
      }
    }
  } else if (mode === 'tag') {
    if (!envelope.pull_request) throw new Error('Expected merged release PR event');
    await writeFile(
      env.GITHUB_STEP_SUMMARY,
      `Approved publication source: ${await authorizeSourceTag(github, envelope.pull_request.number, env.SDK_RELEASE_APP_ID)}\n`
    );
  } else if (mode === 'commit') {
    const batch = releaseBatchSchema.parse(await Bun.file('/tmp/sdk-authorized/batch.json').json());
    const url = await commitPreparedRelease(
      github,
      await Bun.file('/tmp/sdk-prepared/patch.json').json(),
      batch
    );
    await writeFile(env.GITHUB_STEP_SUMMARY, `Release PR: ${url}\n`);
  } else {
    const result = await executeReleaseRequest(
      github,
      parseReleaseRequest(env.GITHUB_EVENT_NAME, event),
      {
        actor: envelope.sender.login,
        runId: env.GITHUB_RUN_ID,
        sourceSha: env.GITHUB_SHA,
        runAttempt: z.coerce.number().int().positive().parse(process.env.GITHUB_RUN_ATTEMPT),
        ...(envelope.issue ? { issueNumber: envelope.issue.number } : {}),
      },
      async (choices, corrective) =>
        createSdkReleasePlan(process.cwd(), {
          ...parseReleaseRequest(env.GITHUB_EVENT_NAME, event),
          ...choices,
          corrective,
          baseline: await fetchStableRegistryBaseline(process.cwd()),
        })
    );
    if (result.batch) {
      await writeFile('sdk-release-batch.json', `${JSON.stringify(result.batch, null, 2)}\n`);
      const prepared = result.reusedBatch
        ? reuseCandidate(
            await originalCandidates(github, Number(env.GITHUB_RUN_ID)),
            'sdk-prepared-patch',
            Number(env.GITHUB_RUN_ID),
            env.GITHUB_SHA
          )
        : undefined;
      await writeFile(
        env.GITHUB_OUTPUT,
        `prepare=true\nnew-batch=${!result.reusedBatch}\nreuse-patch=${Boolean(prepared)}\n`,
        { flag: 'a' }
      );
    }
    await writeFile(
      env.GITHUB_STEP_SUMMARY,
      `${result.message}\n${result.pullRequest ?? result.runUrl ?? ''}\n`
    );
  }
}

async function createStatusIssue(github: GitHubReleaseClient, run: string): Promise<number> {
  const issue = await github.request(
    'POST',
    `${repo}/issues`,
    z.object({ number: z.number().int().positive() }),
    {
      title: `[SDK publication] Batch ${run}`,
      body: `Publication status for https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${run}. Packages are not yet verified.`,
    }
  );
  return issue.number;
}
