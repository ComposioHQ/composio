import { describe, expect, test } from 'bun:test';
import { Effect, Schema } from 'effect';
import { Digest } from 'effect/crypto';
import { Base64 } from 'effect/encoding';
import type { Language } from '../scripts/sdk-release/lanes';
import {
  inspectNpmProvenanceSubject,
  reconcileRegistry as reconcileRegistryEffect,
  requireRecoveryWindow as requireRecoveryWindowEffect,
  requireThirtyDayArtifact,
  verifyPublicationPolicy,
  waitForRegistry,
  type Distribution,
  type PublicationSource,
} from '../scripts/sdk-release/registry';
import { sha256Hex } from '../scripts/sdk-release/runtime';
import { ReleaseBatch } from '../scripts/sdk-release/source';
import {
  readPublicationStatus as readPublicationStatusEffect,
  writePublicationStatus as writePublicationStatusEffect,
  type PublicationReport,
} from '../scripts/sdk-release/publication';
import { runRelease, type Fetch } from './sdk-release-harness';

const source: PublicationSource = { sha: 'a'.repeat(40), tag: 'sdk-release/8', runId: 9 };
const distribution = async (file: string, language: Language = 'python'): Promise<Distribution> => {
  const bytes = new TextEncoder().encode(`original ${file}`);
  return {
    language,
    name: language === 'python' ? 'composio' : '@composio/core',
    version: '1.0.1',
    file,
    bytes,
    sha256: await runRelease(sha256Hex(bytes)),
  };
};
const wheel = await distribution('composio-1.0.1-py3-none-any.whl');
const sdist = await distribution('composio-1.0.1.tar.gz');
const tarball = await distribution('composio-core-1.0.1.tgz', 'typescript');
const sha512 = (bytes: Uint8Array) =>
  runRelease(
    Effect.gen(function* () {
      return yield* (yield* Digest.Digest).digestHex(Digest.sha512, bytes);
    })
  );
const tarballSha512 = await sha512(tarball.bytes);
const reconcileRegistry = (files: Distribution[], fetch: Fetch) =>
  runRelease(reconcileRegistryEffect(files, source), fetch);
const requireRecoveryWindow = (run: { created_at: string; run_attempt: number }, now: number) =>
  runRelease(requireRecoveryWindowEffect(run, now));
function provenance(sha = source.sha) {
  const statement = {
    subject: [
      {
        name: 'pkg:npm/%40composio/core@1.0.1',
        digest: { sha512: tarballSha512 },
      },
    ],
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            repository: 'https://github.com/ComposioHQ/composio',
            path: '.github/workflows/sdk.release.yml',
            ref: `refs/tags/${source.tag}`,
          },
        },
        resolvedDependencies: [
          {
            uri: `git+https://github.com/ComposioHQ/composio@refs/tags/${source.tag}`,
            digest: { gitCommit: sha },
          },
        ],
      },
      runDetails: {
        metadata: {
          invocationId: `https://github.com/ComposioHQ/composio/actions/runs/${source.runId}/attempts/1`,
        },
      },
    },
  };
  return {
    attestations: [
      {
        predicateType: 'https://slsa.dev/provenance/v1',
        bundle: {
          dsseEnvelope: { payload: Base64.encode(JSON.stringify(statement)) },
        },
      },
    ],
  };
}
function registry(
  files: Distribution[],
  options: { conflict?: boolean; unknownPython?: boolean; newer?: boolean } = {}
) {
  const reads: string[] = [];
  return {
    reads,
    fetcher: (async (input: string | URL | Request) => {
      const url = String(input);
      reads.push(url);
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status });
      if (
        url.startsWith('https://files.pythonhosted.org/') ||
        url.startsWith('https://registry.npmjs.org/files/')
      ) {
        const file = files.find(file => url.endsWith(file.file));
        return new Response(
          options.conflict ? 'wrong bytes' : file ? new Uint8Array(file.bytes).buffer : undefined,
          { status: file ? 200 : 404 }
        );
      }
      if (url.endsWith('/attestations')) return json(provenance());
      if (url.startsWith('https://pypi.org/'))
        return files.some(file => file.language === 'python')
          ? json({
              urls: [
                ...files
                  .filter(file => file.language === 'python')
                  .map(file => ({
                    filename: file.file,
                    url: `https://files.pythonhosted.org/${file.file}`,
                    digests: { sha256: file.sha256 },
                  })),
                ...(options.unknownPython
                  ? [
                      {
                        filename: 'unreviewed.whl',
                        url: 'https://files.pythonhosted.org/unreviewed.whl',
                        digests: { sha256: 'f'.repeat(64) },
                      },
                    ]
                  : []),
              ],
            })
          : json({}, 404);
      if (url.endsWith('/latest')) return json({ version: options.newer ? '1.0.2' : '1.0.1' });
      if (url.startsWith('https://registry.npmjs.org/'))
        return files.some(file => file.language === 'typescript')
          ? json({
              name: tarball.name,
              version: tarball.version,
              dist: {
                tarball: `https://registry.npmjs.org/files/${tarball.file}`,
                attestations: { url: 'https://registry.npmjs.org/attestations' },
              },
            })
          : json({}, 404);
      throw new Error(`Unexpected registry fetch ${url}`);
    }) satisfies Fetch,
  };
}

