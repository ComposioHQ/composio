import { readFile, readdir, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import semver from 'semver';

const projectSchema = z.object({ project: z.object({ name: z.string(), version: z.string() }) });

export interface PythonReleasePackage {
  name: string;
  version: string;
  directory: string;
}

export interface PythonMetadataOptions {
  updateLockfile?: boolean;
}

export async function discoverPythonPackages(cwd: string): Promise<PythonReleasePackage[]> {
  const directories = ['python'];
  const providers = resolve(cwd, 'python/providers');
  let entries: Dirent<string>[];
  try {
    entries = await readdir(providers, { withFileTypes: true });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    entries = [];
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const directory = `python/providers/${entry.name}`;
    if (await Bun.file(resolve(cwd, directory, 'pyproject.toml')).exists())
      directories.push(directory);
  }
  const packages = await Promise.all(
    directories.map(async directory => {
      const value = projectSchema.parse(
        Bun.TOML.parse(await readFile(resolve(cwd, directory, 'pyproject.toml'), 'utf8'))
      );
      if (directory !== 'python') {
        const setupPath = `${directory}/setup.py`;
        const setup = await readFile(resolve(cwd, setupPath), 'utf8');
        const mirror = setup.match(/\bversion\s*=\s*(["'])([^"']+)\1/);
        if (mirror?.[2] !== value.project.version) {
          throw new Error(`Python version mirror mismatch in ${setupPath}`);
        }
      }
      return {
        name: value.project.name.toLowerCase().replace(/[-_.]+/g, '-'),
        version: value.project.version,
        directory,
      };
    })
  );
  const runtimePath = 'python/composio/__version__.py';
  const runtime = await readFile(resolve(cwd, runtimePath), 'utf8');
  const mirror = runtime.match(/^\s*__version__\s*=\s*(["'])([^"']+)\1/m);
  if (mirror?.[2] !== packages[0].version) {
    throw new Error(`Python version mirror mismatch in ${runtimePath}`);
  }
  return packages;
}

export async function synchronizePythonMetadata(
  cwd: string,
  version: string,
  options: PythonMetadataOptions = {}
): Promise<string[]> {
  if (!semver.valid(version) || semver.prerelease(version)) {
    throw new Error(
      `Python stable release requires a stable semantic version, received ${version}`
    );
  }
  const packages = await discoverPythonPackages(cwd);
  const edits: { path: string; contents: string }[] = [];
  for (const pkg of packages) {
    const path = resolve(cwd, pkg.directory, 'pyproject.toml');
    const contents = await readFile(path, 'utf8');
    const updated = contents.replace(
      /(^\[project\][\s\S]*?^version\s*=\s*)(["'])([^"']+)\2/m,
      (_match, prefix: string, quote: string) => `${prefix}${quote}${version}${quote}`
    );
    if (projectSchema.parse(Bun.TOML.parse(updated)).project.version !== version) {
      throw new Error(`Cannot update Python project version in ${pkg.directory}/pyproject.toml`);
    }
    if (updated !== contents) edits.push({ path, contents: updated });
    if (pkg.directory !== 'python') {
      const setupPath = resolve(cwd, pkg.directory, 'setup.py');
      const setup = await readFile(setupPath, 'utf8');
      if (!/\bversion\s*=\s*(["'])([^"']+)\1/.test(setup)) {
        throw new Error(`Cannot find provider setup version in ${pkg.directory}/setup.py`);
      }
      const updatedSetup = setup.replace(
        /(\bversion\s*=\s*)(["'])([^"']+)\2/,
        (_match, prefix: string, quote: string) => `${prefix}${quote}${version}${quote}`
      );
      if (updatedSetup !== setup) edits.push({ path: setupPath, contents: updatedSetup });
    }
  }
  const runtimePath = resolve(cwd, 'python/composio/__version__.py');
  const runtime = await readFile(runtimePath, 'utf8');
  if (!/^\s*__version__\s*=\s*(["'])([^"']+)\1/m.test(runtime)) {
    throw new Error('Cannot find Python runtime __version__');
  }
  const updatedRuntime = runtime.replace(
    /(^\s*__version__\s*=\s*)(["'])([^"']+)\2/m,
    (_match, prefix: string, quote: string) => `${prefix}${quote}${version}${quote}`
  );
  if (updatedRuntime !== runtime) edits.push({ path: runtimePath, contents: updatedRuntime });
  for (const edit of edits) await writeFile(edit.path, edit.contents);
  const changed = edits.map(edit => relative(cwd, edit.path));
  if (options.updateLockfile !== false) {
    const result = spawnSync('uv', ['lock'], { cwd, encoding: 'utf8' });
    if (result.status !== 0)
      throw new Error(
        `uv lock failed: ${result.stderr || result.error?.message || 'unknown failure'}`
      );
    changed.push('uv.lock');
  }
  return changed;
}
