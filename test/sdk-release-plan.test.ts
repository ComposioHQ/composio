import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { applySdkReleasePlan, createSdkReleasePlan } from '../scripts/sdk-release/plan';
import { discoverPythonPackages } from '../scripts/sdk-release/python-metadata';

const roots: string[] = [];

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'composio-sdk-plan-'));
  roots.push(cwd);
  const json = async (path: string, value: unknown) => {
    await mkdir(join(cwd, path, '..'), { recursive: true });
    await writeFile(join(cwd, path), JSON.stringify(value, null, 2));
  };
  await mkdir(join(cwd, '.changeset'));
  await json('package.json', {
    name: 'release-fixture',
    private: true,
    workspaces: ['packages/*', 'python'],
  });
  await writeFile(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - python\n');
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
  await mkdir(join(cwd, 'python/composio'), { recursive: true });
  await writeFile(
    join(cwd, 'python/pyproject.toml'),
    '[project]\nname = "composio"\nversion = "0.31.0"\n'
  );
  await writeFile(
    join(cwd, 'python/setup.py'),
    'from setuptools import setup\nsetup(name="composio")\n'
  );
  await writeFile(join(cwd, 'python/composio/__version__.py'), '__version__ = "0.31.0"\n');
  for (const provider of ['openai', 'outside']) {
    await mkdir(join(cwd, 'python/providers', provider), { recursive: true });
    await writeFile(
      join(cwd, 'python/providers', provider, 'pyproject.toml'),
      `[project]\nname = "composio-${provider}"\nversion = "0.31.0"\n`
    );
    await writeFile(
      join(cwd, 'python/providers', provider, 'setup.py'),
      `from setuptools import setup\nsetup(name="composio_${provider}", version="0.31.0")\n`
    );
  }
  await symlink(resolve('node_modules'), join(cwd, 'node_modules'), 'dir');
  const note = async (
    id: string,
    releases: Record<string, string>,
    summary = 'Recorded SDK change.'
  ) =>
    writeFile(
      join(cwd, '.changeset', `${id}.md`),
      `---\n${Object.entries(releases)
        .map(([name, type]) => `${JSON.stringify(name)}: ${type}`)
        .join('\n')}\n---\n\n${summary}\n`
    );
  return { cwd, json, note };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })));
});

