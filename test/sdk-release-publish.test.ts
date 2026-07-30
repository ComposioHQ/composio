import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import type { RegistryObservation, SealedManifest } from '../.github/scripts/sdk-release/contracts';
import { PYTHON_RELEASE_FAMILY } from '../.github/scripts/sdk-release/contracts';
import {
  buildReceiptIndex,
  buildAttemptReceipt,
  planAttemptOutcome,
  renderAttemptReceipt,
  renderReceiptIndex,
  resolveMergedRelease,
} from '../.github/scripts/sdk-release/finalize-receipt';
import { applyReleaseTags, planReleaseTags } from '../.github/scripts/sdk-release/finalize-tags';
import { computeManifestId } from '../.github/scripts/sdk-release/manifest';
import { verifySealedArtifactDirectory } from '../.github/scripts/sdk-release/reconcile';
import {
  executeNpmPublication,
  planNpmPublication,
} from '../.github/scripts/sdk-release/publish-npm';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const INTEGRITY_A =
  'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
const INTEGRITY_B =
  'sha512-AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ==';

const manifest = {
  schema_version: 'sdk-release-manifest/v1',
  phase: 'sealed',
  release_id: 'sdk-2026-07-30',
  base_commit: SHA_A,
  selection: { typescript: 'selected', python: 'selected' },
  packages: [
    {
      ecosystem: 'typescript',
      name: '@composio/core',
      version: '0.15.0',
      registry: 'npm',
      dist_tag: 'latest',
    },
    {
      ecosystem: 'typescript',
      name: '@composio/openai',
      version: '0.15.0',
      registry: 'npm',
      dist_tag: 'latest',
    },
    ...PYTHON_RELEASE_FAMILY.map(name => ({
      ecosystem: 'python' as const,
      name,
      version: '0.19.0',
      registry: 'pypi' as const,
    })),
  ],
  artifacts: [
    {
      ecosystem: 'typescript',
      package_name: '@composio/core',
      registry: 'npm',
      filename: 'composio-core-0.15.0.tgz',
      sha256: DIGEST_A,
      integrity: INTEGRITY_A,
    },
    {
      ecosystem: 'typescript',
      package_name: '@composio/openai',
      registry: 'npm',
      filename: 'composio-openai-0.15.0.tgz',
      sha256: DIGEST_B,
      integrity: INTEGRITY_B,
    },
    ...PYTHON_RELEASE_FAMILY.map(name => ({
      ecosystem: 'python' as const,
      package_name: name,
      registry: 'pypi' as const,
      filename: `${name}-0.19.0-py3-none-any.whl`,
      sha256: 'c'.repeat(64),
    })),
  ],
  changeset_ids: ['release-fixture'],
  python_release_family: [...PYTHON_RELEASE_FAMILY],
  changelog: {
    draft_path: '.github/sdk-release/drafts/sdk-2026-07-30.mdx',
    sha256: 'd'.repeat(64),
  },
  openai_generation: {
    provider: 'openai',
    generation_key: 'e'.repeat(64),
    input_sha256: 'f'.repeat(64),
    model: 'gpt-5.5-2026-04-23',
    model_family: 'gpt-5.5',
    model_sha256: DIGEST_A,
    model_policy_sha256: DIGEST_B,
    response_id: 'resp_fixture',
    prompt_version: 'sdk-release-changelog-prompt/v1',
    prompt_sha256: 'c'.repeat(64),
    schema_version: 'sdk-release-changelog/v1',
    schema_sha256: 'd'.repeat(64),
    output_sha256: 'e'.repeat(64),
    rendered_sha256: 'f'.repeat(64),
    usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
    generated_at: '2026-07-30T00:00:00.000Z',
    reset_count: 0,
  },
  toolchains: {
    node: '24.17.0',
    pnpm: '10.13.1',
    python: '3.12.10',
    uv: '0.8.4',
  },
  prepare_run: {
    repository: 'ComposioHQ/composio',
    workflow: 'sdk.release.yml',
    run_id: 123,
    run_attempt: 2,
    commit_sha: SHA_A,
  },
} as const satisfies SealedManifest;
const MANIFEST_ID = computeManifestId(manifest);

