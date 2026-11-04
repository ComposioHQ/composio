import { afterAll, describe, expect, test } from 'bun:test';
import { Effect, FileSystem, Option } from 'effect';
import {
  normalizeArtifactDigest,
  reuseCandidate,
  verifyArchive,
  verifyCandidateFiles,
} from '../scripts/sdk-release/artifacts';
import { commitPreparedRelease } from '../scripts/sdk-release/batch';
import { run, sha256Hex } from '../scripts/sdk-release/runtime';
import { validateReleaseDiff, type ReleaseFile } from '../scripts/sdk-release/source';
import { readExactCandidateTarballs } from '../ts/scripts/check-provider-compatibility';
import { missingReleaseNotes } from '../ts/scripts/validate-changesets.mjs';
import {
  base,
  batch,
  fakeController,
  head,
  newManifest,
  oldManifest,
  releaseFiles,
} from './sdk-release-controller-fixture';
import { runRelease, temporaryDirectories, writeText } from './sdk-release-harness';

const directories = temporaryDirectories('sdk-release-batch-');
afterAll(() => directories.cleanup());
const readBytes = (file: string) =>
  runRelease(
    Effect.gen(function* () {
      return yield* (yield* FileSystem.FileSystem).readFile(file);
    })
  );
const validate = (
  files: ReadonlyArray<ReleaseFile>,
  plan: Parameters<typeof validateReleaseDiff>[1],
  outputs: ReadonlyArray<string>
) => runRelease(validateReleaseDiff(files, plan, outputs));

describe('release-only diff validation', () => {
  test('source edits and lock dependency changes fail release-only validation', async () => {
    const plan = { releases: [], changesets: [], retainedChangesets: [] };
    await expect(
      validate([{ path: 'ts/packages/core/src/index.ts', before: 'x', after: 'y' }], plan, [])
    ).rejects.toThrow('Not a planned release output');
    await expect(
      validate([{ path: 'pnpm-lock.yaml', before: 'dep: 1', after: 'dep: 2' }], plan, [])
    ).rejects.toThrow('Release changes dependency resolution');
    await validate(
      [{ path: 'docs/content/changelog/release.mdx', before: 'x', after: 'edited narrative' }],
      plan,
      ['docs/content/changelog/release.mdx']
    );
  });
});

const files = [{ name: 'package.tgz', sha256: 'a'.repeat(64), size: 4 }];
const artifact = {
  id: 42,
  name: 'sdk-candidate-typescript',
  digest: `sha256:${'b'.repeat(64)}`,
  expired: false,
  expires_at: '2026-12-01T00:00:00Z',
  workflow_run: { id: 8, head_sha: head },
  created_at: '2026-11-01T00:00:00Z',
};
describe('immutable candidates', () => {
  test('native upload and REST digests normalize without accepting malformed hashes', async () => {
    const raw = 'a'.repeat(64);
    expect(await runRelease(normalizeArtifactDigest(raw))).toBe(`sha256:${raw}`);
    expect(await runRelease(normalizeArtifactDigest(`sha256:${raw}`))).toBe(`sha256:${raw}`);
    await expect(runRelease(normalizeArtifactDigest(`sha256:${raw.slice(1)}`))).rejects.toThrow();
    await expect(runRelease(normalizeArtifactDigest(`md5:${raw}`))).rejects.toThrow();
  });
  test('reuses IDs only from the original source and producer', async () => {
    const reused = await runRelease(
      reuseCandidate([artifact], artifact.name, 8, head, Date.parse('2026-11-03'))
    );
    expect(Option.getOrUndefined(reused)?.id).toBe(42);
    await expect(runRelease(reuseCandidate([artifact], artifact.name, 9, head))).rejects.toThrow(
      'Candidate source or producer does not match'
    );
    await expect(runRelease(reuseCandidate([artifact], artifact.name, 8, base))).rejects.toThrow(
      'Candidate source or producer does not match'
    );
    await expect(
      runRelease(reuseCandidate([{ ...artifact, expired: true }], artifact.name, 8, head))
    ).rejects.toThrow('Original candidate unavailable');
  });
  test('archive digest and every file checksum fail closed', async () => {
    await expect(runRelease(verifyArchive(new Uint8Array([1]), artifact.digest))).rejects.toThrow(
      'Actions artifact archive digest mismatch'
    );
    await expect(
      runRelease(
        verifyCandidateFiles(new Map([['package.tgz', new Uint8Array([1, 2, 3, 4])]]), files)
      )
    ).rejects.toThrow('Candidate checksum mismatch: package.tgz');
  });
});

