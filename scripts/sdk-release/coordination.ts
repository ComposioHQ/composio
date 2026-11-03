import { z } from 'zod';
import { originalCandidates } from './artifacts';
import {
  GitHubReleaseApiError,
  GitHubReleaseClient,
  SDK_RELEASE_REPOSITORY,
  releaseRunSchema,
  type ReleaseRun,
} from './github';
import { batchPath, releaseBatchSchema, type ReleaseBatch } from './source';

const repo = `/repos/${SDK_RELEASE_REPOSITORY}`;
export async function committedBatch(
  github: GitHubReleaseClient,
  ref: string
): Promise<ReleaseBatch | undefined> {
  try {
    const file = await github.request(
      'GET',
      `${repo}/contents/${batchPath}?ref=${ref}`,
      z.object({ encoding: z.literal('base64'), content: z.string() })
    );
    return releaseBatchSchema.parse(
      JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))
    );
  } catch (error) {
    if (error instanceof GitHubReleaseApiError && error.status === 404) return undefined;
    throw error;
  }
}
export async function sourceTagRun(
  github: GitHubReleaseClient,
  batch: ReleaseBatch
): Promise<ReleaseRun | undefined> {
  const runs = await github.request(
    'GET',
    `${repo}/actions/workflows/sdk.release.yml/runs?event=push&branch=${encodeURIComponent(`sdk-release/${batch.id}`)}&per_page=100`,
    z.object({ total_count: z.number().max(100), workflow_runs: z.array(releaseRunSchema) })
  );
  const original = runs.workflow_runs.filter(
    run =>
      run.head_branch === `sdk-release/${batch.id}` &&
      run.path === '.github/workflows/sdk.release.yml' &&
      run.repository.full_name === SDK_RELEASE_REPOSITORY
  );
  if (original.length > 1)
    throw new Error('Multiple source-tag runs identify the same immutable release');
  return original[0];
}
export async function batchForPreparation(github: GitHubReleaseClient, runId: string) {
  const pulls = await github.request(
    'GET',
    `${repo}/pulls?state=all&base=next&head=ComposioHQ:sdk-release/batch-${runId}&per_page=100`,
    z.array(
      z.object({
        body: z.string().nullable(),
        head: z.object({
          sha: z.string(),
          ref: z.string(),
          repo: z.object({ full_name: z.string() }).nullable(),
        }),
      })
    )
  );
  const release = pulls.filter(
    pull =>
      pull.head.ref === `sdk-release/batch-${runId}` &&
      pull.head.repo?.full_name === SDK_RELEASE_REPOSITORY &&
      pull.body?.includes('<!-- sdk-release-batch -->')
  );
  if (release.length > 1) throw new Error('Multiple PRs identify the original preparation');
  const batch = release[0] ? await committedBatch(github, release[0].head.sha) : undefined;
  if (batch && (batch.id !== runId || batch.originalRunId !== runId))
    throw new Error('Original preparation and release PR identity differ');
  return batch;
}
export async function publicationState(github: GitHubReleaseClient, run: ReleaseRun) {
  if (
    run.path !== '.github/workflows/sdk.release.yml' ||
    run.repository.full_name !== SDK_RELEASE_REPOSITORY ||
    run.event !== 'push' ||
    !/^sdk-release\/\d+$/.test(run.head_branch ?? '') ||
    !run.head_sha
  )
    throw new Error('Expected the original protected publication tag run');
  const batch = await committedBatch(github, run.head_sha);
  if (!batch || run.head_branch !== `sdk-release/${batch.id}`)
    throw new Error('Publication run and frozen batch differ');
  const tag = await github.request(
    'GET',
    `${repo}/git/ref/tags/${run.head_branch}`,
    z.object({ object: z.object({ type: z.string(), sha: z.string() }) })
  );
  if (tag.object.type !== 'commit' || tag.object.sha !== run.head_sha)
    throw new Error('Original immutable publication tag moved');
  const jobs = await github.jobs(String(run.id));
  // Success remains authoritative if a later docs-only attempt fails or candidates expire.
  const verified = jobs.some(
    job => job.name === 'Verify public SDK packages' && job.conclusion === 'success'
  );
  const possibleUpload = jobs.some(job =>
    job.steps.some(
      step =>
        /upload.*(?:npm|pypi)|publish.*(?:npm|pypi)/i.test(step.name) &&
        step.status !== 'queued' &&
        step.conclusion !== 'skipped'
    )
  );
  const artifacts =
    !verified && run.status === 'completed' && possibleUpload
      ? await originalCandidates(github, run.id)
      : undefined;
  const lostCandidate =
    artifacts &&
    batch.plan.releases.some(
      release =>
        !artifacts.some(
          artifact =>
            artifact.name === `sdk-candidate-${release.language}` &&
            !artifact.expired &&
            Date.parse(artifact.expires_at) > Date.now()
        )
    );
  let lostAuthorization = false;
  if (!verified && run.status === 'completed') {
    try {
      const authorized = (await originalCandidates(github, Number(batch.originalRunId))).filter(
        artifact => artifact.name === 'sdk-authorized-batch'
      );
      lostAuthorization =
        authorized.length !== 1 ||
        authorized[0].workflow_run.id !== Number(batch.originalRunId) ||
        authorized[0].workflow_run.head_sha !== batch.inputBase ||
        authorized[0].expired ||
        Date.parse(authorized[0].expires_at) <= Date.now();
    } catch (error) {
      if (!(error instanceof GitHubReleaseApiError) || error.status !== 404) throw error;
      lostAuthorization = true;
    }
  }
  const terminal =
    !verified &&
    (lostAuthorization ||
      lostCandidate ||
      (run.run_attempt >= 50 && run.status === 'completed') ||
      Date.now() >= Date.parse(run.created_at) + 30 * 86_400_000 ||
      jobs.some(job =>
        job.steps.some(
          step => step.name === 'Registry recovery exhausted' && step.conclusion === 'success'
        )
      ));
  return {
    verified,
    terminal,
    jobs,
    terminalReason: lostAuthorization
      ? 'Original preparation authorization is unavailable. Request a newly approved higher-version corrective release.'
      : undefined,
  };
}
/** Called under the shared controller concurrency group, before planning/allocating. */
export async function activePreparation(github: GitHubReleaseClient, exceptRun: string) {
  for (let page = 1; ; page++) {
    const runs = await github.request(
      'GET',
      `${repo}/actions/workflows/sdk.release.yml/runs?branch=next&per_page=100&page=${page}`,
      z.object({ workflow_runs: z.array(releaseRunSchema) })
    );
    for (const run of runs.workflow_runs) {
      if (
        String(run.id) === exceptRun ||
        !['issues', 'workflow_dispatch'].includes(run.event ?? '') ||
        run.path !== '.github/workflows/sdk.release.yml' ||
        run.repository.full_name !== SDK_RELEASE_REPOSITORY ||
        Date.now() >= Date.parse(run.created_at) + 30 * 86_400_000 ||
        (run.run_attempt >= 50 && run.status === 'completed')
      )
        continue;
      const jobs = await github.jobs(String(run.id));
      const prepared = jobs.some(job => job.name === 'release-pr' && job.conclusion === 'success');
      if (prepared) continue;
      // A PR created before a later status write failed is already represented by the PR/publication lock.
      if (await batchForPreparation(github, String(run.id))) continue;
      // The native authorized input artifact distinguishes allocations from status/retry/no-op requests.
      if (
        (await originalCandidates(github, run.id)).some(
          artifact => artifact.name === 'sdk-authorized-batch'
        )
      )
        return run;
    }
    if (runs.workflow_runs.length < 100) return undefined;
  }
}

export async function currentPublication(github: GitHubReleaseClient) {
  const batch = await committedBatch(github, 'next');
  if (!batch) return undefined;
  const run = await sourceTagRun(github, batch);
  if (!run) return { batch, run: undefined, active: true, verified: false, terminal: false };
  if (
    !run.head_sha ||
    run.event !== 'push' ||
    JSON.stringify(await committedBatch(github, run.head_sha)) !== JSON.stringify(batch)
  )
    throw new Error('Original tag run source differs from the committed batch');
  const state = await publicationState(github, run);
  return { batch, run, ...state, active: !state.verified && !state.terminal };
}
