import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  AttemptReceiptSchema,
  SealedManifestSchema,
  type AttemptReceipt,
  type SealedManifest,
} from './contracts';
import { computeManifestId } from './manifest';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const PublicFileSchema = z
  .object({
    path: z.string().regex(/^docs\/content\/changelog\/[^/]+\.mdx$/),
    sha256: Sha256Schema,
  })
  .strict();
const PullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
    head_ref: z.string().min(1),
    base_ref: z.string().min(1),
    body: z.string(),
    merge_commit_sha: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .nullable(),
  })
  .strict();

export interface ChangelogFinalizationPlan {
  state: 'create_pr' | 'update_pr' | 'already_finalized';
  final_path: string;
  branch: string;
  marker: string;
  pull_request: number | null;
  sha256: string;
}

function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function releaseSlug(releaseId: string): string {
  const slug = releaseId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new Error('Release ID cannot produce an empty changelog suffix');
  return slug;
}

function datePrefix(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error('Public changelog requires a YYYY-MM-DD frontmatter date');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid public changelog date: ${date}`);
  }
  return `${match[2]}-${match[3]}-${match[1]?.slice(2)}`;
}

function parseFrontmatter(mdx: string): { title: string; date: string } {
  const match = /^---\ntitle: "([^"\n]+)"\ndate: "([^"\n]+)"\n---\n/.exec(mdx);
  if (!match?.[1] || !match[2]) {
    throw new Error('Public changelog has invalid deterministic frontmatter');
  }
  return { title: match[1], date: match[2] };
}

function packageRows(
  mdx: string
): Array<{ ecosystem: 'typescript' | 'python'; name: string; version: string }> {
  return [...mdx.matchAll(/^\| (TypeScript|Python) `([^`\n]+)` \| `([^`\n]+)` \|$/gm)].map(
    match => ({
      ecosystem: match[1] === 'TypeScript' ? 'typescript' : 'python',
      name: match[2]!,
      version: match[3]!,
    })
  );
}

function packageIdentity(releasePackage: {
  ecosystem: 'typescript' | 'python';
  name: string;
  version: string;
}): string {
  return `${releasePackage.ecosystem}:${releasePackage.name}@${releasePackage.version}`;
}

export function validatePublicChangelog(
  rawManifest: SealedManifest,
  rawReceipt: AttemptReceipt,
  draftBytes: string
): { date: string; sha256: string } {
  const manifest = SealedManifestSchema.parse(rawManifest);
  const receipt = AttemptReceiptSchema.parse(rawReceipt);
  const manifestId = computeManifestId(manifest);
  if (
    receipt.release_id !== manifest.release_id ||
    receipt.manifest_id !== manifestId ||
    receipt.outcome !== 'verified' ||
    receipt.transition.to !== 'verified'
  ) {
    throw new Error('Changelog finalization requires the exact verified release receipt');
  }

  const expectedPackages = new Set(manifest.packages.map(packageIdentity));
  const observedPackages = new Set(
    receipt.observations.map(observation => {
      const releasePackage = manifest.packages.find(
        candidate =>
          candidate.name === observation.package_name && candidate.version === observation.version
      );
      if (!releasePackage || releasePackage.registry !== observation.registry) {
        throw new Error(
          `Verified receipt contains an unknown package: ${observation.package_name}@${observation.version}`
        );
      }
      const normalizeArtifacts = (
        artifacts: Array<{ filename: string; sha256: string; integrity?: string }>
      ) =>
        artifacts
          .map(artifact => ({
            filename: artifact.filename,
            sha256: artifact.sha256,
            ...('integrity' in artifact && artifact.integrity
              ? { integrity: artifact.integrity }
              : {}),
          }))
          .sort((left, right) => left.filename.localeCompare(right.filename));
      const manifestArtifacts = manifest.artifacts
        .filter(artifact => artifact.package_name === releasePackage.name)
        .map(artifact => ({
          filename: artifact.filename,
          sha256: artifact.sha256,
          ...('integrity' in artifact ? { integrity: artifact.integrity } : {}),
        }));
      if (
        JSON.stringify(normalizeArtifacts(observation.expected_artifacts)) !==
        JSON.stringify(normalizeArtifacts(manifestArtifacts))
      ) {
        throw new Error(
          `Verified receipt artifact set drifted for ${observation.package_name}@${observation.version}`
        );
      }
      return packageIdentity(releasePackage);
    })
  );
  if (
    expectedPackages.size !== observedPackages.size ||
    [...expectedPackages].some(identity => !observedPackages.has(identity))
  ) {
    throw new Error('Verified receipt does not cover the complete sealed package set');
  }

  const digest = sha256(draftBytes);
  if (digest !== manifest.changelog.sha256) {
    throw new Error('Reviewed changelog bytes do not match the sealed digest');
  }
  if (draftBytes.includes('\r')) {
    throw new Error('Reviewed changelog must use canonical LF line endings');
  }
  if (/^#{1,2}\s/m.test(draftBytes)) {
    throw new Error('Public changelog content headings must begin at level three');
  }

  const frontmatter = parseFrontmatter(draftBytes);
  if (frontmatter.title !== `SDK Release ${manifest.release_id}`) {
    throw new Error('Public changelog title does not match the sealed release');
  }
  const expectedRows = new Set(manifest.packages.map(packageIdentity));
  const actualRows = packageRows(draftBytes);
  const actualIdentities = new Set(actualRows.map(packageIdentity));
  if (
    actualRows.length !== manifest.packages.length ||
    expectedRows.size !== actualIdentities.size ||
    [...expectedRows].some(identity => !actualIdentities.has(identity))
  ) {
    throw new Error('Public changelog SDK version table does not match the sealed manifest');
  }
  if (
    manifest.selection.python === 'selected' &&
    !actualRows.some(
      row =>
        row.ecosystem === 'python' &&
        row.name === 'composio' &&
        row.version ===
          manifest.packages.find(item => item.ecosystem === 'python' && item.name === 'composio')
            ?.version
    )
  ) {
    throw new Error('Public changelog is missing the Python composio released-version guard row');
  }

  return { date: frontmatter.date, sha256: digest };
}

function choosePublicPath(options: {
  date: string;
  release_id: string;
  digest: string;
  existing_files: Array<z.infer<typeof PublicFileSchema>>;
}): { path: string; already_finalized: boolean } {
  const prefix = datePrefix(options.date);
  const base = `docs/content/changelog/${prefix}.mdx`;
  const suffixed = `docs/content/changelog/${prefix}-${releaseSlug(options.release_id)}.mdx`;
  const files = new Map(
    options.existing_files.map(file => {
      const parsed = PublicFileSchema.parse(file);
      return [parsed.path, parsed.sha256] as const;
    })
  );

  const baseDigest = files.get(base);
  if (!baseDigest) return { path: base, already_finalized: false };
  if (baseDigest === options.digest) return { path: base, already_finalized: true };
  const suffixDigest = files.get(suffixed);
  if (!suffixDigest) return { path: suffixed, already_finalized: false };
  if (suffixDigest === options.digest) return { path: suffixed, already_finalized: true };
  throw new Error(`Conflicting public changelog already exists at ${suffixed}`);
}

export function planChangelogFinalization(options: {
  manifest: SealedManifest;
  receipt: AttemptReceipt;
  draft_path: string;
  draft_bytes: string;
  existing_files: Array<z.infer<typeof PublicFileSchema>>;
  pull_requests: Array<z.infer<typeof PullRequestSchema>>;
}): ChangelogFinalizationPlan {
  const manifest = SealedManifestSchema.parse(options.manifest);
  if (options.draft_path !== manifest.changelog.draft_path || basename(options.draft_path) === '') {
    throw new Error('Reviewed changelog path does not match the sealed manifest');
  }
  const validated = validatePublicChangelog(manifest, options.receipt, options.draft_bytes);
  const manifestId = computeManifestId(manifest);
  const branch = `release/sdk-${manifest.release_id}-changelog`;
  const marker = `<!-- sdk-release-finalization:${manifestId} -->`;
  const publicPath = choosePublicPath({
    date: validated.date,
    release_id: manifest.release_id,
    digest: validated.sha256,
    existing_files: options.existing_files,
  });
  const branchPullRequests = options.pull_requests
    .map(pullRequest => PullRequestSchema.parse(pullRequest))
    .filter(pullRequest => pullRequest.head_ref === branch && pullRequest.base_ref === 'next');
  if (branchPullRequests.some(pullRequest => !pullRequest.body.includes(marker))) {
    throw new Error('Stable changelog branch is already bound to another finalization lineage');
  }
  if (branchPullRequests.length > 1) {
    throw new Error('Release has multiple changelog finalization pull requests');
  }
  const pullRequest = branchPullRequests[0];
  if (publicPath.already_finalized) {
    if (pullRequest?.state === 'OPEN') {
      throw new Error('Public changelog is exact but its finalization PR is still open');
    }
    return {
      state: 'already_finalized',
      final_path: publicPath.path,
      branch,
      marker,
      pull_request: pullRequest?.number ?? null,
      sha256: validated.sha256,
    };
  }
  if (pullRequest?.state === 'MERGED') {
    throw new Error('Merged finalization PR does not contain the sealed public changelog');
  }
  return {
    state: pullRequest?.state === 'OPEN' ? 'update_pr' : 'create_pr',
    final_path: publicPath.path,
    branch,
    marker,
    pull_request: pullRequest?.number ?? null,
    sha256: validated.sha256,
  };
}

export function planDownstreamEmission(options: {
  pull_requests: Array<z.infer<typeof PullRequestSchema>>;
  changed_files: string[];
  existing_markers: string[];
  channel: 'docs' | 'notification';
}):
  | { emit: false; manifest_id: null; marker: null; pull_request: null }
  | { emit: boolean; manifest_id: string; marker: string; pull_request: number } {
  const changedFiles = options.changed_files.filter(path =>
    /^docs\/content\/changelog\/[^/]+\.mdx$/.test(path)
  );
  if (changedFiles.length > 1) {
    throw new Error('Verified changelog merge must change exactly one public MDX file');
  }
  if (changedFiles.length === 0) {
    return { emit: false, manifest_id: null, marker: null, pull_request: null };
  }
  const matching = options.pull_requests
    .map(pullRequest => PullRequestSchema.parse(pullRequest))
    .filter(
      pullRequest =>
        pullRequest.state === 'MERGED' &&
        pullRequest.base_ref === 'next' &&
        /^release\/sdk-[A-Za-z0-9._-]+-changelog$/.test(pullRequest.head_ref) &&
        /<!-- sdk-release-finalization:[a-f0-9]{64} -->/.test(pullRequest.body)
    );
  if (matching.length > 1) {
    throw new Error('Public changelog is bound to multiple verified finalization PRs');
  }
  if (matching.length === 0) {
    return { emit: false, manifest_id: null, marker: null, pull_request: null };
  }
  const manifestId = /<!-- sdk-release-finalization:([a-f0-9]{64}) -->/.exec(
    matching[0]!.body
  )![1]!;
  const marker = `<!-- sdk-release-${options.channel}:${manifestId} -->`;
  return {
    emit: !options.existing_markers.includes(marker),
    manifest_id: manifestId,
    marker,
    pull_request: matching[0]!.number,
  };
}

function argumentValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main(args: string[]): Promise<void> {
  const command = args[0];
  const plan =
    command === 'plan'
      ? (() => {
          const draftPath = argumentValue(args, '--draft');
          return planChangelogFinalization({
            manifest: JSON.parse(readFileSync(argumentValue(args, '--manifest'), 'utf8')),
            receipt: JSON.parse(readFileSync(argumentValue(args, '--receipt'), 'utf8')),
            draft_path: draftPath,
            draft_bytes: readFileSync(draftPath, 'utf8'),
            existing_files: JSON.parse(readFileSync(argumentValue(args, '--inventory'), 'utf8')),
            pull_requests: JSON.parse(readFileSync(argumentValue(args, '--pull-requests'), 'utf8')),
          });
        })()
      : command === 'downstream'
        ? planDownstreamEmission({
            pull_requests: JSON.parse(readFileSync(argumentValue(args, '--pull-requests'), 'utf8')),
            changed_files: JSON.parse(readFileSync(argumentValue(args, '--changed-files'), 'utf8')),
            existing_markers: JSON.parse(
              readFileSync(argumentValue(args, '--existing-markers'), 'utf8')
            ),
            channel: z.enum(['docs', 'notification']).parse(argumentValue(args, '--channel')),
          })
        : undefined;
  if (!plan) throw new Error('Expected plan or downstream command');
  writeFileSync(argumentValue(args, '--output'), `${JSON.stringify(plan, null, 2)}\n`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