describe('direct publication reconciliation', () => {
  test('valid tag-only environments include the native branch_policy protection rule', async () => {
    const fetch: Fetch = async input => {
      const path = new URL(String(input)).pathname;
      const value = path.endsWith('/deployment-branch-policies')
        ? { total_count: 1, branch_policies: [{ name: 'sdk-release/*', type: 'tag' }] }
        : path.endsWith('/rulesets')
          ? [{ id: 1, target: 'tag', enforcement: 'active' }]
          : path.endsWith('/rulesets/1')
            ? {
                conditions: { ref_name: { include: ['refs/tags/sdk-release/*'], exclude: [] } },
                bypass_actors: [
                  { actor_id: 123, actor_type: 'Integration', bypass_mode: 'always' },
                ],
                rules: ['creation', 'update', 'deletion'].map(type => ({ type })),
              }
            : {
                protection_rules: [{ type: 'branch_policy' }],
                deployment_branch_policy: {
                  protected_branches: false,
                  custom_branch_policies: true,
                },
              };
      return new Response(JSON.stringify(value));
    };
    await runRelease(verifyPublicationPolicy(new Set(['python']), 123), fetch);
  });
  test('the final active publisher attempt is allowed, while expired time and attempt 51 stop', async () => {
    const created_at = '2026-11-01T00:00:00Z',
      now = Date.parse('2026-11-03T00:00:00Z');
    await requireRecoveryWindow({ created_at, run_attempt: 50 }, now);
    await expect(requireRecoveryWindow({ created_at, run_attempt: 51 }, now)).rejects.toThrow(
      'exhausted'
    );
    await expect(
      requireRecoveryWindow({ created_at, run_attempt: 1 }, Date.parse('2026-12-01T00:00:00Z'))
    ).rejects.toThrow('exhausted');
  });
  test('native artifact retention is measured from original run creation, including build time', async () => {
    await runRelease(
      requireThirtyDayArtifact(
        {
          id: 1,
          name: 'sdk-candidate-python',
          digest: `sha256:${'a'.repeat(64)}`,
          expired: false,
          created_at: '2026-11-01T00:01:17Z',
          expires_at: '2026-12-01T00:00:00Z',
          workflow_run: { id: 9, head_sha: source.sha },
        },
        { created_at: '2026-11-01T00:00:00Z' }
      )
    );
    await expect(
      runRelease(
        requireThirtyDayArtifact(
          {
            id: 1,
            name: 'sdk-candidate-python',
            digest: `sha256:${'a'.repeat(64)}`,
            expired: false,
            created_at: '2026-11-01T00:01:17Z',
            expires_at: '2026-11-30T23:59:59Z',
            workflow_run: { id: 9, head_sha: source.sha },
          },
          { created_at: '2026-11-01T00:00:00Z' }
        )
      )
    ).rejects.toThrow('required 30 days');
  });
  test('uncertain wheel upload retries only the original missing sdist', async () => {
    const fake = registry([wheel]);
    const result = await reconcileRegistry([wheel, sdist], fake.fetcher);
    expect(result.existing.map(file => file.file)).toEqual([wheel.file]);
    expect(result.missing.map(file => file.file)).toEqual([sdist.file]);
    expect(result.missing[0].bytes).toEqual(sdist.bytes);
    expect(fake.reads).toContain(`https://files.pythonhosted.org/${wheel.file}`);
  });
  test('all existing npm bytes and expected native provenance are checked before accepting a retry', async () => {
    const fake = registry([tarball]);
    const result = await reconcileRegistry([tarball], fake.fetcher);
    expect(result.missing).toHaveLength(0);
    expect(fake.reads).toContain(`https://registry.npmjs.org/files/${tarball.file}`);
    await expect(
      runRelease(inspectNpmProvenanceSubject(provenance('b'.repeat(40)), tarball, source))
    ).rejects.toThrow('source');
  });
  test('a matching metadata hash cannot conceal conflicting downloaded bytes', async () => {
    await expect(
      reconcileRegistry([wheel, sdist], registry([wheel], { conflict: true }).fetcher)
    ).rejects.toThrow('conflict');
    await expect(
      reconcileRegistry([wheel, sdist], registry([wheel], { unknownPython: true }).fetcher)
    ).rejects.toThrow('Unreviewed');
  });
  test('Python-only operation does not require npm outputs or requests', async () => {
    const fake = registry([wheel, sdist]);
    expect((await reconcileRegistry([wheel, sdist], fake.fetcher)).missing).toHaveLength(0);
    expect(fake.reads.some(url => url.includes('npmjs'))).toBe(false);
  });
  test('older retries accept a newer stable tag without requesting a downgrade', async () => {
    const result = await reconcileRegistry([tarball], registry([tarball], { newer: true }).fetcher);
    expect(result.tagsToRepair).toEqual([]);
  });
  test('bounded propagation ends with the exact incomplete file inventory', async () => {
    const fake = registry([wheel]);
    await expect(
      runRelease(
        waitForRegistry([wheel, sdist], source, { attempts: 3, spacing: '0 millis' }),
        fake.fetcher
      )
    ).rejects.toThrow(`after 3 attempts: composio@1.0.1/${sdist.file}`);
    expect(fake.reads.filter(url => url.startsWith('https://pypi.org/'))).toHaveLength(3);
  });
});

