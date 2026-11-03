import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { getPackages } from '@manypkg/get-packages';
import semver from 'semver';
import { z } from 'zod';
import { createSdkReleasePlan, type ReleaseChoice, type SdkReleasePlan } from './plan';
import { discoverPythonPackages } from './python-metadata';
import type { ReleaseFetch } from './github';

const workspaceSchema = z.object({ packages: z.array(z.string()) }).passthrough();
const rootSchema = z.object({ workspaces: z.array(z.string()).optional() }).passthrough();
const configSchema = z.object({ ignore: z.array(z.string()).default([]) }).passthrough();

export async function fetchStableRegistryBaseline(
  cwd: string,
  fetcher: ReleaseFetch = fetch
): Promise<Record<string, string>> {
  const { packages } = await getPackages(cwd);
  const config = configSchema.parse(
    JSON.parse(await readFile(resolve(cwd, '.changeset/config.json'), 'utf8'))
  );
  const python = await discoverPythonPackages(cwd);
  const npm = packages.filter(
    pkg =>
      !pkg.packageJson.private &&
      pkg.packageJson.name.startsWith('@composio/') &&
      !config.ignore.includes(pkg.packageJson.name)
  );
  const read = async (url: string) => {
    const response = await fetcher(url, { redirect: 'error' });
    if (!response.ok) throw new Error(`Registry baseline lookup failed (${response.status})`);
    return response.json();
  };
  const npmEntries = await Promise.all(
    npm.map(async pkg => {
      const value = z
        .object({ version: z.string() })
        .parse(
          await read(
            `https://registry.npmjs.org/${encodeURIComponent(pkg.packageJson.name)}/latest`
          )
        );
      if (!semver.valid(value.version) || semver.prerelease(value.version))
        throw new Error(`Expected a stable npm baseline for ${pkg.packageJson.name}`);
      return [pkg.packageJson.name, value.version] as const;
    })
  );
  const pythonEntries = await Promise.all(
    python.map(async pkg => {
      const value = z
        .object({
          releases: z.record(z.string(), z.array(z.object({ yanked: z.boolean().default(false) }))),
        })
        .parse(await read(`https://pypi.org/pypi/${encodeURIComponent(pkg.name)}/json`));
      const versions = Object.entries(value.releases)
        .filter(
          ([version, files]) =>
            semver.valid(version) && !semver.prerelease(version) && files.some(file => !file.yanked)
        )
        .map(([version]) => version);
      const version = semver.rsort(versions)[0];
      if (!version) throw new Error(`No public stable PyPI baseline for ${pkg.name}`);
      return [pkg.name, version] as const;
    })
  );
  return Object.fromEntries([...npmEntries, ...pythonEntries]);
}

/** Assemble the future cross-language plan without activating the marker in source. */
export async function createPilotPlan(
  cwd: string,
  choices: { typescript: ReleaseChoice; python: ReleaseChoice },
  fetcher: ReleaseFetch = fetch
): Promise<SdkReleasePlan> {
  const baseline = await fetchStableRegistryBaseline(cwd, fetcher);
  const temporary = await mkdtemp(join(tmpdir(), 'composio-sdk-preview-'));
  try {
    const { packages } = await getPackages(cwd);
    const copy = async (path: string) => {
      await mkdir(dirname(resolve(temporary, path)), { recursive: true });
      await copyFile(resolve(cwd, path), resolve(temporary, path));
    };
    for (const pkg of packages) await copy(relative(cwd, resolve(pkg.dir, 'package.json')));
    const root = rootSchema.parse(JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8')));
    await writeFile(
      resolve(temporary, 'package.json'),
      JSON.stringify({ ...root, workspaces: [...(root.workspaces ?? []), 'python'] })
    );
    const workspace = workspaceSchema.parse(
      Bun.YAML.parse(await readFile(resolve(cwd, 'pnpm-workspace.yaml'), 'utf8'))
    );
    await writeFile(
      resolve(temporary, 'pnpm-workspace.yaml'),
      JSON.stringify({ ...workspace, packages: [...workspace.packages, 'python'] })
    );
    for (const entry of await readdir(resolve(cwd, '.changeset'))) {
      if (entry.endsWith('.md') || entry === 'config.json' || entry === 'pre.json')
        await copy(`.changeset/${entry}`);
    }
    const config = configSchema.parse(
      JSON.parse(await readFile(resolve(cwd, '.changeset/config.json'), 'utf8'))
    );
    await writeFile(
      resolve(temporary, '.changeset/config.json'),
      JSON.stringify({ ...config, privatePackages: { version: true, tag: false } })
    );
    const python = await discoverPythonPackages(cwd);
    for (const pkg of python) {
      await copy(`${pkg.directory}/pyproject.toml`);
      if (pkg.directory !== 'python') await copy(`${pkg.directory}/setup.py`);
    }
    await copy('python/composio/__version__.py');
    await writeFile(
      resolve(temporary, 'python/package.json'),
      JSON.stringify({ name: '@composio/python-sdk', private: true, version: python[0].version })
    );
    return await createSdkReleasePlan(temporary, { ...choices, baseline });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