function observation(
  registry: 'npm' | 'pypi',
  packageName: string,
  state: 'absent' | 'exact' | 'conflict'
): RegistryObservation {
  const npm = registry === 'npm';
  return {
    schema_version: 'sdk-release-registry-observation/v1',
    manifest_id: MANIFEST_ID,
    package_name: packageName,
    version: npm ? '0.15.0' : '0.19.0',
    registry,
    state,
    expected_dist_tag: npm ? 'latest' : null,
    observed_dist_tag: npm && state !== 'absent' ? 'latest' : null,
    expected_artifacts: npm
      ? [
          {
            filename: 'composio-core-0.15.0.tgz',
            sha256: DIGEST_A,
            integrity: INTEGRITY_A,
          },
        ]
      : [{ filename: 'composio-0.19.0-py3-none-any.whl', sha256: 'c'.repeat(64) }],
    observed_artifacts:
      state === 'absent'
        ? []
        : npm
          ? [
              {
                filename: 'composio-core-0.15.0.tgz',
                sha256: state === 'exact' ? DIGEST_A : DIGEST_B,
                integrity: INTEGRITY_A,
              },
            ]
          : [
              {
                filename: 'composio-0.19.0-py3-none-any.whl',
                sha256: state === 'exact' ? 'c'.repeat(64) : DIGEST_B,
              },
            ],
    observed_at: '2026-07-30T00:10:00.000Z',
  };
}

describe('merged sealed release resolution', () => {
  const mergedPullRequest = {
    number: 4001,
    state: 'MERGED' as const,
    head_ref: 'release/sdk-sdk-2026-07-30',
    base_ref: 'next',
    body: '<!-- sdk-release-preparation:sdk-2026-07-30 -->',
    merge_commit_sha: SHA_B,
  };
  const fetchedPrepareRun = {
    run_id: 123,
    run_attempt: 2,
    repository: 'ComposioHQ/composio',
    workflow: 'sdk.release.yml',
    conclusion: 'success' as const,
  };

  test('binds one exact merged preparation PR, sealed manifest, and prepare run', () => {
    expect(
      resolveMergedRelease({
        release_id: manifest.release_id,
        repository: 'ComposioHQ/composio',
        pull_requests: [mergedPullRequest],
        manifest,
        prepare_run: fetchedPrepareRun,
      })
    ).toMatchObject({
      source_commit: SHA_B,
      prepare_run_id: 123,
      prepare_run_attempt: 2,
    });
  });

  test('rejects open/stale PRs, unsealed manifests, and wrong artifact runs', () => {
    expect(() =>
      resolveMergedRelease({
        release_id: manifest.release_id,
        repository: 'ComposioHQ/composio',
        pull_requests: [{ ...mergedPullRequest, state: 'OPEN' }],
        manifest,
        prepare_run: fetchedPrepareRun,
      })
    ).toThrow('merged');
    expect(() =>
      resolveMergedRelease({
        release_id: manifest.release_id,
        repository: 'ComposioHQ/composio',
        pull_requests: [mergedPullRequest],
        manifest: { ...manifest, phase: 'draft' },
        prepare_run: fetchedPrepareRun,
      })
    ).toThrow('sealed');
    expect(() =>
      resolveMergedRelease({
        release_id: manifest.release_id,
        repository: 'ComposioHQ/composio',
        pull_requests: [mergedPullRequest],
        manifest,
        prepare_run: { ...fetchedPrepareRun, run_id: 999 },
      })
    ).toThrow('prepare run');
  });

  test('rejects a release ID that differs from the sealed manifest', () => {
    expect(() =>
      resolveMergedRelease({
        release_id: 'sdk-2026-07-31',
        repository: 'ComposioHQ/composio',
        pull_requests: [mergedPullRequest],
        manifest,
        prepare_run: fetchedPrepareRun,
      })
    ).toThrow('release mismatch');
  });

  test('rejects a manifest prepared for a different repository', () => {
    expect(() =>
      resolveMergedRelease({
        release_id: manifest.release_id,
        repository: 'ComposioHQ/composio',
        pull_requests: [mergedPullRequest],
        manifest: {
          ...manifest,
          prepare_run: { ...manifest.prepare_run, repository: 'OtherOrg/composio' },
        },
        prepare_run: fetchedPrepareRun,
      })
    ).toThrow('repository is stale');
  });

  test('rejects a manifest prepare-run commit that differs from its base commit', () => {
    expect(() =>
      resolveMergedRelease({
        release_id: manifest.release_id,
        repository: 'ComposioHQ/composio',
        pull_requests: [mergedPullRequest],
        manifest: {
          ...manifest,
          prepare_run: { ...manifest.prepare_run, commit_sha: SHA_B },
        },
        prepare_run: fetchedPrepareRun,
      })
    ).toThrow('source or prepare-run');
  });

  test('rejects a fetched run from a different repository', () => {
    expect(() =>
      resolveMergedRelease({
        release_id: manifest.release_id,
        repository: 'ComposioHQ/composio',
        pull_requests: [mergedPullRequest],
        manifest,
        prepare_run: { ...fetchedPrepareRun, repository: 'OtherOrg/composio' },
      })
    ).toThrow('sealed prepare run');
  });

  test('rejects a fetched run from a different workflow', () => {
    expect(() =>
      resolveMergedRelease({
        release_id: manifest.release_id,
        repository: 'ComposioHQ/composio',
        pull_requests: [mergedPullRequest],
        manifest,
        prepare_run: { ...fetchedPrepareRun, workflow: 'other.release.yml' },
      })
    ).toThrow('sealed prepare run');
  });

  test('rejects a fetched run with a different attempt', () => {
    expect(() =>
      resolveMergedRelease({
        release_id: manifest.release_id,
        repository: 'ComposioHQ/composio',
        pull_requests: [mergedPullRequest],
        manifest,
        prepare_run: { ...fetchedPrepareRun, run_attempt: 3 },
      })
    ).toThrow('sealed prepare run');
  });

  test('rejects downloaded primary bytes that drift from the sealed manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'sdk-publish-artifact-drift-'));
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, manifest.artifacts[0].filename), 'drifted tarball');
    expect(() => verifySealedArtifactDirectory([manifest.artifacts[0]], root)).toThrow(
      'sealed digest mismatch'
    );
  });
});

