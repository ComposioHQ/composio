import { describe, expect, test } from 'bun:test';
import type { Channel } from '../scripts/sdk-release/channel';
import type { Language } from '../scripts/sdk-release/lanes';
import {
  loadOriginalDistributions,
  reconcileRegistry as reconcileRegistryEffect,
  waitForRegistry,
  type Distribution,
} from '../scripts/sdk-release/registry';
import { docsPinSpecs } from '../scripts/sdk-release/report';
import { sha256Hex } from '../scripts/sdk-release/runtime';
import { batch, head } from './sdk-release-controller-fixture';
import { runRelease, type Fetch } from './sdk-release-harness';

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
const reconcileRegistry = (files: Distribution[], fetch: Fetch, channel?: Channel) =>
  runRelease(reconcileRegistryEffect(files, channel), fetch);

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
              dist: { tarball: `https://registry.npmjs.org/files/${tarball.file}` },
            })
          : json({}, 404);
      throw new Error(`Unexpected registry fetch ${url}`);
    }) satisfies Fetch,
  };
}

describe('registry reconciliation', () => {
  test('a first run finds every candidate file missing', async () => {
    const result = await reconcileRegistry([tarball, wheel, sdist], registry([]).fetcher);
    expect(result.existing).toEqual([]);
    expect(result.missing.map(file => file.file)).toEqual([tarball.file, wheel.file, sdist.file]);
  });
  test('identical published files are accepted and only the missing sdist is left to upload', async () => {
    const fake = registry([wheel]);
    const result = await reconcileRegistry([wheel, sdist], fake.fetcher);
    expect(result.existing.map(file => file.file)).toEqual([wheel.file]);
    expect(result.missing.map(file => file.file)).toEqual([sdist.file]);
    expect(result.missing[0].bytes).toEqual(sdist.bytes);
    expect(fake.reads).toContain(`https://files.pythonhosted.org/${wheel.file}`);
  });
  test('a re-run after npm succeeded and PyPI failed leaves only the PyPI files to upload', async () => {
    const result = await reconcileRegistry([tarball, wheel, sdist], registry([tarball]).fetcher);
    expect(result.existing.map(file => file.file)).toEqual([tarball.file]);
    expect(result.missing.map(file => file.file)).toEqual([wheel.file, sdist.file]);
    expect(result.tagsToRepair).toEqual([]);
  });
  test('published bytes that differ from the candidate stop with a conflict naming the file', async () => {
    await expect(
      reconcileRegistry([wheel, sdist], registry([wheel], { conflict: true }).fetcher)
    ).rejects.toThrow(`Registry content conflict: composio@1.0.1/${wheel.file}`);
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
        waitForRegistry([wheel, sdist], { attempts: 3, spacing: '0 millis' }),
        fake.fetcher
      )
    ).rejects.toThrow(`after 3 attempts: composio@1.0.1/${sdist.file}`);
    expect(fake.reads.filter(url => url.startsWith('https://pypi.org/'))).toHaveLength(3);
  });
  test('a fresh npm upload is polled until visible, then its channel tag is left to move', async () => {
    const fake = registry([tarball]);
    let lookups = 0;
    const lagging: Fetch = async input => {
      const url = String(input);
      if (url.endsWith('/latest')) return new Response(JSON.stringify({ version: '1.0.0' }));
      if (url.startsWith('https://registry.npmjs.org/') && lookups++ === 0)
        return new Response('{}', { status: 404 });
      return fake.fetcher(input);
    };
    const state = await runRelease(
      waitForRegistry([tarball], { attempts: 3, spacing: '0 millis', channelTags: false }),
      lagging
    );
    expect(state.missing).toEqual([]);
    expect(state.tagsToRepair).toEqual([
      { name: tarball.name, version: tarball.version, tag: 'latest' },
    ]);
  });
  test('a beta moves only npm next forward and never reads or moves latest', async () => {
    const beta = { ...tarball, version: '1.0.1-beta.8', file: 'composio-core-1.0.1-beta.8.tgz' };
    const requested: string[] = [];
    const fetch: Fetch = async input => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith('/next')) return new Response(JSON.stringify({ version: '0.1.36-next.13' }));
      if (url.endsWith('/1.0.1-beta.8')) return new Response('{}', { status: 404 });
      throw new Error(`Unexpected registry request: ${url}`);
    };
    const state = await reconcileRegistry([beta], fetch, 'beta');
    expect(state.missing).toEqual([beta]);
    expect(state.tagsToRepair).toEqual([{ name: beta.name, version: beta.version, tag: 'next' }]);
    expect(requested.some(url => url.endsWith('/latest'))).toBe(false);
  });
  test('a content conflict fails at once instead of waiting for propagation', async () => {
    const fake = registry([wheel], { conflict: true });
    await expect(
      runRelease(
        waitForRegistry([wheel, sdist], { attempts: 3, spacing: '0 millis' }),
        fake.fetcher
      )
    ).rejects.toThrow(`Registry content conflict: composio@1.0.1/${wheel.file}`);
    expect(fake.reads.filter(url => url.startsWith('https://pypi.org/'))).toHaveLength(1);
  });
  test('published bytes of the same length but different content are a conflict', async () => {
    const fake = registry([wheel, sdist]);
    const sameLength: Fetch = async input => {
      const response = await fake.fetcher(input);
      if (!String(input).endsWith(wheel.file)) return response;
      const bytes = new Uint8Array(await response.arrayBuffer());
      bytes[0] ^= 0xff;
      return new Response(bytes);
    };
    await expect(reconcileRegistry([wheel, sdist], sameLength)).rejects.toThrow(
      `Registry content conflict: composio@1.0.1/${wheel.file}`
    );
  });
});

