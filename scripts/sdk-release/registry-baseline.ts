import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getPackages } from '@manypkg/get-packages';
import semver from 'semver';
import { z } from 'zod';
import { discoverPythonPackages } from './python-metadata';
import type { ReleaseFetch } from './github';

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
