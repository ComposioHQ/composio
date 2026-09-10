import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildCompatibilityPlan,
  discoverProviderCases,
  parseCliOptions,
  repackCoreTarball,
} from '../ts/scripts/check-provider-compatibility';

describe('provider compatibility plan', () => {
  it('covers every provider at the workspace, verified minimum, and beta boundaries', async () => {
    const providers = await discoverProviderCases();
    const plan = buildCompatibilityPlan(providers, '1.0.0-beta.0');
    const providerNames = providers.map(provider => provider.name);
    const current = plan.find(lane => lane.id === 'workspace-current');
    const beta = plan.find(lane => lane.id === 'workspace-major-prerelease');
    const minimum = plan.filter(lane => lane.id.startsWith('verified-minimum-core-'));

    expect(providerNames).toHaveLength(10);
    expect(current?.providerNames).toEqual(providerNames);
    expect(beta?.providerNames).toEqual(providerNames);
    expect(beta?.core).toEqual({ kind: 'workspace-prerelease', version: '1.0.0-beta.0' });
    expect(minimum.flatMap(lane => lane.providerNames).sort()).toEqual([...providerNames].sort());
    expect(minimum).toHaveLength(10);
    expect(
      Object.fromEntries(
        minimum.map(lane => [
          lane.providerNames[0],
          lane.core.kind === 'registry' && lane.core.specifier,
        ])
      )
    ).toEqual({
      '@composio/anthropic': '0.14.0',
      '@composio/claude-agent-sdk': '0.11.0',
      '@composio/cloudflare': '0.14.0',
      '@composio/google': '0.16.0',
      '@composio/langchain': '0.11.0',
      '@composio/llamaindex': '0.11.0',
      '@composio/mastra': '0.18.0',
      '@composio/openai': '0.18.0',
      '@composio/openai-agents': '0.18.0',
      '@composio/vercel': '0.18.0',
    });
    expect(minimum.every(lane => lane.providerNames.length === 1)).toBe(true);
    expect(current?.lifecycleScripts).toBe('run');
    expect(beta?.lifecycleScripts).toBe('skip');
    expect(minimum.every(lane => lane.lifecycleScripts === 'skip')).toBe(true);
    expect(
      Object.fromEntries(
        providers.map(provider => [provider.name, provider.advertisedMinimumCoreVersion])
      )
    ).toEqual({
      '@composio/anthropic': '0.10.0',
      '@composio/claude-agent-sdk': '0.10.0',
      '@composio/cloudflare': '0.10.0',
      '@composio/google': '0.16.0',
      '@composio/langchain': '0.10.0',
      '@composio/llamaindex': '0.10.0',
      '@composio/mastra': '0.10.0',
      '@composio/openai': '0.10.0',
      '@composio/openai-agents': '0.10.0',
      '@composio/vercel': '0.10.0',
    });
  });

  it('selects all lanes by default and accepts focused runs', () => {
    expect([...parseCliOptions([]).lanes]).toEqual(['current', 'minimum', 'beta']);
    expect([...parseCliOptions(['--', '--lane', 'current', '--plan']).lanes]).toEqual(['current']);
    expect(parseCliOptions(['--', '--lane', 'current', '--plan']).planOnly).toBe(true);
    expect(() => parseCliOptions(['--lane', 'future'])).toThrow(
      '--lane must be current, minimum, or beta'
    );
    expect(() => parseCliOptions(['--unknown'])).toThrow('Unknown argument: --unknown');
  });
});

describe('repackCoreTarball', () => {
  async function withPackedManifest<T>(
    manifest: unknown,
    callback: (tarball: string, artifactDirectory: string) => Promise<T>
  ): Promise<T> {
    const root = await mkdtemp(path.join(tmpdir(), 'composio-repack-test-'));
    try {
      await mkdir(path.join(root, 'source/package'), { recursive: true });
      await writeFile(path.join(root, 'source/package/package.json'), JSON.stringify(manifest));
      const tarball = path.join(root, 'core.tgz');
      const packed = spawnSync('tar', [
        '-czf',
        tarball,
        '-C',
        path.join(root, 'source'),
        'package',
      ]);
      if (packed.status !== 0) throw new Error(String(packed.stderr));
      return await callback(tarball, path.join(root, 'artifacts'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  const options = (artifactDirectory: string) => ({
    version: '1.0.0-beta.0',
    jsonSchemaTarball: '/artifacts/composio-json-schema-to-zod-0.1.0.tgz',
    artifactDirectory,
  });

  it('re-versions core and routes its helper dependency through the packed tarball', async () => {
    await withPackedManifest(
      {
        name: '@composio/core',
        version: '0.18.0',
        dependencies: { '@composio/json-schema-to-zod': 'workspace:*', zod: '^3.0.0' },
        peerDependencies: {},
        exports: { '.': './dist/index.mjs' },
      },
      async (tarball, artifactDirectory) => {
        const repacked = await repackCoreTarball(
          tarball,
          '@composio/core',
          options(artifactDirectory)
        );
        expect(path.basename(repacked)).toBe('composio-core-1.0.0-beta.0.tgz');
        const extracted = spawnSync('tar', ['-xzf', repacked, '-O', 'package/package.json'], {
          encoding: 'utf8',
        });
        const manifest = JSON.parse(extracted.stdout);
        expect(manifest.version).toBe('1.0.0-beta.0');
        expect(manifest.dependencies['@composio/json-schema-to-zod']).toBe(
          'file:/artifacts/composio-json-schema-to-zod-0.1.0.tgz'
        );
        expect(manifest.dependencies.zod).toBe('^3.0.0');
        expect(manifest.exports).toEqual({ '.': './dist/index.mjs' });
      }
    );
  });

  it('rejects a packed core manifest that omits the helper dependency', async () => {
    await withPackedManifest(
      { name: '@composio/core', version: '0.18.0', dependencies: { zod: '^3.0.0' } },
      async (tarball, artifactDirectory) => {
        await expect(
          repackCoreTarball(tarball, '@composio/core', options(artifactDirectory))
        ).rejects.toThrow('must declare @composio/json-schema-to-zod as a dependency');
      }
    );
  });

  it('rejects a malformed packed core manifest', async () => {
    await withPackedManifest(
      { name: '@composio/core', dependencies: { '@composio/json-schema-to-zod': '*' } },
      async (tarball, artifactDirectory) => {
        await expect(
          repackCoreTarball(tarball, '@composio/core', options(artifactDirectory))
        ).rejects.toThrow('Invalid JSON in');
      }
    );
  });
});
