import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  ArtifactSchema,
  OpenAIGenerationSchema,
  ReleaseRequestSchema,
  type ReleaseArtifact,
  type ReleasePackage,
  type ReleaseRequest,
} from './contracts';
import { GenerationRecordSchema, type GenerationRecord } from './generate-changelog';

const GitShaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const ReleaseIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const PreparationMarkerPattern = /<!-- sdk-release-preparation:[A-Za-z0-9][A-Za-z0-9._-]* -->/;
const PullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    head_ref: z.string().min(1),
    base_ref: z.string().min(1),
    body: z.string(),
  })
  .strict();
const PullRequestPlanSchema = z
  .object({
    release_id: z.string().min(1),
    base_ref: z.string().min(1),
    expected_remote_head: GitShaSchema,
    remote_branch_head: GitShaSchema.nullable(),
    open_pull_requests: z.array(PullRequestSchema),
  })
  .strict();

export interface DispatchInputs {
  operation?: unknown;
  release_id?: unknown;
  scope?: unknown;
  python_version?: unknown;
}

export interface PullRequestPlan {
  release_id: string;
  base_ref: string;
  expected_remote_head: string;
  remote_branch_head: string | null;
  open_pull_requests: Array<{
    number: number;
    head_ref: string;
    base_ref: string;
    body: string;
  }>;
}

export type PreparationPullRequestAction =
  | { action: 'create'; branch: string; marker: string }
  | {
      action: 'update';
      branch: string;
      marker: string;
      pull_request_number: number;
    };