describe('pinned candidate download', () => {
  const pinned = { run: 41, artifactId: 77, digest: `sha256:${'c'.repeat(64)}` };
  const listed = (overrides: { digest?: string; run?: number }) => ({
    id: 77,
    name: 'sdk-candidate-typescript',
    digest: overrides.digest ?? pinned.digest,
    expired: false,
    created_at: '2026-11-03T00:05:00Z',
    expires_at: '2099-12-01T00:00:00Z',
    workflow_run: { id: overrides.run ?? 41, head_sha: head },
  });
  test.each([
    ['a different digest', { digest: `sha256:${'d'.repeat(64)}` }, 'artifact 77 changed'],
    ['another producer run', { run: 42 }, 'Candidate source or producer does not match'],
  ])('a pinned artifact with %s is refused before download', async (_name, overrides, message) => {
    const reads: string[] = [];
    const fetcher: Fetch = async input => {
      const path = new URL(String(input)).pathname;
      reads.push(path);
      if (path === '/repos/ComposioHQ/composio/actions/artifacts/77')
        return new Response(JSON.stringify(listed(overrides)));
      throw new Error(`Unexpected read ${path}`);
    };
    await expect(
      runRelease(
        loadOriginalDistributions('.', batch, head, { typescript: pinned }, 'typescript'),
        fetcher
      )
    ).rejects.toThrow(message);
    expect(reads).toEqual(['/repos/ComposioHQ/composio/actions/artifacts/77']);
  });
  test('a language without a pinned candidate is refused without any request', async () => {
    await expect(
      runRelease(loadOriginalDistributions('.', batch, head, {}, 'typescript'), async () => {
        throw new Error('no request expected');
      })
    ).rejects.toThrow('No approved typescript candidate was pinned');
  });
});

test('docs pins move only used packages forward, so an older retry never downgrades them', () => {
  expect(
    docsPinSpecs(
      { '@composio/core': '0.29.0', '@composio/openai': '0.13.2', '@composio/unused': '1.0.0' },
      { '@composio/core': '^0.28.0', '@composio/openai': '0.13.3', react: '^19' }
    )
  ).toEqual(['@composio/core@0.29.0']);
});