describe('npm absent-only dependency-ordered publication', () => {
  const workspace = [
    { name: '@composio/core', dependencies: [] },
    { name: '@composio/openai', dependencies: ['@composio/core'] },
  ];

  test('publishes only absent tarballs, dependency first, with sealed tags', async () => {
    const plan = planNpmPublication({
      manifest,
      observations: [
        observation('npm', '@composio/core', 'absent'),
        { ...observation('npm', '@composio/core', 'absent'), package_name: '@composio/openai' },
      ],
      workspace_packages: workspace,
      artifact_directory: 'filtered/npm',
    });
    expect(plan.map(item => item.package_name)).toEqual(['@composio/core', '@composio/openai']);
    const calls: string[][] = [];
    await executeNpmPublication(plan, async args => {
      calls.push(args);
    });
    expect(calls).toEqual([
      ['publish', 'filtered/npm/composio-core-0.15.0.tgz', '--tag', 'latest', '--access', 'public'],
      [
        'publish',
        'filtered/npm/composio-openai-0.15.0.tgz',
        '--tag',
        'latest',
        '--access',
        'public',
      ],
    ]);
  });

  test('already exact is empty and any conflict blocks every npm call', () => {
    expect(
      planNpmPublication({
        manifest,
        observations: [
          observation('npm', '@composio/core', 'exact'),
          { ...observation('npm', '@composio/core', 'exact'), package_name: '@composio/openai' },
        ],
        workspace_packages: workspace,
        artifact_directory: 'filtered/npm',
      })
    ).toEqual([]);
    expect(() =>
      planNpmPublication({
        manifest,
        observations: [
          observation('npm', '@composio/core', 'absent'),
          { ...observation('npm', '@composio/core', 'conflict'), package_name: '@composio/openai' },
        ],
        workspace_packages: workspace,
        artifact_directory: 'filtered/npm',
      })
    ).toThrow('conflict');
    expect(() =>
      planNpmPublication({
        manifest,
        observations: [
          { ...observation('npm', '@composio/core', 'exact'), manifest_id: DIGEST_B },
          {
            ...observation('npm', '@composio/core', 'exact'),
            package_name: '@composio/openai',
          },
        ],
        workspace_packages: workspace,
        artifact_directory: 'filtered/npm',
      })
    ).toThrow('sealed manifest');
  });

  test('resumes after a mid-plan failure using current registry truth', async () => {
    const initialPlan = planNpmPublication({
      manifest,
      observations: [
        observation('npm', '@composio/core', 'absent'),
        { ...observation('npm', '@composio/core', 'absent'), package_name: '@composio/openai' },
      ],
      workspace_packages: workspace,
      artifact_directory: 'filtered/npm',
    });
    const initialCalls: string[][] = [];

    await expect(
      executeNpmPublication(initialPlan, async args => {
        initialCalls.push(args);
        if (args[1]?.includes('composio-openai')) {
          throw new Error('simulated second-package publish failure');
        }
      })
    ).rejects.toThrow('second-package publish failure');
    expect(initialCalls.map(args => args[1])).toEqual([
      'filtered/npm/composio-core-0.15.0.tgz',
      'filtered/npm/composio-openai-0.15.0.tgz',
    ]);

    const resumePlan = planNpmPublication({
      manifest,
      observations: [
        observation('npm', '@composio/core', 'exact'),
        { ...observation('npm', '@composio/core', 'absent'), package_name: '@composio/openai' },
      ],
      workspace_packages: workspace,
      artifact_directory: 'filtered/npm',
    });
    const resumeCalls: string[][] = [];

    await executeNpmPublication(resumePlan, async args => {
      resumeCalls.push(args);
    });
    expect(resumeCalls).toEqual([
      [
        'publish',
        'filtered/npm/composio-openai-0.15.0.tgz',
        '--tag',
        'latest',
        '--access',
        'public',
      ],
    ]);
  });
});