export type PreparationPatchAction = 'apply' | 'already_applied';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function normalizedInput(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeDispatchRequest(inputs: DispatchInputs): ReleaseRequest {
  return ReleaseRequestSchema.parse({
    schema_version: 'sdk-release-request/v1',
    operation: normalizedInput(inputs.operation),
    release_id: normalizedInput(inputs.release_id),
    scope: normalizedInput(inputs.scope),
    ...(normalizedInput(inputs.python_version)
      ? { python_version: normalizedInput(inputs.python_version) }
      : {}),
  });
}

export function preparationBranch(releaseId: string): string {
  return `release/sdk-${ReleaseIdSchema.parse(releaseId)}`;
}

export function preparationMarker(releaseId: string): string {
  const branch = preparationBranch(releaseId);
  return `<!-- sdk-release-preparation:${branch.slice('release/sdk-'.length)} -->`;
}

export function assertPreparedBaseCommit(
  capturedPrimaryCommit: string,
  manifestBaseCommit: string
): string {
  const captured = GitShaSchema.parse(capturedPrimaryCommit.trim());
  const recorded = GitShaSchema.parse(manifestBaseCommit.trim());
  if (captured !== recorded) {
    throw new Error(
      `Prepared base commit mismatch: primary checkout ${captured}, manifest ${recorded}`
    );
  }
  return captured;
}

export function generationRecordFromManifest(rawGeneration: unknown): GenerationRecord {
  const { provider: _provider, ...record } = OpenAIGenerationSchema.parse(rawGeneration);
  return GenerationRecordSchema.parse(record);
}

export function planPreparationPatch(input: {
  applies_cleanly: boolean;
  reverse_applies_cleanly: boolean;
}): PreparationPatchAction {
  if (input.applies_cleanly && !input.reverse_applies_cleanly) return 'apply';
  if (!input.applies_cleanly && input.reverse_applies_cleanly) return 'already_applied';
  throw new Error('Preparation patch state is unexpected or divergent');
}

function releaseMarker(body: string): string | undefined {
  return body.match(PreparationMarkerPattern)?.[0];
}

export function planPreparationPullRequest(input: PullRequestPlan): PreparationPullRequestAction {
  const parsed = PullRequestPlanSchema.parse(input);
  const branch = preparationBranch(parsed.release_id);
  const marker = preparationMarker(parsed.release_id);

  if (
    parsed.remote_branch_head !== null &&
    parsed.remote_branch_head !== parsed.expected_remote_head
  ) {
    throw new Error(
      `Preparation branch non-fast-forward: expected ${parsed.expected_remote_head}, received ${parsed.remote_branch_head}`
    );
  }

  const ownedPullRequests = parsed.open_pull_requests.filter(pullRequest =>
    releaseMarker(pullRequest.body)
  );
  const competing = ownedPullRequests.find(pullRequest => !pullRequest.body.includes(marker));
  if (competing) {
    throw new Error(
      `SDK release lineage in PR #${competing.number} is still open; cannot start ${parsed.release_id}`
    );
  }

  const candidates = parsed.open_pull_requests.filter(pullRequest =>
    pullRequest.body.includes(marker)
  );
  if (candidates.length > 1) {
    throw new Error(`Multiple preparation PRs contain marker ${marker}`);
  }
  const candidate = candidates[0];
  if (!candidate) {
    const branchOwner = parsed.open_pull_requests.find(
      pullRequest => pullRequest.head_ref === branch
    );
    if (branchOwner) {
      throw new Error(
        `Preparation branch ${branch} has divergent PR #${branchOwner.number} without its marker`
      );
    }
    return { action: 'create', branch, marker };
  }
  if (parsed.remote_branch_head === null) {
    throw new Error(
      `Preparation PR #${candidate.number} is divergent: remote branch ${branch} is missing`
    );
  }
  if (candidate.head_ref !== branch || candidate.base_ref !== parsed.base_ref) {
    throw new Error(
      `Preparation PR #${candidate.number} is divergent: expected ${branch} -> ${parsed.base_ref}`
    );
  }
  return {
    action: 'update',
    branch,
    marker,
    pull_request_number: candidate.number,
  };
}

function normalizedArtifacts(artifacts: readonly ReleaseArtifact[]): ReleaseArtifact[] {
  const parsed = artifacts.map(artifact => ArtifactSchema.parse(artifact));
  const duplicate = parsed.find(
    (artifact, index) =>
      parsed.findIndex(candidate => candidate.filename === artifact.filename) !== index
  );
  if (duplicate) {
    throw new Error(`artifact set contains duplicate filename ${duplicate.filename}`);
  }
  return parsed.sort(
    (left, right) =>
      compareText(left.filename, right.filename) ||
      compareText(left.package_name, right.package_name)
  );
}

export function compareArtifactBuilds(
  primaryArtifacts: readonly ReleaseArtifact[],
  verificationArtifacts: readonly ReleaseArtifact[]
): ReleaseArtifact[] {
  const validatedPrimary = primaryArtifacts.map(artifact => ArtifactSchema.parse(artifact));
  const primary = normalizedArtifacts(primaryArtifacts);
  const verification = normalizedArtifacts(verificationArtifacts);
  const primaryNames = primary.map(artifact => artifact.filename);
  const verificationNames = verification.map(artifact => artifact.filename);
  if (JSON.stringify(primaryNames) !== JSON.stringify(verificationNames)) {
    throw new Error(
      `artifact set mismatch: primary [${primaryNames.join(', ')}], verification [${verificationNames.join(', ')}]`
    );
  }
  for (const [index, artifact] of primary.entries()) {
    const reproduced = verification[index];
    if (
      !reproduced ||
      artifact.sha256 !== reproduced.sha256 ||
      artifact.ecosystem !== reproduced.ecosystem ||
      artifact.registry !== reproduced.registry ||
      artifact.package_name !== reproduced.package_name
    ) {
      throw new Error(`artifact digest mismatch for ${artifact.filename}`);
    }
  }
  return validatedPrimary;
}

function packageIdentity(releasePackage: ReleasePackage): string {
  return `${releasePackage.ecosystem}:${releasePackage.name}@${releasePackage.version}`;
}

export function compareShadowPackages(
  coordinatorPackages: readonly ReleasePackage[],
  legacyPackages: readonly ReleasePackage[]
): {
  status: 'exact' | 'mismatch';
  coordinator: string[];
  legacy: string[];
} {
  const coordinator = coordinatorPackages.map(packageIdentity).sort(compareText);
  const legacy = legacyPackages.map(packageIdentity).sort(compareText);
  return {
    status: JSON.stringify(coordinator) === JSON.stringify(legacy) ? 'exact' : 'mismatch',
    coordinator,
    legacy,
  };
}

function argumentValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function writeJson(path: string | undefined, value: unknown): void {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  if (path) {
    writeFileSync(path, bytes);
  } else {
    process.stdout.write(bytes);
  }
}

async function main(args: string[]): Promise<void> {
  const command = args[0];
  if (command === 'normalize-dispatch') {
    writeJson(
      args.includes('--output') ? argumentValue(args, '--output') : undefined,
      normalizeDispatchRequest({
        operation: argumentValue(args, '--operation'),
        release_id: argumentValue(args, '--release-id'),
        scope: argumentValue(args, '--scope'),
        python_version: args.includes('--python-version')
          ? argumentValue(args, '--python-version')
          : undefined,
      })
    );
    return;
  }
  if (command === 'plan-pr') {
    const plan = JSON.parse(readFileSync(argumentValue(args, '--input'), 'utf8'));
    writeJson(
      args.includes('--output') ? argumentValue(args, '--output') : undefined,
      planPreparationPullRequest(plan)
    );
    return;
  }
  if (command === 'compare-artifacts') {
    const primary = JSON.parse(readFileSync(argumentValue(args, '--primary'), 'utf8'));
    const verification = JSON.parse(readFileSync(argumentValue(args, '--verification'), 'utf8'));
    writeJson(
      args.includes('--output') ? argumentValue(args, '--output') : undefined,
      compareArtifactBuilds(primary, verification)
    );
    return;
  }
  throw new Error('Expected normalize-dispatch, plan-pr, or compare-artifacts command');
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
