import { describe, expect, test } from 'bun:test';
import {
  assertPreparedBaseCommit,
  compareArtifactBuilds,
  compareShadowPackages,
  generationRecordFromManifest,
  normalizeDispatchRequest,
  planPreparationPatch,
  planPreparationPullRequest,
  preparationBranch,
  preparationMarker,
} from '../.github/scripts/sdk-release/update-preparation-pr';
import { renderPreparationReceipt } from '../.github/scripts/sdk-release/receipt-comment';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

const generationRecord = {
  provider: 'openai' as const,
  generation_key: DIGEST_A,
  input_sha256: DIGEST_B,
  prompt_sha256: 'c'.repeat(64),
  schema_sha256: 'd'.repeat(64),
  model_policy_sha256: 'e'.repeat(64),
  output_sha256: 'f'.repeat(64),
  rendered_sha256: DIGEST_A,
  prompt_version: 'sdk-release-changelog-prompt/v1' as const,
  schema_version: 'sdk-release-changelog/v1' as const,
  model_family: 'gpt-5.5' as const,
  model: 'gpt-5.5-2026-04-23' as const,
  model_sha256: DIGEST_B,
  response_id: 'resp_fixture',
  usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
  generated_at: '2026-07-30T00:00:00.000Z',
  reset_count: 0,
};

describe('SDK release dispatch normalization', () => {
  test('human and API dispatch inputs normalize to the same request', () => {
    const fromUi = normalizeDispatchRequest({
      operation: 'prepare',
      release_id: ' sdk-2026-07-30 ',
      scope: 'python',
      python_version: ' 0.19.0 ',
    });
    const fromApi = normalizeDispatchRequest({
      operation: 'prepare',
      release_id: 'sdk-2026-07-30',
      scope: 'python',
      python_version: '0.19.0',
    });

    expect(fromUi).toEqual(fromApi);
    expect(fromUi.schema_version).toBe('sdk-release-request/v1');
  });

  test('empty optional workflow inputs are omitted before strict parsing', () => {
    expect(
      normalizeDispatchRequest({
        operation: 'prepare',
        release_id: 'sdk-2026-07-30',
        scope: 'typescript',
        python_version: '',
      })
    ).toEqual({
      schema_version: 'sdk-release-request/v1',
      operation: 'prepare',
      release_id: 'sdk-2026-07-30',
      scope: 'typescript',
    });
  });
});

describe('stable preparation branch and PR lineage', () => {
  const releaseId = 'sdk-2026-07-30';

  test('creates or updates exactly one compatible preparation PR', () => {
    expect(preparationBranch(releaseId)).toBe('release/sdk-sdk-2026-07-30');
    expect(preparationMarker(releaseId)).toBe('<!-- sdk-release-preparation:sdk-2026-07-30 -->');

    expect(
      planPreparationPullRequest({
        release_id: releaseId,
        base_ref: 'next',
        expected_remote_head: SHA_A,
        remote_branch_head: null,
        open_pull_requests: [],
      })
    ).toEqual({
      action: 'create',
      branch: 'release/sdk-sdk-2026-07-30',
      marker: preparationMarker(releaseId),
    });

    expect(
      planPreparationPullRequest({
        release_id: releaseId,
        base_ref: 'next',
        expected_remote_head: SHA_A,
        remote_branch_head: SHA_A,
        open_pull_requests: [
          {
            number: 4001,
            head_ref: preparationBranch(releaseId),
            base_ref: 'next',
            body: `Release preparation\n\n${preparationMarker(releaseId)}`,
          },
        ],
      })
    ).toEqual({
      action: 'update',
      branch: preparationBranch(releaseId),
      marker: preparationMarker(releaseId),
      pull_request_number: 4001,
    });
  });

  test('fails closed on non-fast-forward or divergent PR state', () => {
    expect(() =>
      planPreparationPullRequest({
        release_id: releaseId,
        base_ref: 'next',
        expected_remote_head: SHA_A,
        remote_branch_head: SHA_B,
        open_pull_requests: [],
      })
    ).toThrow('non-fast-forward');

    expect(() =>
      planPreparationPullRequest({
        release_id: releaseId,
        base_ref: 'next',
        expected_remote_head: SHA_A,
        remote_branch_head: SHA_A,
        open_pull_requests: [
          {
            number: 4001,
            head_ref: 'release/unexpected',
            base_ref: 'next',
            body: preparationMarker(releaseId),
          },
        ],
      })
    ).toThrow('divergent');
  });

  test('rejects duplicate dispatches that would create a second open release lineage', () => {
    expect(() =>
      planPreparationPullRequest({
        release_id: releaseId,
        base_ref: 'next',
        expected_remote_head: SHA_A,
        remote_branch_head: null,
        open_pull_requests: [
          {
            number: 3999,
            head_ref: 'release/sdk-sdk-2026-07-29',
            base_ref: 'next',
            body: preparationMarker('sdk-2026-07-29'),
          },
        ],
      })
    ).toThrow('still open');
  });

  test('binds the manifest to the captured primary checkout and reconstructs retry state', () => {
    const { provider: _provider, ...expectedRecord } = generationRecord;
    expect(assertPreparedBaseCommit(SHA_A, SHA_A)).toBe(SHA_A);
    expect(() => assertPreparedBaseCommit(SHA_A, SHA_B)).toThrow('base commit mismatch');
    expect(generationRecordFromManifest(generationRecord)).toEqual(expectedRecord);
  });

  test('applies a new patch, skips the exact existing patch, and rejects ambiguous state', () => {
    expect(planPreparationPatch({ applies_cleanly: true, reverse_applies_cleanly: false })).toBe(
      'apply'
    );
    expect(planPreparationPatch({ applies_cleanly: false, reverse_applies_cleanly: true })).toBe(
      'already_applied'
    );
    expect(() =>
      planPreparationPatch({ applies_cleanly: false, reverse_applies_cleanly: false })
    ).toThrow('divergent');
  });
});