describe('partial recovery, durable receipts, and verified tags', () => {
  test('builds production attempt transitions through the typed state policy', () => {
    const input = {
      release_id: manifest.release_id,
      manifest_id: computeManifestId(manifest),
      attempt: 1,
      operation: 'publish' as const,
      workflow_run_id: 123,
      workflow_run_attempt: 1,
      started_at: '2026-07-30T10:00:00Z',
      completed_at: '2026-07-30T10:01:00Z',
      from: 'publishing' as const,
      state: 'partial' as const,
      observations: [observation('npm', '@composio/core', 'absent')],
    };
    const receipt = buildAttemptReceipt(input);
    expect(receipt.transition).toMatchObject({
      from: 'publishing',
      to: 'partial',
      occurred_at: '2026-07-30T10:01:00Z',
    });
    expect(() =>
      buildAttemptReceipt({
        ...input,
        from: 'preflight_reconciling',
        state: 'verified',
      })
    ).toThrow('Illegal SDK release transition');
  });

  test('never reports generic success after partial/cancelled/conflicting attempts', () => {
    expect(
      planAttemptOutcome({
        observations: [
          observation('npm', '@composio/core', 'exact'),
          observation('pypi', 'composio', 'absent'),
        ],
        cancelled_after_possible_write: false,
      })
    ).toBe('partial');
    expect(
      planAttemptOutcome({
        observations: [
          observation('npm', '@composio/core', 'exact'),
          observation('pypi', 'composio', 'exact'),
        ],
        cancelled_after_possible_write: true,
      })
    ).toBe('partial');
    expect(
      planAttemptOutcome({
        observations: [observation('npm', '@composio/core', 'conflict')],
        cancelled_after_possible_write: false,
      })
    ).toBe('conflict');
    expect(
      planAttemptOutcome({
        observations: [
          observation('npm', '@composio/core', 'exact'),
          observation('pypi', 'composio', 'exact'),
        ],
        cancelled_after_possible_write: false,
      })
    ).toBe('verified');
  });

  test('renders immutable attempt and machine-owned index comments', () => {
    const receipt = renderAttemptReceipt({
      schema_version: 'sdk-release-attempt-receipt/v1',
      release_id: manifest.release_id,
      manifest_id: MANIFEST_ID,
      attempt: 2,
      operation: 'resume',
      workflow_run_id: 456,
      workflow_run_attempt: 1,
      started_at: '2026-07-30T00:00:00.000Z',
      completed_at: '2026-07-30T00:20:00.000Z',
      transition: {
        schema_version: 'sdk-release-state-transition/v1',
        release_id: manifest.release_id,
        from: 'partial',
        to: 'verified',
      },
      observations: [
        observation('npm', '@composio/core', 'exact'),
        observation('pypi', 'composio', 'exact'),
      ],
      outcome: 'verified',
    });
    expect(receipt).toContain('<!-- sdk-release-attempt:sdk-2026-07-30:2 -->');
    expect(receipt).toContain(MANIFEST_ID);
    expect(receipt).toContain('verified');
    const index = renderReceiptIndex({
      release_id: manifest.release_id,
      manifest_id: MANIFEST_ID,
      source_commit: SHA_B,
      attempts: [
        { attempt: 1, outcome: 'partial', workflow_run_id: 123 },
        { attempt: 2, outcome: 'verified', workflow_run_id: 456 },
      ],
    });
    expect(index).toContain('<!-- sdk-release-index:');
    expect(index).toContain('Attempt 1');
    expect(index).toContain('Attempt 2');
    const builtIndex = buildReceiptIndex({
      comments: [{ body: receipt.replace(':2 -->', ':1 -->').replace('verified', 'partial') }],
      current: {
        schema_version: 'sdk-release-attempt-receipt/v1',
        release_id: manifest.release_id,
        manifest_id: MANIFEST_ID,
        attempt: 2,
        operation: 'resume',
        workflow_run_id: 456,
        workflow_run_attempt: 1,
        started_at: '2026-07-30T00:00:00.000Z',
        completed_at: '2026-07-30T00:20:00.000Z',
        transition: {
          schema_version: 'sdk-release-state-transition/v1',
          release_id: manifest.release_id,
          from: 'partial',
          to: 'verified',
        },
        observations: [
          observation('npm', '@composio/core', 'exact'),
          observation('pypi', 'composio', 'exact'),
        ],
        outcome: 'verified',
      },
      source_commit: SHA_B,
    });
    expect(builtIndex).toContain('Attempt 1: **partial**');
    expect(builtIndex).toContain('Attempt 2: **verified**');
  });

  test('creates exact annotated tags only after verification and reuses exact retries', () => {
    const tags = planReleaseTags({
      manifest,
      manifest_id: MANIFEST_ID,
      source_commit: SHA_B,
      verified: true,
      existing_tags: [],
    });
    expect(tags.map(tag => tag.name)).toEqual([
      '@composio/core@0.15.0',
      '@composio/openai@0.15.0',
      'py@0.19.0',
    ]);
    expect(tags.every(tag => tag.message.includes(MANIFEST_ID))).toBe(true);
    const commands: string[][] = [];
    const applied = applyReleaseTags({
      manifest,
      manifest_id: MANIFEST_ID,
      source_commit: SHA_B,
      run: (_command, args) => {
        commands.push(args);
        if (args[0] === 'rev-list') throw new Error('missing tag');
        return '';
      },
    });
    expect(applied).toEqual(tags);
    expect(commands.at(-1)).toEqual([
      'push',
      '--atomic',
      'origin',
      'refs/tags/@composio/core@0.15.0',
      'refs/tags/@composio/openai@0.15.0',
      'refs/tags/py@0.19.0',
    ]);
    expect(
      planReleaseTags({
        manifest,
        manifest_id: MANIFEST_ID,
        source_commit: SHA_B,
        verified: true,
        existing_tags: tags.map(tag => ({
          name: tag.name,
          target: tag.target,
          message: tag.message,
        })),
      })
    ).toEqual([]);
    expect(() =>
      planReleaseTags({
        manifest,
        manifest_id: MANIFEST_ID,
        source_commit: SHA_B,
        verified: false,
        existing_tags: [],
      })
    ).toThrow('verified');
    expect(() =>
      planReleaseTags({
        manifest,
        manifest_id: DIGEST_A,
        source_commit: SHA_B,
        verified: true,
        existing_tags: [],
      })
    ).toThrow('exact sealed manifest');
  });
});