describe('release PR commit', () => {
  test('partial preparation retry reconciles an existing source branch without creating another commit', async () => {
    const { fetcher, writes } = await fakeController({ existingBranch: true });
    await runRelease(commitPreparedRelease({ batch, files: releaseFiles }, batch), fetcher);
    expect(writes.map(write => write.path)).toEqual(['/pulls']);
  });
  test('major targets allow normal Changesets peer-range updates without changing unrelated fields', async () => {
    const plan = {
      ...batch.plan,
      releases: [
        { ...batch.plan.releases[0], newVersion: '2.0.0', type: 'major' as const },
        {
          ...batch.plan.releases[0],
          name: '@composio/provider',
          oldVersion: '0.1.0',
          newVersion: '0.1.1',
        },
      ],
    };
    const provider = {
      name: '@composio/provider',
      version: '0.1.0',
      peerDependencies: { '@composio/core': '>=1.0.0 <2.0.0 || >=2.0.0-beta.0 <2.0.0' },
    };
    await validate(
      [
        {
          path: 'ts/packages/core/package.json',
          before: oldManifest,
          after: newManifest.replace('1.0.1', '2.0.0'),
        },
        {
          path: 'ts/packages/providers/provider/package.json',
          before: JSON.stringify(provider),
          after: JSON.stringify({
            ...provider,
            version: '0.1.1',
            peerDependencies: { '@composio/core': '>=2.0.0' },
          }),
        },
      ],
      plan,
      []
    );
  });
  test('coincident client versions and Python dependency literals cannot masquerade as SDK metadata', async () => {
    await expect(
      validate(
        [
          {
            path: 'ts/packages/core/package.json',
            before: oldManifest,
            after: newManifest.replace('"client":"1.0.0"', '"client":"1.0.1"'),
          },
        ],
        batch.plan,
        []
      )
    ).rejects.toThrow('Unplanned dependency');
  });
});

describe('SDK fragment policy', () => {
  const packages = [{ name: '@composio/core', directory: 'ts/packages/core', private: false }];
  test('requires both language entries for changed public source', () => {
    expect(
      missingReleaseNotes(
        ['ts/packages/core/src/index.ts', 'python/composio/core/tools.py'],
        [],
        packages
      )
    ).toEqual(['@composio/core', '@composio/python-sdk']);
    expect(
      missingReleaseNotes(
        ['python/composio/core/tools.py', '.changeset/python-fix.md'],
        [{ id: 'python-fix', releases: [{ name: '@composio/python-sdk', type: 'patch' }] }],
        packages
      )
    ).toEqual([]);
  });
  test('preexisting pending notes cannot cover new public behavior in another PR', () => {
    expect(
      missingReleaseNotes(
        ['python/composio/core/tools.py'],
        [{ id: 'older-note', releases: [{ name: '@composio/python-sdk', type: 'patch' }] }],
        packages
      )
    ).toEqual(['@composio/python-sdk']);
    expect(
      missingReleaseNotes(
        ['ts/packages/core/package.json'],
        [],
        packages,
        '<!-- sdk-release-note-exempt: This release PR applies previously reviewed SDK changes and only updates release metadata and generated documentation. -->'
      )
    ).toEqual([]);
  });
  test('tests, CLI and a meaningful explicit exemption do not require SDK fragments', () => {
    expect(
      missingReleaseNotes(
        [
          'ts/packages/core/test/index.test.ts',
          'python/tests/test_tools.py',
          'ts/packages/cli/src/index.ts',
        ],
        [],
        packages
      )
    ).toEqual([]);
    expect(
      missingReleaseNotes(
        ['python/composio/core/tools.py'],
        [],
        packages,
        '<!-- sdk-release-note-exempt: Internal typing adjustment with no runtime or public signature changes. -->'
      )
    ).toEqual([]);
    expect(
      missingReleaseNotes(
        ['python/composio/core/tools.py'],
        [],
        packages,
        '<!-- sdk-release-note-exempt: none -->'
      )
    ).toEqual(['@composio/python-sdk']);
  });
});

test('exact candidate compatibility keeps the original packed dependency and tarball bytes', async () => {
  const temporary = await directories.create();
  await writeText(
    `${temporary}/package/package.json`,
    JSON.stringify({
      name: '@composio/core',
      version: '1.0.1',
      dependencies: { '@composio/json-schema-to-zod': '0.1.0' },
    })
  );
  const file = `${temporary}/composio-core-1.0.1.tgz`;
  await runRelease(run('tar', ['-czf', file, '-C', temporary, 'package']));
  const checksum = async () => runRelease(sha256Hex(await readBytes(file)));
  const before = await checksum();
  const candidates = await readExactCandidateTarballs(temporary);
  expect(candidates.get('@composio/core')).toBe(file);
  expect(await checksum()).toBe(before);
  expect(await runRelease(run('tar', ['-xOf', file, 'package/package.json']))).toContain(
    '"@composio/json-schema-to-zod":"0.1.0"'
  );
});
