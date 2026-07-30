import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import type {
  AttemptReceipt,
  RegistryObservation,
  SealedManifest,
} from '../.github/scripts/sdk-release/contracts';
import {
  planChangelogFinalization,
  planDownstreamEmission,
  validatePublicChangelog,
} from '../.github/scripts/sdk-release/finalize-changelog';
import { computeManifestId } from '../.github/scripts/sdk-release/manifest';

const SHA = 'a'.repeat(40);
const ARTIFACT_DIGEST = 'b'.repeat(64);
const INTEGRITY =
  'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
const draft = `---
title: "SDK Release sdk-2026-07-30"
date: "2026-07-30"
---

This release improves deterministic SDK coordination.

### SDK Versions

| SDK | Released version |
| --- | --- |
| TypeScript \`@composio/core\` | \`0.15.0\` |
| TypeScript \`@composio/openai\` | \`0.15.1\` |

### Improvements

- SDK publication now uses sealed release evidence.
`;
const draftDigest = createHash('sha256').update(draft).digest('hex');
const manifest = {
  schema_version: 'sdk-release-manifest/v1',
  phase: 'sealed',
  release_id: 'sdk-2026-07-30',
  base_commit: SHA,
  selection: { typescript: 'selected', python: 'skipped' },
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
      version: '0.15.1',
      registry: 'npm',
      dist_tag: 'latest',
    },
  ],
  artifacts: [
    {
      ecosystem: 'typescript',
      package_name: '@composio/core',
      registry: 'npm',
      filename: 'composio-core-0.15.0.tgz',
      sha256: ARTIFACT_DIGEST,
      integrity: INTEGRITY,
    },
    {
      ecosystem: 'typescript',
      package_name: '@composio/openai',
      registry: 'npm',
      filename: 'composio-openai-0.15.1.tgz',
      sha256: 'c'.repeat(64),
      integrity: INTEGRITY,
    },
  ],
  changeset_ids: ['fixture'],
  python_release_family: [],
  changelog: {
    draft_path: '.github/sdk-release/drafts/sdk-2026-07-30.mdx',
    sha256: draftDigest,
  },
  openai_generation: {
    provider: 'openai',
    generation_key: 'd'.repeat(64),
    input_sha256: 'e'.repeat(64),
    model: 'gpt-5.5-2026-04-23',
    model_family: 'gpt-5.5',
    model_sha256: 'f'.repeat(64),
    model_policy_sha256: '1'.repeat(64),
    response_id: 'resp_fixture',
    prompt_version: 'sdk-release-changelog-prompt/v1',
    prompt_sha256: '2'.repeat(64),
    schema_version: 'sdk-release-changelog/v1',
    schema_sha256: '3'.repeat(64),
    output_sha256: '4'.repeat(64),
    rendered_sha256: draftDigest,
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    generated_at: '2026-07-30T00:00:00.000Z',
    reset_count: 0,
  },
  toolchains: { node: '24.17.0', pnpm: '10.13.1', python: null, uv: null },
  prepare_run: {
    repository: 'ComposioHQ/composio',
    workflow: 'sdk.release.yml',
    run_id: 123,
    run_attempt: 1,
    commit_sha: SHA,
  },
} as const satisfies SealedManifest;
const manifestId = computeManifestId(manifest);

function observation(packageName: '@composio/core' | '@composio/openai'): RegistryObservation {
  const core = packageName === '@composio/core';
  const artifact = {
    filename: core ? 'composio-core-0.15.0.tgz' : 'composio-openai-0.15.1.tgz',
    sha256: core ? ARTIFACT_DIGEST : 'c'.repeat(64),
    integrity: INTEGRITY,
  };
  return {
    schema_version: 'sdk-release-registry-observation/v1',
    manifest_id: manifestId,
    package_name: packageName,
    version: core ? '0.15.0' : '0.15.1',
    registry: 'npm',
    state: 'exact',
    expected_dist_tag: 'latest',
    observed_dist_tag: 'latest',
    expected_artifacts: [artifact],
    observed_artifacts: [artifact],
    observed_at: '2026-07-30T00:10:00.000Z',
  };
}

const receipt = {
  schema_version: 'sdk-release-attempt-receipt/v1',
  release_id: manifest.release_id,
  manifest_id: manifestId,
  attempt: 1,
  operation: 'publish',
  workflow_run_id: 456,
  workflow_run_attempt: 1,
  started_at: '2026-07-30T00:00:00.000Z',
  completed_at: '2026-07-30T00:10:00.000Z',
  transition: {
    schema_version: 'sdk-release-state-transition/v1',
    release_id: manifest.release_id,
    from: 'publishing',
    to: 'verified',
  },
  observations: [observation('@composio/core'), observation('@composio/openai')],
  outcome: 'verified',
} as const satisfies AttemptReceipt;

const finalizationPullRequest = {
  number: 4010,
  state: 'OPEN' as const,
  head_ref: 'release/sdk-sdk-2026-07-30-changelog',
  base_ref: 'next',
  body: `<!-- sdk-release-finalization:${manifestId} -->`,
  merge_commit_sha: null,
};