async function publicationStatusFixture() {
  const batch = Schema.decodeUnknownSync(ReleaseBatch)({
    schemaVersion: 1,
    id: '8',
    originalRunId: '8',
    requestedBy: ['requester'],
    inputBase: source.sha,
    statusUrl: 'https://github.com/ComposioHQ/composio/issues/7',
    date: '2026-11-03',
    outputs: [],
    plan: {
      schemaVersion: 1,
      inputFingerprint: 'frozen',
      choices: { typescript: 'auto', python: 'auto' },
      releases: [],
      recommended: [],
      changesets: [],
      retainedChangesets: [],
    },
  });
  const comments = new Map<
    number,
    { id: number; body: string; performed_via_github_app: { id: number } }
  >();
  const writes: string[] = [];
  const fetch: Fetch = async (input, init) => {
    const url = new URL(String(input)),
      method = init?.method ?? 'GET';
    const number = Number(url.pathname.match(/\/(\d+)(?:\/comments)?$/)?.[1]);
    if (method === 'GET')
      return new Response(JSON.stringify(comments.has(number) ? [comments.get(number)] : []));
    writes.push(method);
    const body = JSON.parse(String(init?.body)).body;
    comments.set(number, { id: number, body, performed_via_github_app: { id: 123 } });
    return new Response(JSON.stringify({ id: number }));
  };
  const writePublicationStatus = (report: PublicationReport, pullNumber?: number) =>
    runRelease(writePublicationStatusEffect(batch, report, 123, pullNumber), fetch);
  const readPublicationStatus = () =>
    runRelease(readPublicationStatusEffect(batch, 123), fetch).then(saved =>
      saved._tag === 'Some' ? saved.value : undefined
    );
  const original: PublicationReport = {
    runId: 9,
    sourceSha: source.sha,
    registryVerified: true,
    terminal: false,
    docs: 'pending' as const,
    candidates: [],
    inventory: [
      { name: 'composio', version: '1.0.1', file: wheel.file, state: 'matching' as const },
    ],
  };
  return { writePublicationStatus, readPublicationStatus, original, comments, writes };
}

test('canonical App-owned publication status preserves receipts and updates request and PR idempotently', async () => {
  const { writePublicationStatus, readPublicationStatus, original, writes } =
    await publicationStatusFixture();
  await writePublicationStatus(original, 11);
  const saved = await readPublicationStatus();
  expect(saved?.registryVerified).toBe(true);
  await writePublicationStatus({ ...saved!, docs: 'verified' }, 11);
  expect(writes).toEqual(['POST', 'POST', 'PATCH', 'PATCH']);
  expect((await readPublicationStatus())?.inventory).toEqual(original.inventory);
});

for (const maintenance of ['success', 'failure'] as const) {
  for (const maintenanceFirst of [true, false]) {
    test(`docs completion preserves maintenance ${maintenance} with maintenance first: ${maintenanceFirst}`, async () => {
      const { writePublicationStatus, readPublicationStatus, original, comments } =
        await publicationStatusFixture();
      await writePublicationStatus(original, 11);
      const pending = (await readPublicationStatus())!;
      const updates = [
        { ...pending, maintenance },
        { ...pending, docs: 'verified' as const, maintenance: 'pending' as const },
      ];
      if (!maintenanceFirst) updates.reverse();
      await writePublicationStatus(updates[0], 11);
      if (maintenanceFirst) {
        expect(comments.get(7)?.body).toContain('docs pending');
        expect(comments.get(7)?.body).not.toContain('verification failed');
        expect(comments.get(7)?.body).toContain(`Guide/pin maintenance: ${maintenance}.`);
      }
      await writePublicationStatus(updates[1], 11);
      const saved = await readPublicationStatus();
      expect(saved?.docs).toBe('verified');
      expect(saved?.maintenance).toBe(maintenance);
      expect(comments.get(7)?.body).toContain('release documentation verified');
      expect(comments.get(7)?.body).toContain(`Guide/pin maintenance: ${maintenance}.`);
      expect(comments.get(11)?.body).toBe(comments.get(7)?.body);
      await writePublicationStatus(original, 11);
      expect((await readPublicationStatus())?.maintenance).toBe(maintenance);
      expect((await readPublicationStatus())?.docs).toBe('verified');
    });
  }
}
