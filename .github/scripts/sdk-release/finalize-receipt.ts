import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  AttemptReceiptSchema,
  RegistryObservationSchema,
  SealedManifestSchema,
  type AttemptReceipt,
  type RegistryObservation,
} from './contracts';
import { computeManifestId } from './manifest';

const GitShaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const ManifestIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const PullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
    head_ref: z.string().min(1),
    base_ref: z.string().min(1),
    body: z.string(),
    merge_commit_sha: GitShaSchema.nullable(),
  })
  .strict();
const PrepareRunSchema = z
  .object({
    run_id: z.number().int().positive(),
    run_attempt: z.number().int().positive(),
    repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
    workflow: z.string().min(1),
    conclusion: z.literal('success'),
  })
  .strict();

export interface ResolveMergedReleaseOptions {
  release_id: string;
  repository: string;
  pull_requests: Array<z.infer<typeof PullRequestSchema>>;
  manifest: unknown;
  prepare_run: z.infer<typeof PrepareRunSchema>;
}

export function resolveMergedRelease(options: ResolveMergedReleaseOptions): {
  manifest_id: string;
  source_commit: string;
  preparation_pull_request: number;
  prepare_run_id: number;
  prepare_run_attempt: number;
} {
  let manifest;
  try {
    manifest = SealedManifestSchema.parse(options.manifest);
  } catch {
    throw new Error('Release manifest must be canonical and sealed');
  }
  if (manifest.release_id !== options.release_id) {
    throw new Error(
      `Sealed manifest release mismatch: expected ${options.release_id}, received ${manifest.release_id}`
    );
  }
  if (
    manifest.prepare_run.repository !== options.repository ||
    manifest.prepare_run.commit_sha !== manifest.base_commit
  ) {
    throw new Error('Sealed manifest source or prepare-run repository is stale');
  }

  const marker = `<!-- sdk-release-preparation:${options.release_id} -->`;
  const branch = `release/sdk-${options.release_id}`;
  const pullRequests = options.pull_requests.map(pullRequest =>
    PullRequestSchema.parse(pullRequest)
  );
  const matching = pullRequests.filter(
    pullRequest =>
      pullRequest.state === 'MERGED' &&
      pullRequest.head_ref === branch &&
      pullRequest.base_ref === 'next' &&
      pullRequest.body.includes(marker)
  );
  if (matching.length !== 1 || !matching[0]?.merge_commit_sha) {
    throw new Error('Release requires exactly one merged preparation PR with exact lineage');
  }

  const prepareRun = PrepareRunSchema.parse(options.prepare_run);
  if (
    prepareRun.repository !== manifest.prepare_run.repository ||
    prepareRun.workflow !== manifest.prepare_run.workflow ||
    prepareRun.run_id !== manifest.prepare_run.run_id ||
    prepareRun.run_attempt !== manifest.prepare_run.run_attempt
  ) {
    throw new Error('Downloaded artifacts do not belong to the sealed prepare run');
  }
  return {
    manifest_id: computeManifestId(manifest),
    source_commit: matching[0].merge_commit_sha,
    preparation_pull_request: matching[0].number,
    prepare_run_id: prepareRun.run_id,
    prepare_run_attempt: prepareRun.run_attempt,
  };
}

export function planAttemptOutcome(options: {
  observations: readonly RegistryObservation[];
  cancelled_after_possible_write: boolean;
}): 'partial' | 'conflict' | 'verified' {
  const observations = options.observations.map(observation =>
    RegistryObservationSchema.parse(observation)
  );
  if (observations.length === 0) throw new Error('Attempt outcome requires registry observations');
  if (observations.some(observation => observation.state === 'conflict')) return 'conflict';
  if (options.cancelled_after_possible_write) return 'partial';
  return observations.every(observation => observation.state === 'exact') ? 'verified' : 'partial';
}

function inlineCode(value: string | number): string {
  return `\`${String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/`/g, '&#96;')
    .replace(/\|/g, '&#124;')}\``;
}

export function renderAttemptReceipt(rawReceipt: AttemptReceipt): string {
  const receipt = AttemptReceiptSchema.parse(rawReceipt);
  const rows = receipt.observations.map(
    observation =>
      `| ${observation.registry} | ${inlineCode(observation.package_name)} | ${inlineCode(observation.version)} | ${observation.state} |`
  );
  return [
    `<!-- sdk-release-attempt:${receipt.release_id}:${receipt.attempt} -->`,
    `## SDK release attempt ${receipt.attempt}`,
    '',
    `Manifest: ${inlineCode(receipt.manifest_id)}`,
    `Operation: ${inlineCode(receipt.operation)}`,
    `Workflow run: ${inlineCode(receipt.workflow_run_id)}, attempt ${receipt.workflow_run_attempt}`,
    `Outcome: **${receipt.outcome}**`,
    `Transition: ${inlineCode(receipt.transition.from)} → ${inlineCode(receipt.transition.to)}`,
    '',
    '| Registry | Package | Version | State |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

const ReceiptIndexSchema = z
  .object({
    release_id: z.string().min(1),
    manifest_id: ManifestIdSchema,
    source_commit: GitShaSchema,
    attempts: z.array(
      z
        .object({
          attempt: z.number().int().positive(),
          outcome: z.enum(['partial', 'conflict', 'verified', 'receipted', 'notified']),
          workflow_run_id: z.number().int().positive(),
        })
        .strict()
    ),
  })
  .strict();

export function renderReceiptIndex(rawIndex: z.input<typeof ReceiptIndexSchema>): string {
  const index = ReceiptIndexSchema.parse(rawIndex);
  return [
    `<!-- sdk-release-index:${index.manifest_id} -->`,
    '## SDK release receipt index',
    '',
    `Release: ${inlineCode(index.release_id)}`,
    `Manifest: ${inlineCode(index.manifest_id)}`,
    `Sealed source: ${inlineCode(index.source_commit)}`,
    '',
    ...index.attempts.map(
      attempt =>
        `- Attempt ${attempt.attempt}: **${attempt.outcome}** ([workflow run ${attempt.workflow_run_id}](https://github.com/${process.env.GITHUB_REPOSITORY ?? 'OWNER/REPO'}/actions/runs/${attempt.workflow_run_id}))`
    ),
    '',
  ].join('\n');
}

function argumentValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main(args: string[]): Promise<void> {
  const command = args[0];
  const input = JSON.parse(readFileSync(argumentValue(args, '--input'), 'utf8'));
  const rendered =
    command === 'attempt'
      ? renderAttemptReceipt(input)
      : command === 'index'
        ? renderReceiptIndex(input)
        : undefined;
  if (!rendered) throw new Error('Expected attempt or index command');
  const outputIndex = args.indexOf('--output');
  if (outputIndex === -1) process.stdout.write(rendered);
  else writeFileSync(argumentValue(args, '--output'), rendered);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
