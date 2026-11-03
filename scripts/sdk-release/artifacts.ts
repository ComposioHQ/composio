import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GitHubReleaseClient, SDK_RELEASE_REPOSITORY } from './github';

export const candidateFileSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().nonnegative(),
});
export const candidateManifestSchema = z.object({
  sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
  producerRun: z.number().int().positive(),
  language: z.enum(['typescript', 'python']),
  files: z
    .array(candidateFileSchema)
    .min(1)
    .refine(
      files => new Set(files.map(file => file.name)).size === files.length,
      'Candidate filenames must be unique'
    ),
});
export const actionArtifactSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  expired: z.boolean(),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  workflow_run: z.object({
    id: z.number().int().positive(),
    head_sha: z.string().regex(/^[a-f0-9]{40}$/),
  }),
});
export type CandidateArtifact = z.infer<typeof actionArtifactSchema>;
export function normalizeArtifactDigest(value: unknown): string {
  const digest = z.string().parse(value);
  return actionArtifactSchema.shape.digest.parse(
    digest.startsWith('sha256:') ? digest : `sha256:${digest}`
  );
}
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export function reuseCandidate(
  artifacts: CandidateArtifact[],
  name: string,
  producerRun: number,
  sourceSha: string,
  now = Date.now()
): CandidateArtifact | undefined {
  const matching = artifacts.filter(artifact => artifact.name === name);
  if (matching.length > 1) throw new Error('Multiple immutable candidates have the same name');
  const artifact = matching[0];
  if (!artifact) return undefined;
  if (artifact.workflow_run.id !== producerRun || artifact.workflow_run.head_sha !== sourceSha)
    throw new Error('Candidate source or producer does not match');
  if (artifact.expired || Date.parse(artifact.expires_at) <= now)
    throw new Error('Original candidate unavailable; a corrective release is required');
  return actionArtifactSchema.parse(artifact);
}
export function verifyArchive(bytes: Uint8Array, digest: string): void {
  if (`sha256:${sha256(bytes)}` !== digest)
    throw new Error('Actions artifact archive digest mismatch');
}
export function verifyCandidateFiles(
  actual: Map<string, Uint8Array>,
  expected: z.infer<typeof candidateFileSchema>[]
): void {
  if (actual.size !== expected.length) throw new Error('Candidate file inventory mismatch');
  for (const file of expected) {
    const bytes = actual.get(file.name);
    if (!bytes || bytes.length !== file.size || sha256(bytes) !== file.sha256)
      throw new Error(`Candidate checksum mismatch: ${file.name}`);
  }
}
export function candidateGate(selected: string[], results: Record<string, string>): boolean {
  return selected.length > 0 && selected.every(language => results[language] === 'success');
}

export async function originalCandidates(
  github: GitHubReleaseClient,
  run: number
): Promise<CandidateArtifact[]> {
  const artifacts: CandidateArtifact[] = [];
  for (let page = 1; ; page++) {
    const result = await github.request(
      'GET',
      `/repos/${SDK_RELEASE_REPOSITORY}/actions/runs/${run}/artifacts?per_page=100&page=${page}`,
      z.object({ artifacts: z.array(actionArtifactSchema) })
    );
    artifacts.push(...result.artifacts);
    if (result.artifacts.length < 100) return artifacts;
  }
}

/** A registry 404 alone cannot establish that a previous publisher never ran. */
export async function mayRebuildMissingCandidate(
  github: GitHubReleaseClient,
  run: number,
  publicInventoryEmpty: boolean
): Promise<boolean> {
  let anyPublisherStarted = false;
  for (let page = 1; ; page++) {
    const result = await github.request(
      'GET',
      `/repos/${SDK_RELEASE_REPOSITORY}/actions/runs/${run}/jobs?filter=all&per_page=100&page=${page}`,
      z.object({
        jobs: z.array(
          z.object({
            name: z.string(),
            steps: z.array(
              z.object({ name: z.string(), status: z.string(), conclusion: z.string().nullable() })
            ),
          })
        ),
      })
    );
    anyPublisherStarted ||= result.jobs.some(job =>
      job.steps.some(
        step =>
          /upload.*(?:npm|pypi)|publish.*(?:npm|pypi)/i.test(step.name) &&
          step.status !== 'queued' &&
          step.conclusion !== 'skipped'
      )
    );
    if (result.jobs.length < 100) break;
  }
  return publicInventoryEmpty && !anyPublisherStarted;
}