function versions(plan: Awaited<ReturnType<typeof createSdkReleasePlan>>) {
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
    expect(await readFile(join(cwd, 'python/CHANGELOG.md'), 'utf8')).toContain(
      'Fix connected account updates.'
    );
    expect(await readFile(join(cwd, 'python/composio/__version__.py'), 'utf8')).toContain('0.31.1');
    const packages = await discoverPythonPackages(cwd);
    expect(packages.map(pkg => pkg.name)).toEqual([
      'composio',
      'composio-openai',
      'composio-outside',
    ]);
    expect(packages.every(pkg => pkg.version === '0.31.1')).toBe(true);
    expect(await readFile(join(cwd, 'python/providers/outside/setup.py'), 'utf8')).toContain(
      '0.31.1'
    );
    expect(await readFile(join(cwd, 'python/setup.py'), 'utf8')).toBe(
      'from setuptools import setup\nsetup(name="composio")\n'
    );
    const second = await applySdkReleasePlan(cwd, plan, { updateLockfile: false });
    expect(second.alreadyApplied).toBe(true);
    expect(
      (await readFile(join(cwd, 'python/CHANGELOG.md'), 'utf8')).match(
        /Fix connected account updates\./g
      )
    ).toHaveLength(1);
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
    const remaining = await readFile(join(cwd, '.changeset/mixed.md'), 'utf8');
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

  test('baseline mismatches are rejected even without fragments and prerelease modes are not stable plans', async () => {
    const { cwd, json } = await fixture();
    await expect(
      createSdkReleasePlan(cwd, { baseline: { '@composio/core': '0.27.0' } })
    ).rejects.toThrow('baseline');
    await json('.changeset/pre.json', { mode: 'pre', tag: 'beta' });
    await expect(createSdkReleasePlan(cwd)).rejects.toThrow('prerelease');
  });

  test('a supplied registry baseline must cover every published target', async () => {
    const { cwd } = await fixture();
    await expect(
      createSdkReleasePlan(cwd, { baseline: { '@composio/core': '0.28.0' } })
    ).rejects.toThrow('baseline');
  });

  test.each([
    ['python/composio/__version__.py', '__version__ = "0.30.0"\n'],
    ['python/providers/outside/setup.py', 'setup(version="0.30.0")\n'],
  ])('rejects Python metadata drift in %s before no-op planning', async (path, contents) => {
    const { cwd } = await fixture();
    await writeFile(join(cwd, path), contents);
    await expect(createSdkReleasePlan(cwd)).rejects.toThrow('Python version mirror mismatch');
  });

  test('applying Python release metadata regenerates a real uv workspace lock', async () => {
    const { cwd, note } = await fixture();
    await writeFile(
      join(cwd, 'pyproject.toml'),
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
    const lock = await readFile(join(cwd, 'uv.lock'), 'utf8');
    expect(lock).toMatch(/name = "composio"\nversion = "0\.31\.1"/);
    expect(lock).toMatch(/name = "composio-openai"\nversion = "0\.31\.1"/);
    expect((await discoverPythonPackages(cwd)).every(pkg => pkg.version === '0.31.1')).toBe(true);
  });

  test('retry completes a failed Python lock without repeating versions or release notes', async () => {
    const { cwd, note } = await fixture();
    await writeFile(
      join(cwd, 'pyproject.toml'),
      '[project]\nname = "release-fixture"\nversion = "0.0.0"\nrequires-python = ">=3.11"\n[tool.uv.workspace]\nmembers = ["python", "python/providers/openai"]\n'
    );
    await note(
      'python-recovery',
      { '@composio/python-sdk': 'patch' },
      'Recover this release once.'
    );
    const plan = await createSdkReleasePlan(cwd);
    const bin = join(cwd, 'fake-bin');
    await mkdir(bin);
    await writeFile(join(bin, 'uv'), '#!/bin/sh\nexit 78\n');
    await chmod(join(bin, 'uv'), 0o755);
    const previous = {
      PATH: process.env.PATH,
      UV_OFFLINE: process.env.UV_OFFLINE,
      UV_PYTHON_DOWNLOADS: process.env.UV_PYTHON_DOWNLOADS,
    };
    try {
      process.env.PATH = `${bin}:${previous.PATH}`;
      process.env.UV_OFFLINE = '1';
      process.env.UV_PYTHON_DOWNLOADS = 'never';
      await expect(applySdkReleasePlan(cwd, plan)).rejects.toThrow('uv lock failed');
      process.env.PATH = previous.PATH;
      const retried = await applySdkReleasePlan(cwd, plan);
      expect(retried.alreadyApplied).toBe(true);
      expect(await readFile(join(cwd, 'uv.lock'), 'utf8')).toMatch(
        /name = "composio"\nversion = "0\.31\.1"/
      );
      expect((await discoverPythonPackages(cwd)).every(pkg => pkg.version === '0.31.1')).toBe(true);
      expect(
        (await readFile(join(cwd, 'python/CHANGELOG.md'), 'utf8')).match(
          /Recover this release once\./g
        )
      ).toHaveLength(1);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test('ignored CLI and unrelated private package notes cannot enter SDK releases', async () => {
    const { cwd, note, json } = await fixture();
    await note('cli', { '@composio/cli': 'patch' });
    await expect(createSdkReleasePlan(cwd)).rejects.toThrow('not an SDK release target');
    await rm(join(cwd, '.changeset/cli.md'));
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
    const plan = await createSdkReleasePlan(cwd);
    plan.retainedChangesets.push({
      id: 'unrelated',
      summary: 'Not an authored fragment.',
      releases: [{ name: '@composio/python-sdk', type: 'patch' }],
    });
    await expect(applySdkReleasePlan(cwd, plan, { updateLockfile: false })).rejects.toThrow(
      'selected source plan'
    );
    expect(await Bun.file(join(cwd, '.changeset/unrelated.md')).exists()).toBe(false);
    expect(
      JSON.parse(await readFile(join(cwd, 'packages/core/package.json'), 'utf8')).version
    ).toBe('0.28.0');
  });

  test('a changed release input is rejected before application changes versions', async () => {
    const { cwd, note } = await fixture();
    await note('core', { '@composio/core': 'patch' });
    const plan = await createSdkReleasePlan(cwd);
    await note('new-change', { '@composio/core': 'minor' });
    await expect(applySdkReleasePlan(cwd, plan, { updateLockfile: false })).rejects.toThrow(
      'changed'
    );
    expect(
      JSON.parse(await readFile(join(cwd, 'packages/core/package.json'), 'utf8')).version
    ).toBe('0.28.0');
  });
});
