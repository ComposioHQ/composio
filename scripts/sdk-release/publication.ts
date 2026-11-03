import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
  actionArtifactSchema,
  candidateManifestSchema,
  originalCandidates,
  verifyCandidateFiles,
} from './artifacts';
import { committedBatch, publicationState } from './coordination';
import { GitHubReleaseClient, SDK_RELEASE_REPOSITORY } from './github';
import type { ReleaseBatch } from './source';
import { reconcileRegistry, type Distribution } from './registry';

const repo = `/repos/${SDK_RELEASE_REPOSITORY}`;
export const publicationReportSchema = z.object({
  runId: z.number().int().positive(),
  sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
  registryVerified: z.boolean(),
  terminal: z.boolean(),
  docs: z.enum(['pending', 'failed', 'verified']).default('pending'),
  detail: z.string().optional(),
  candidates: z.array(
    z.object({ artifact: actionArtifactSchema, manifest: candidateManifestSchema.optional() })
  ),
  inventory: z
    .array(
      z.object({
        name: z.string(),
        version: z.string(),
        file: z.string(),
        state: z.enum(['matching', 'missing', 'unverified']),
      })
    )
    .default([]),
});
export type PublicationReport = z.infer<typeof publicationReportSchema>;
const commentSchema = z.object({
  id: z.number(),
  body: z.string(),
  performed_via_github_app: z.object({ id: z.number() }).nullable().optional(),
});
const marker = (batch: ReleaseBatch) => `<!-- sdk-release-publication:${batch.id} -->`;

async function statusComment(
  github: GitHubReleaseClient,
  number: number,
  batch: ReleaseBatch,
  appId: number
) {
  for (let page = 1; ; page++) {
    const comments = await github.request(
      'GET',
      `${repo}/issues/${number}/comments?per_page=100&page=${page}`,
      z.array(commentSchema)
    );
    const saved = comments.find(
      comment =>
        comment.performed_via_github_app?.id === appId && comment.body.startsWith(marker(batch))
    );
    if (saved) return saved;
    if (comments.length < 100) return undefined;
  }
}
function issueNumber(batch: ReleaseBatch) {
  const url = new URL(batch.statusUrl);
  const match = url.pathname.match(/^\/ComposioHQ\/composio\/issues\/([1-9][0-9]*)$/);
  if (url.origin !== 'https://github.com' || !match)
    throw new Error('Release status must identify the canonical repository issue');
  return Number(match[1]);
}
export async function readPublicationStatus(
  github: GitHubReleaseClient,
  batch: ReleaseBatch,
  appId: number
) {
  const saved = await statusComment(github, issueNumber(batch), batch, appId);
  const data = saved?.body.match(
    /<script type="application\/json" data-sdk-publication>([\s\S]*?)<\/script>/
  )?.[1];
  return data ? publicationReportSchema.parse(JSON.parse(data)) : undefined;
}
/** The controller and docs completion update the same App-owned request/PR comment. */
export async function writePublicationStatus(
  github: GitHubReleaseClient,
  batch: ReleaseBatch,
  value: PublicationReport,
  appId: number,
  pullNumber?: number
) {
  const report = publicationReportSchema.parse(value);
  const status = report.registryVerified
    ? report.docs === 'verified'
      ? 'Packages published; release documentation verified.'
      : 'Packages published; docs pending.'
    : report.terminal
      ? 'Publication incomplete; recovery ended. Request a newly approved higher-version corrective release.'
      : 'Publication incomplete; retry the original run to reuse the selected versions and original bytes.';
  const rows = report.candidates
    .map(
      candidate =>
        `- Artifact ${candidate.artifact.id}: ${candidate.artifact.digest}; producer ${candidate.artifact.workflow_run.id}; source ${candidate.artifact.workflow_run.head_sha}; expires ${candidate.artifact.expires_at}${candidate.artifact.expired ? ' (expired)' : ''}\n${candidate.manifest?.files.map(file => `  - ${file.name}: sha256:${file.sha256} (${file.size} bytes)`).join('\n') ?? '  - Original file inventory unavailable.'}`
    )
    .join('\n');
  const inventory = report.inventory
    .map(file => `- ${file.name}@${file.version}/${file.file}: ${file.state}`)
    .join('\n');
  const body = `${marker(batch)}\n${status}\n\n${report.detail ?? ''}\n\nOriginal publication: https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${report.runId}\nApproved source: ${report.sourceSha}\n\n${rows}\n\nPublic inventory:\n${inventory || 'Not yet reconciled.'}\n\n<details><summary>Publication data</summary>\n<script type="application/json" data-sdk-publication>${JSON.stringify(report).replaceAll('<', '\\u003c')}</script>\n</details>`;
  for (const number of new Set([issueNumber(batch), ...(pullNumber ? [pullNumber] : [])])) {
    const saved = await statusComment(github, number, batch, appId);
    if (saved)
      await github.request(
        'PATCH',
        `${repo}/issues/comments/${saved.id}`,
        z.object({ id: z.number() }),
        { body }
      );
    else await github.commentIssue(number, body);
  }
  return report;
}

