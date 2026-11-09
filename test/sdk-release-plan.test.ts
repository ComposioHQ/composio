import { afterEach, describe, expect, test } from 'bun:test';
import { pythonVersion } from '../scripts/sdk-release/channel';
import {
  applySdkReleasePlan as applyPlanEffect,
  createSdkReleasePlan as createPlanEffect,
  type SdkReleaseOptions,
  type SdkReleasePlan,
} from '../scripts/sdk-release/plan';
import type { PythonMetadataOptions } from '../scripts/sdk-release/python-metadata';
import { discoverPythonPackages as discoverEffect } from '../scripts/sdk-release/python-metadata';
import {
  exists,
  readText,
  remove,
  resolvePath,
  runRelease,
  symlink,
  temporaryDirectories,
  writeText,
} from './sdk-release-harness';

const roots = temporaryDirectories('composio-sdk-plan-');
const createSdkReleasePlan = (cwd: string, options?: SdkReleaseOptions) =>
  runRelease(createPlanEffect(cwd, options));
const applySdkReleasePlan = (cwd: string, plan: SdkReleasePlan, options?: PythonMetadataOptions) =>
  runRelease(applyPlanEffect(cwd, plan, options));
const discoverPythonPackages = (cwd: string) => runRelease(discoverEffect(cwd));

async function fixture() {
  const cwd = await roots.create();
  const json = (path: string, value: unknown) =>
    writeText(`${cwd}/${path}`, JSON.stringify(value, null, 2));
  await json('package.json', {
    name: 'release-fixture',
    private: true,
    workspaces: ['packages/*', 'python'],
  });
  await writeText(`${cwd}/pnpm-workspace.yaml`, 'packages:\n  - packages/*\n  - python\n');
  await json('.changeset/config.json', {
    changelog: '@changesets/cli/changelog',
    format: false,
    fixed: [['@composio/core', '@composio/slim']],
    linked: [],
    privatePackages: { version: true, tag: false },
    ignore: ['@composio/cli'],
    baseBranch: 'next',
    access: 'public',
    updateInternalDependencies: 'patch',
    ___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH: {
      onlyUpdatePeerDependentsWhenOutOfRange: true,
    },
  });
  await json('packages/core/package.json', { name: '@composio/core', version: '0.28.0' });
  await json('packages/slim/package.json', { name: '@composio/slim', version: '0.28.0' });
  await json('packages/provider/package.json', {
    name: '@composio/provider',
    version: '0.11.0',
    peerDependencies: { '@composio/core': '^0.28.0 || ^0.29.0' },
  });
  await json('packages/cli/package.json', {
    name: '@composio/cli',
    version: '0.7.0',
    private: true,
  });
  await json('python/package.json', {
    name: '@composio/python-sdk',
    version: '0.31.0',
    private: true,
  });
  await writeText(
    `${cwd}/python/pyproject.toml`,
    '[project]\nname = "composio"\nversion = "0.31.0"\n'
  );
  await writeText(
    `${cwd}/python/setup.py`,
    'from setuptools import setup\nsetup(name="composio")\n'
  );
  await writeText(`${cwd}/python/composio/__version__.py`, '__version__ = "0.31.0"\n');
  for (const provider of ['openai', 'outside']) {
    await writeText(
      `${cwd}/python/providers/${provider}/pyproject.toml`,
      `[project]\nname = "composio-${provider}"\nversion = "0.31.0"\n`
    );
    await writeText(
      `${cwd}/python/providers/${provider}/setup.py`,
      `from setuptools import setup\nsetup(name="composio_${provider}", version="0.31.0")\n`
    );
  }
  await symlink(await resolvePath('node_modules'), `${cwd}/node_modules`);
  const note = async (
    id: string,
    releases: Record<string, string>,
    summary = 'Recorded SDK change.'
  ) =>
    writeText(
      `${cwd}/.changeset/${id}.md`,
      `---\n${Object.entries(releases)
        .map(([name, type]) => `${JSON.stringify(name)}: ${type}`)
        .join('\n')}\n---\n\n${summary}\n`
    );
  return { cwd, json, note };
}

afterEach(() => roots.cleanup());

function versions(plan: SdkReleasePlan) {
  return Object.fromEntries(plan.releases.map(release => [release.name, release.newVersion]));
}