describe('verified SDK changelog finalization', () => {
  test('copies exact reviewed bytes and allocates a stable same-day suffix', () => {
    const first = planChangelogFinalization({
      manifest,
      receipt,
      draft_path: manifest.changelog.draft_path,
      draft_bytes: draft,
      existing_files: [],
      pull_requests: [],
    });
    expect(first).toMatchObject({
      state: 'create_pr',
      final_path: 'docs/content/changelog/07-30-26.mdx',
      branch: 'release/sdk-sdk-2026-07-30-changelog',
    });

    const sameDay = planChangelogFinalization({
      manifest,
      receipt,
      draft_path: manifest.changelog.draft_path,
      draft_bytes: draft,
      existing_files: [{ path: 'docs/content/changelog/07-30-26.mdx', sha256: '9'.repeat(64) }],
      pull_requests: [finalizationPullRequest],
    });
    expect(sameDay).toMatchObject({
      state: 'update_pr',
      final_path: 'docs/content/changelog/07-30-26-sdk-2026-07-30.mdx',
      pull_request: 4010,
    });
  });

  test('is idempotent for exact merged bytes and rejects digest or path conflicts', () => {
    expect(
      planChangelogFinalization({
        manifest,
        receipt,
        draft_path: manifest.changelog.draft_path,
        draft_bytes: draft,
        existing_files: [{ path: 'docs/content/changelog/07-30-26.mdx', sha256: draftDigest }],
        pull_requests: [{ ...finalizationPullRequest, state: 'MERGED', merge_commit_sha: SHA }],
      })
    ).toMatchObject({ state: 'already_finalized', pull_request: 4010 });

    expect(() => validatePublicChangelog(manifest, receipt, `${draft}\nchanged`)).toThrow(
      'sealed digest'
    );
    expect(() =>
      planChangelogFinalization({
        manifest,
        receipt,
        draft_path: manifest.changelog.draft_path,
        draft_bytes: draft,
        existing_files: [
          { path: 'docs/content/changelog/07-30-26.mdx', sha256: '8'.repeat(64) },
          {
            path: 'docs/content/changelog/07-30-26-sdk-2026-07-30.mdx',
            sha256: '9'.repeat(64),
          },
        ],
        pull_requests: [],
      })
    ).toThrow('Conflicting public changelog');
  });

  test('requires a complete verified receipt and current SDK version table', () => {
    expect(() =>
      validatePublicChangelog(manifest, { ...receipt, outcome: 'partial' }, draft)
    ).toThrow();
    expect(() =>
      validatePublicChangelog(
        manifest,
        { ...receipt, observations: [observation('@composio/core')] },
        draft
      )
    ).toThrow('complete sealed package set');
    expect(() =>
      validatePublicChangelog(
        manifest,
        {
          ...receipt,
          observations: [
            {
              ...observation('@composio/core'),
              expected_artifacts: [
                {
                  ...observation('@composio/core').expected_artifacts[0]!,
                  sha256: '7'.repeat(64),
                },
              ],
              observed_artifacts: [
                {
                  ...observation('@composio/core').observed_artifacts[0]!,
                  sha256: '7'.repeat(64),
                },
              ],
            },
            observation('@composio/openai'),
          ],
        },
        draft
      )
    ).toThrow('artifact set drifted');
    const staleTable = draft.replace('`0.15.1`', '`0.15.0`');
    const staleManifest = {
      ...manifest,
      changelog: {
        ...manifest.changelog,
        sha256: createHash('sha256').update(staleTable).digest('hex'),
      },
      openai_generation: {
        ...manifest.openai_generation,
        rendered_sha256: createHash('sha256').update(staleTable).digest('hex'),
      },
    };
    expect(() =>
      validatePublicChangelog(
        staleManifest,
        {
          ...receipt,
          manifest_id: computeManifestId(staleManifest),
          observations: receipt.observations.map(item => ({
            ...item,
            manifest_id: computeManifestId(staleManifest),
          })),
        },
        staleTable
      )
    ).toThrow('version table');
  });
});

describe('verified public merge downstream gates', () => {
  const merged = { ...finalizationPullRequest, state: 'MERGED' as const, merge_commit_sha: SHA };

  test('draft merges and unrelated public changes are neither public nor notified', () => {
    expect(() =>
      planDownstreamEmission({
        pull_requests: [
          {
            ...merged,
            head_ref: 'release/sdk-sdk-2026-07-30',
            body: '<!-- sdk-release-preparation:sdk-2026-07-30 -->',
          },
        ],
        changed_files: [manifest.changelog.draft_path],
        existing_markers: [],
        channel: 'notification',
      })
    ).toThrow();
  });

  test('emits each docs/notification channel once per manifest ID', () => {
    const first = planDownstreamEmission({
      pull_requests: [merged],
      changed_files: ['docs/content/changelog/07-30-26.mdx'],
      existing_markers: [],
      channel: 'notification',
    });
    expect(first).toMatchObject({ emit: true, manifest_id: manifestId, pull_request: 4010 });
    expect(
      planDownstreamEmission({
        pull_requests: [merged],
        changed_files: ['docs/content/changelog/07-30-26.mdx'],
        existing_markers: [first.marker],
        channel: 'notification',
      }).emit
    ).toBe(false);
    expect(
      planDownstreamEmission({
        pull_requests: [merged],
        changed_files: ['docs/content/changelog/07-30-26.mdx'],
        existing_markers: [first.marker],
        channel: 'docs',
      }).emit
    ).toBe(true);
  });
});