export async function reportPublication(github: GitHubReleaseClient, runId: string, appId: number) {
  const run = await github.getRun(runId);
  const state = await publicationState(github, run);
  const batch = (await committedBatch(github, run.head_sha!))!;
  const prior = await readPublicationStatus(github, batch, appId);
  const artifacts = await originalCandidates(github, run.id);
  const candidates: PublicationReport['candidates'] = [];
  const distributions: Distribution[] = [];
  let unavailable = false;
  for (const language of new Set(batch.plan.releases.map(release => release.language))) {
    const matching = artifacts.filter(artifact => artifact.name === `sdk-candidate-${language}`);
    if (matching.length > 1)
      throw new Error('Multiple original immutable candidates identify the same language');
    const artifact = matching[0];
    const previous = prior?.candidates.find(
      candidate => candidate.artifact.name === `sdk-candidate-${language}`
    );
    if (!artifact) {
      unavailable = true;
      if (previous) candidates.push(previous);
      continue;
    }
    if (artifact.workflow_run.id !== run.id || artifact.workflow_run.head_sha !== run.head_sha)
      throw new Error('Status candidate source/producer differs');
    if (artifact.expired || Date.parse(artifact.expires_at) <= Date.now()) {
      unavailable = true;
      candidates.push({ artifact, ...(previous?.manifest ? { manifest: previous.manifest } : {}) });
      continue;
    }
    const directory = await mkdtemp(join(tmpdir(), 'sdk-status-'));
    try {
      await github.downloadArtifact(artifact, directory);
      const manifest = candidateManifestSchema.parse(
        await Bun.file(join(directory, 'candidate.json')).json()
      );
      if (
        manifest.sourceSha !== run.head_sha ||
        manifest.producerRun !== run.id ||
        manifest.language !== language
      )
        throw new Error('Status manifest source/producer differs');
      const bytes = new Map(
        await Promise.all(
          (await readdir(directory))
            .filter(name => name !== 'candidate.json')
            .map(
              async name => [name, new Uint8Array(await readFile(join(directory, name)))] as const
            )
        )
      );
      verifyCandidateFiles(bytes, manifest.files);
      for (const file of manifest.files) {
        const release = batch.plan.releases.find(
          release =>
            release.language === language &&
            (language === 'python' ||
              file.name ===
                `${release.name.replace(/^@/, '').replaceAll('/', '-')}-${release.newVersion}.tgz`)
        );
        if (!release) throw new Error('Status candidate file does not match the selected target');
        const name =
          language === 'typescript'
            ? release.name
            : file.name.split(`-${release.newVersion}`)[0].replaceAll('_', '-');
        distributions.push({
          name,
          version: release.newVersion,
          file: file.name,
          language,
          bytes: bytes.get(file.name)!,
          sha256: file.sha256,
        });
      }
      candidates.push({ artifact, manifest });
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(`${directory}.zip`, { force: true });
    }
  }
  const pulls = await github.request(
    'GET',
    `${repo}/commits/${run.head_sha}/pulls?per_page=100`,
    z.array(
      z.object({
        number: z.number(),
        merged_at: z.string().nullable(),
        head: z.object({ sha: z.string() }),
      })
    )
  );
  const pull = pulls.find(pull => pull.head.sha === run.head_sha && pull.merged_at);
  if (!pull) throw new Error('Status source is not a merged release head');
  const inventory: PublicationReport['inventory'] = [];
  const details: string[] = [];
  for (const files of Map.groupBy(
    distributions,
    file => `${file.language}:${file.name}`
  ).values()) {
    try {
      const reconciled = await reconcileRegistry(files, {
        sha: run.head_sha!,
        tag: run.head_branch!,
        runId: run.id,
      });
      inventory.push(
        ...reconciled.existing.map(file => ({
          name: file.name,
          version: file.version,
          file: file.file,
          state: 'matching' as const,
        })),
        ...reconciled.missing.map(file => ({
          name: file.name,
          version: file.version,
          file: file.file,
          state: 'missing' as const,
        }))
      );
    } catch (error) {
      inventory.push(
        ...files.map(file => ({
          name: file.name,
          version: file.version,
          file: file.file,
          state: 'unverified' as const,
        }))
      );
      details.push(error instanceof Error ? error.message : 'Registry reconciliation incomplete');
    }
  }
  const report = await writePublicationStatus(
    github,
    batch,
    {
      runId: run.id,
      sourceSha: run.head_sha!,
      registryVerified: state.verified,
      terminal: !state.verified && !!state.terminal,
      docs: prior?.docs ?? 'pending',
      candidates,
      inventory: inventory.length ? inventory : (prior?.inventory ?? []),
      detail:
        [
          ...details,
          ...(unavailable && !state.verified
            ? [
                state.terminal
                  ? 'Original candidate artifact unavailable. Published files remain untouched; the next approved plan must select higher corrective versions.'
                  : 'Original candidate artifact unavailable before publication; retry the original preparation to rebuild only if no upload may have started.',
              ]
            : []),
        ].join('\n') || undefined,
    },
    appId,
    pull.number
  );
  return { batch, report, pullNumber: pull.number };
}