describe('SDK release planning', () => {
  test('Python-only fragments version private marker and every Python mirror without npm targets', async () => {
    const { cwd, note } = await fixture();
    await note('python-fix', { '@composio/python-sdk': 'patch' }, 'Fix connected account updates.');
    const plan = await createSdkReleasePlan(cwd);
    expect(versions(plan)).toEqual({ '@composio/python-sdk': '0.31.1' });
    expect(plan.releases[0].language).toBe('python');
    await applySdkReleasePlan(cwd, plan, { updateLockfile: false });
    expect(await readText(`${cwd}/python/CHANGELOG.md`)).toContain(
      'Fix connected account updates.'
    );
    expect(await readText(`${cwd}/python/composio/__version__.py`)).toContain('0.31.1');
    const packages = await discoverPythonPackages(cwd);
    expect(packages.map(pkg => pkg.name)).toEqual([
      'composio',
      'composio-openai',
      'composio-outside',
    ]);
    expect(packages.every(pkg => pkg.version === '0.31.1')).toBe(true);
    expect(await readText(`${cwd}/python/providers/outside/setup.py`)).toContain('0.31.1');
    expect(await readText(`${cwd}/python/setup.py`)).toBe(
      'from setuptools import setup\nsetup(name="composio")\n'
    );
  });

  test('a beta plans snapshot versions of the next stable release, suffixed with its run', async () => {
    const { cwd, note } = await fixture();
    await note('core-feature', { '@composio/core': 'minor' }, 'Add trigger polling.');
    await note('python-fix', { '@composio/python-sdk': 'patch' }, 'Fix connected accounts.');
    const plan = await createSdkReleasePlan(cwd, { channel: 'beta', run: '19087654321' });
    expect(versions(plan)).toMatchObject({
      '@composio/core': '0.29.0-beta.19087654321',
      '@composio/slim': '0.29.0-beta.19087654321',
      '@composio/python-sdk': '0.31.1-beta.19087654321',
    });
    expect(plan.choices).toMatchObject({ channel: 'beta', run: '19087654321' });
    await applySdkReleasePlan(cwd, plan, { updateLockfile: false });
    expect(JSON.parse(await readText(`${cwd}/packages/core/package.json`)).version).toBe(
      '0.29.0-beta.19087654321'
    );
    // Python spells the same beta the PEP 440 way, in every mirror.
    expect(await readText(`${cwd}/python/composio/__version__.py`)).toContain('0.31.1b19087654321');
    expect(
      (await discoverPythonPackages(cwd)).every(pkg => pkg.version === '0.31.1b19087654321')
    ).toBe(true);
  });

  test('a beta needs its planning run, so its versions are unique', async () => {
    const { cwd, note } = await fixture();
    await note('core-feature', { '@composio/core': 'minor' });
    await expect(createSdkReleasePlan(cwd, { channel: 'beta' })).rejects.toThrow(
      'A beta plan needs its planning run'
    );
  });

  test('mixed recommendations retain TS independent provider versions and per-language overrides', async () => {
    const { cwd, note } = await fixture();
    await note('mixed', {
      '@composio/core': 'minor',
      '@composio/provider': 'patch',
      '@composio/python-sdk': 'patch',
    });
    const plan = await createSdkReleasePlan(cwd, { python: 'minor' });
    expect(versions(plan)).toEqual({
      '@composio/core': '0.29.0',
      '@composio/slim': '0.29.0',
      '@composio/provider': '0.11.1',
      '@composio/python-sdk': '0.32.0',
    });
    expect(
      plan.recommended.find(release => release.name === '@composio/python-sdk')?.newVersion
    ).toBe('0.31.1');
  });

  test('lower TS override is applied before fixed-group and peer dependency planning', async () => {
    const { cwd, note } = await fixture();
    await note('minor-core', { '@composio/core': 'minor' });
    const plan = await createSdkReleasePlan(cwd, { typescript: 'patch' });
    expect(versions(plan)).toEqual({ '@composio/core': '0.28.1', '@composio/slim': '0.28.1' });
    expect(plan.recommended.find(release => release.name === '@composio/core')?.newVersion).toBe(
      '0.29.0'
    );
  });

  test('skipping one language preserves its entry and summary in a mixed fragment', async () => {
    const { cwd, note } = await fixture();
    await note(
      'mixed',
      { '@composio/core': 'patch', '@composio/python-sdk': 'minor' },
      'Keep this summary for both SDKs.'
    );
    const plan = await createSdkReleasePlan(cwd, { python: 'skip' });
    await applySdkReleasePlan(cwd, plan, { updateLockfile: false });
    const remaining = await readText(`${cwd}/.changeset/mixed.md`);
    expect(remaining).toContain('"@composio/python-sdk": minor');
    expect(remaining).not.toContain('@composio/core');
    expect(remaining).toContain('Keep this summary for both SDKs.');
    expect(versions(await createSdkReleasePlan(cwd))).toEqual({ '@composio/python-sdk': '0.32.0' });
  });

  test('empty auto is a no-op and explicit bumps create honest primary-group maintenance releases', async () => {
    const { cwd } = await fixture();
    expect((await createSdkReleasePlan(cwd)).releases).toEqual([]);
    const plan = await createSdkReleasePlan(cwd, { typescript: 'patch', python: 'minor' });
    expect(versions(plan)).toEqual({
      '@composio/core': '0.28.1',
      '@composio/slim': '0.28.1',
      '@composio/python-sdk': '0.32.0',
    });
    expect(plan.changesets.map(note => note.summary).join('\n')).toContain(
      'No user-facing changes were recorded'
    );
  });

  test('prerelease mode is not a stable plan', async () => {
    const { cwd, json } = await fixture();
    await json('.changeset/pre.json', { mode: 'pre', tag: 'beta' });
    await expect(createSdkReleasePlan(cwd)).rejects.toThrow('prerelease');
  });

  test.each([
    ['python/composio/__version__.py', '__version__ = "0.30.0"\n'],
    ['python/providers/outside/setup.py', 'setup(version="0.30.0")\n'],
  ])('rejects Python metadata drift in %s before no-op planning', async (path, contents) => {
    const { cwd } = await fixture();
    await writeText(`${cwd}/${path}`, contents);
    await expect(createSdkReleasePlan(cwd)).rejects.toThrow('Python version mirror mismatch');
  });

  test('applying Python release metadata regenerates a real uv workspace lock', async () => {
    const { cwd, note } = await fixture();
    await writeText(
      `${cwd}/pyproject.toml`,
      '[project]\nname = "release-fixture"\nversion = "0.0.0"\nrequires-python = ">=3.11"\n[tool.uv.workspace]\nmembers = ["python", "python/providers/openai"]\n'
    );
    await note('python-lock', { '@composio/python-sdk': 'patch' });
    const plan = await createSdkReleasePlan(cwd);
    const previousOffline = process.env.UV_OFFLINE;
    const previousDownloads = process.env.UV_PYTHON_DOWNLOADS;
    process.env.UV_OFFLINE = '1';
    process.env.UV_PYTHON_DOWNLOADS = 'never';
    try {
      await applySdkReleasePlan(cwd, plan);
    } finally {
      if (previousOffline === undefined) delete process.env.UV_OFFLINE;
      else process.env.UV_OFFLINE = previousOffline;
      if (previousDownloads === undefined) delete process.env.UV_PYTHON_DOWNLOADS;
      else process.env.UV_PYTHON_DOWNLOADS = previousDownloads;
    }
    const lock = await readText(`${cwd}/uv.lock`);
    expect(lock).toMatch(/name = "composio"\nversion = "0\.31\.1"/);
    expect(lock).toMatch(/name = "composio-openai"\nversion = "0\.31\.1"/);
    expect((await discoverPythonPackages(cwd)).every(pkg => pkg.version === '0.31.1')).toBe(true);
  });

  test('ignored CLI and unrelated private package notes cannot enter SDK releases', async () => {
    const { cwd, note, json } = await fixture();
    await note('cli', { '@composio/cli': 'patch' });
    await expect(createSdkReleasePlan(cwd)).rejects.toThrow('not an SDK release target');
    await remove(`${cwd}/.changeset/cli.md`);
    await json('packages/example/package.json', {
      name: 'private-example',
      version: '1.0.0',
      private: true,
    });
    await note('example', { 'private-example': 'patch' });
    await expect(createSdkReleasePlan(cwd)).rejects.toThrow('not an SDK release target');
  });

  test('application rejects retained entries that were not in the selected source plan', async () => {
    const { cwd, note } = await fixture();
    await note('core', { '@composio/core': 'patch' });
    const selected = await createSdkReleasePlan(cwd);
    const plan = {
      ...selected,
      retainedChangesets: [
        ...selected.retainedChangesets,
        {
          id: 'unrelated',
          summary: 'Not an authored fragment.',
          releases: [{ name: '@composio/python-sdk', type: 'patch' as const }],
        },
      ],
    };
    await expect(applySdkReleasePlan(cwd, plan, { updateLockfile: false })).rejects.toThrow(
      'selected source plan'
    );
    expect(await exists(`${cwd}/.changeset/unrelated.md`)).toBe(false);
    expect(JSON.parse(await readText(`${cwd}/packages/core/package.json`)).version).toBe('0.28.0');
  });

  test('a changed release input is rejected before application changes versions', async () => {
    const { cwd, note } = await fixture();
    await note('core', { '@composio/core': 'patch' });
    const plan = await createSdkReleasePlan(cwd);
    await note('new-change', { '@composio/core': 'minor' });
    await expect(applySdkReleasePlan(cwd, plan, { updateLockfile: false })).rejects.toThrow(
      'changed'
    );
    expect(JSON.parse(await readText(`${cwd}/packages/core/package.json`)).version).toBe('0.28.0');
  });
});

test('a beta takes the PEP 440 spelling on PyPI and stable versions keep theirs', () => {
  expect(pythonVersion('0.31.1-beta.19087654321')).toBe('0.31.1b19087654321');
  expect(pythonVersion('0.31.1')).toBe('0.31.1');
});