describe('observe-only preparation evidence', () => {
  const primary = [
    {
      ecosystem: 'typescript' as const,
      package_name: '@composio/core',
      registry: 'npm' as const,
      filename: 'composio-core-0.15.0.tgz',
      sha256: DIGEST_A,
    },
    {
      ecosystem: 'python' as const,
      package_name: 'composio',
      registry: 'pypi' as const,
      filename: 'composio-0.19.0-py3-none-any.whl',
      sha256: DIGEST_B,
    },
  ];

  test('accepts reproducible second builds regardless of discovery order', () => {
    expect(compareArtifactBuilds(primary, [...primary].reverse())).toEqual(primary);
  });

  test('fails when the verification-only artifact set differs', () => {
    expect(() =>
      compareArtifactBuilds(primary, [primary[0], { ...primary[1], sha256: 'c'.repeat(64) }])
    ).toThrow('digest mismatch');
    expect(() => compareArtifactBuilds(primary, [primary[0]])).toThrow('artifact set mismatch');
    expect(() => compareArtifactBuilds([primary[0], primary[0]], [primary[0], primary[0]])).toThrow(
      'duplicate filename'
    );
  });

  test('compares legacy writer outcomes without registry writes', () => {
    const packages = [
      {
        ecosystem: 'typescript' as const,
        name: '@composio/core',
        version: '0.15.0',
        registry: 'npm' as const,
        dist_tag: 'latest',
      },
    ];

    expect(compareShadowPackages(packages, packages)).toEqual({
      status: 'exact',
      coordinator: ['typescript:@composio/core@0.15.0'],
      legacy: ['typescript:@composio/core@0.15.0'],
    });
    expect(compareShadowPackages(packages, [])).toMatchObject({ status: 'mismatch' });
  });

  test('renders selected/skipped ecosystems and all preparation identities', () => {
    const comment = renderPreparationReceipt({
      release_id: 'sdk-2026-07-30',
      manifest_id: DIGEST_A,
      selection: { typescript: 'selected', python: 'skipped' },
      packages: [
        {
          ecosystem: 'typescript',
          name: '@composio/core',
          version: '0.15.0',
          registry: 'npm',
          dist_tag: 'latest',
        },
      ],
      artifacts: [primary[0]],
      changelog: {
        draft_path: '.github/sdk-release/drafts/sdk-2026-07-30.mdx',
        sha256: DIGEST_B,
      },
      generation: {
        action: 'generated',
        model: 'gpt-5.5-2026-04-23',
        response_id: 'resp_fixture',
        generation_key: DIGEST_A,
        reset_count: 1,
        review_invalidated: true,
      },
      prepare_run: {
        repository: 'ComposioHQ/composio',
        run_id: 123,
        run_attempt: 2,
      },
      legacy_comparison: {
        status: 'exact',
        coordinator: ['typescript:@composio/core@0.15.0'],
        legacy: ['typescript:@composio/core@0.15.0'],
      },
    });

    expect(comment).toContain('<!-- sdk-release-receipt:sdk-2026-07-30 -->');
    expect(comment).toContain('TypeScript | selected');
    expect(comment).toContain('Python | skipped');
    expect(comment).toContain('@composio/core');
    expect(comment).toContain(DIGEST_A);
    expect(comment).toContain('gpt-5.5-2026-04-23');
    expect(comment).toContain('resp_fixture');
    expect(comment).toContain('Retry action: `generated`');
    expect(comment).toContain('Review invalidated: yes');
    expect(comment).toContain('Run 123, attempt 2');
    expect(comment).toContain('Legacy writer comparison: exact');
    expect(comment).not.toContain('docs/content/changelog/');
  });
});
