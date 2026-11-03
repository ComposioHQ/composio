import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  reconcileRegistry,
  waitForRegistry,
  verifyNpmProvenance,
  requireRecoveryWindow,
  requireThirtyDayArtifact,
  verifyPublicationPolicy,
  type Distribution,
  type PublicationSource,
} from '../scripts/sdk-release/registry';
import { sha256 } from '../scripts/sdk-release/artifacts';
import { GitHubReleaseClient } from '../scripts/sdk-release/github';
import { readPublicationStatus, writePublicationStatus } from '../scripts/sdk-release/publication';

const source: PublicationSource = { sha: 'a'.repeat(40), tag: 'sdk-release/8', runId: 9 };
const distribution = (file: string, language: 'python' | 'typescript' = 'python'): Distribution => {
  const bytes = new TextEncoder().encode(`original ${file}`);
  return {
    language,
    name: language === 'python' ? 'composio' : '@composio/core',
    version: '1.0.1',
    file,
    bytes,
    sha256: sha256(bytes),
  };
};
const wheel = distribution('composio-1.0.1-py3-none-any.whl');
const sdist = distribution('composio-1.0.1.tar.gz');
const tarball = distribution('composio-core-1.0.1.tgz', 'typescript');
function provenance(bytes = tarball.bytes, sha = source.sha) {
  const statement = {
    subject: [
      {
        name: 'pkg:npm/%40composio/core@1.0.1',
        digest: { sha512: createHash('sha512').update(bytes).digest('hex') },
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
          dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') },
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
    fetcher: async (input: string | URL | Request) => {
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
    },
  };
}

describe('direct publication reconciliation', () => {
  test('valid tag-only environments include the native branch_policy protection rule', async () => {
    const github = new GitHubReleaseClient('read-only', async input => {
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
    });
    await verifyPublicationPolicy(github, new Set(['python']), 123);
  });
  test('the final active publisher attempt is allowed, while expired time and attempt 51 stop', () => {
    const created_at = '2026-11-01T00:00:00Z',
      now = Date.parse('2026-11-03T00:00:00Z');
    expect(() => requireRecoveryWindow({ created_at, run_attempt: 50 }, now)).not.toThrow();
    expect(() => requireRecoveryWindow({ created_at, run_attempt: 51 }, now)).toThrow('exhausted');
    expect(() =>
      requireRecoveryWindow({ created_at, run_attempt: 1 }, Date.parse('2026-12-01T00:00:00Z'))
    ).toThrow('exhausted');
  });
  test('native artifact retention is measured from original run creation, including build time', () => {
    expect(() =>
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
    ).not.toThrow();
  });
  test('uncertain wheel upload retries only the original missing sdist', async () => {
    const fake = registry([wheel]);
    const result = await reconcileRegistry([wheel, sdist], source, fake.fetcher);
    expect(result.existing.map(file => file.file)).toEqual([wheel.file]);
    expect(result.missing.map(file => file.file)).toEqual([sdist.file]);
    expect(result.missing[0].bytes).toEqual(sdist.bytes);
    expect(fake.reads).toContain(`https://files.pythonhosted.org/${wheel.file}`);
  });
  test('all existing npm bytes and expected native provenance are checked before accepting a retry', async () => {
    const fake = registry([tarball]);
    const result = await reconcileRegistry([tarball], source, fake.fetcher);
    expect(result.missing).toHaveLength(0);
    expect(fake.reads).toContain(`https://registry.npmjs.org/files/${tarball.file}`);
    expect(() =>
      verifyNpmProvenance(provenance(tarball.bytes, 'b'.repeat(40)), tarball, source)
    ).toThrow('source');
  });
  test('a matching metadata hash cannot conceal conflicting downloaded bytes', async () => {
    await expect(
      reconcileRegistry([wheel, sdist], source, registry([wheel], { conflict: true }).fetcher)
    ).rejects.toThrow('conflict');
    await expect(
      reconcileRegistry([wheel, sdist], source, registry([wheel], { unknownPython: true }).fetcher)
    ).rejects.toThrow('Unreviewed');
  });
  test('Python-only operation does not require npm outputs or requests', async () => {
    const fake = registry([wheel, sdist]);
    expect((await reconcileRegistry([wheel, sdist], source, fake.fetcher)).missing).toHaveLength(0);
    expect(fake.reads.some(url => url.includes('npmjs'))).toBe(false);
  });
  test('older retries accept a newer stable tag without requesting a downgrade', async () => {
    const result = await reconcileRegistry(
      [tarball],
      source,
      registry([tarball], { newer: true }).fetcher
    );
    expect(result.tagsToRepair).toEqual([]);
  });
  test('bounded propagation ends with the exact incomplete file inventory', async () => {
    let pauses = 0;
    await expect(
      waitForRegistry([wheel, sdist], source, registry([wheel]).fetcher, {
        attempts: 3,
        pause: async () => {
          pauses++;
        },
      })
    ).rejects.toThrow(sdist.file);
    expect(pauses).toBe(2);
  });
});

test('canonical App-owned publication status preserves receipts and updates request and PR idempotently', async () => {
  const { releaseBatchSchema } = await import('../scripts/sdk-release/source');
  const batch = releaseBatchSchema.parse({
    schemaVersion: 1,
    id: '8',
    originalRunId: '8',
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
  const github = new GitHubReleaseClient('controller', async (input, init) => {
    const url = new URL(String(input)),
      method = init?.method ?? 'GET';
    const number = Number(url.pathname.match(/\/(\d+)(?:\/comments)?$/)?.[1]);
    if (method === 'GET')
      return new Response(JSON.stringify(comments.has(number) ? [comments.get(number)] : []));
    writes.push(method);
    const body = JSON.parse(String(init?.body)).body;
    comments.set(number, { id: number, body, performed_via_github_app: { id: 123 } });
    return new Response(JSON.stringify({ id: number }));
  });
  const original = {
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
  await writePublicationStatus(github, batch, original, 123, 11);
  const saved = await readPublicationStatus(github, batch, 123);
  expect(saved?.registryVerified).toBe(true);
  await writePublicationStatus(github, batch, { ...saved!, docs: 'verified' }, 123, 11);
  expect(writes).toEqual(['POST', 'POST', 'PATCH', 'PATCH']);
  expect((await readPublicationStatus(github, batch, 123))?.inventory).toEqual(original.inventory);
});
