import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { getPackages } from '@manypkg/get-packages';
import {
  candidateManifestSchema,
  originalCandidates,
  reuseCandidate,
  sha256,
  verifyCandidateFiles,
  mayRebuildMissingCandidate,
} from './artifacts';
import { GitHubReleaseClient, SDK_RELEASE_REPOSITORY } from './github';
import { batchPath, releaseBatchSchema } from './source';
import { runPreparationCommand } from './commands';
import { downloadCandidate } from './artifact-download';
import { discoverPythonPackages } from './python-metadata';

export async function registryInventoryEmpty(cwd: string): Promise<boolean> {
  const batch = releaseBatchSchema.parse(await Bun.file(resolve(cwd, batchPath)).json());
  const python = await discoverPythonPackages(cwd);
  for (const release of batch.plan.releases) {
    const targets =
      release.language === 'python'
        ? python.map(pkg => ({ name: pkg.name, version: release.newVersion, python: true }))
        : [{ name: release.name, version: release.newVersion, python: false }];
    for (const target of targets) {
      const url = target.python
        ? `https://pypi.org/pypi/${target.name}/${target.version}/json`
        : `https://registry.npmjs.org/${encodeURIComponent(target.name)}/${target.version}`;
      const response = await fetch(url, { redirect: 'error' });
      if (response.ok) return false;
      if (response.status !== 404)
        throw new Error(`Cannot establish public registry inventory (${response.status})`);
    }
  }
  return true;
}

export async function buildTypescript(cwd: string, directory: string, names: Set<string>) {
  const { packages } = await getPackages(cwd);
  const sdk = packages.filter(
    pkg =>
      !pkg.packageJson.private &&
      pkg.packageJson.name.startsWith('@composio/') &&
      pkg.packageJson.name !== '@composio/cli'
  );
  runPreparationCommand(
    'pnpm',
    ['exec', 'turbo', 'build', ...sdk.map(pkg => `--filter=${pkg.packageJson.name}`)],
    cwd
  );
  const compatibility = resolve(cwd, '.artifacts/sdk-compatibility');
  await mkdir(compatibility, { recursive: true });
  for (const pkg of sdk) {
    runPreparationCommand(
      'pnpm',
      [
        '--dir',
        pkg.dir,
        'pack',
        '--pack-destination',
        compatibility,
        '--config.ignore-scripts=true',
      ],
      cwd
    );
    const name = `${pkg.packageJson.name.replace(/^@/, '').replaceAll('/', '-')}-${pkg.packageJson.version}.tgz`;
    const packed = z
      .object({ name: z.string(), version: z.string() })
      .passthrough()
      .parse(
        JSON.parse(
          runPreparationCommand(
            'tar',
            ['-xOf', join(compatibility, name), 'package/package.json'],
            cwd
          )
        )
      );
    if (packed.name !== pkg.packageJson.name || packed.version !== pkg.packageJson.version)
      throw new Error('Packed npm metadata differs from the approved source');
    if (names.has(pkg.packageJson.name))
      await writeFile(join(directory, name), await readFile(join(compatibility, name)));
  }
  runPreparationCommand(
    'pnpm',
    [
      'exec',
      'tsx',
      'ts/scripts/check-provider-compatibility.ts',
      '--lane',
      'current',
      '--candidate-dir',
      compatibility,
    ],
    cwd
  );
}
export async function buildPython(cwd: string, directory: string) {
  process.env.UV_PROJECT_ENVIRONMENT = resolve(cwd, 'python/.venv');
  runPreparationCommand('uv', ['sync', '--locked', '--only-group', 'release'], cwd);
  runPreparationCommand('make', ['build', 'BUILD_ARGS=--no-isolation'], join(cwd, 'python'));
  runPreparationCommand(
    'uv',
    [
      'run',
      '--locked',
      '--only-group',
      'release',
      'python',
      'scripts/sdk-release/validate-python-candidates.py',
    ],
    cwd
  );
  for (const name of await readdir(resolve(cwd, 'python/dist'))) {
    if (name.endsWith('.whl') || name.endsWith('.tar.gz'))
      await writeFile(join(directory, name), await readFile(resolve(cwd, 'python/dist', name)));
  }
}

if (import.meta.main) {
  const env = z
    .object({
      GITHUB_RUN_ID: z.coerce.number().int().positive(),
      GITHUB_RUN_ATTEMPT: z.coerce.number().int().positive(),
      GITHUB_SHA: z.string().regex(/^[a-f0-9]{40}$/),
      GITHUB_OUTPUT: z.string(),
      SDK_READ_TOKEN: z.string().min(1),
    })
    .parse(process.env);
  if (process.env.SDK_RELEASE_TOKEN)
    throw new Error('Candidate jobs must not receive the controller credential');
  const language = z.enum(['typescript', 'python']).parse(Bun.argv[2]);
  const batch = releaseBatchSchema.parse(await Bun.file(batchPath).json());
  const selected = batch.plan.releases.filter(release => release.language === language);
  if (!selected.length) {
    await writeFile(env.GITHUB_OUTPUT, 'selected=false\nbuild=false\n', { flag: 'a' });
  } else {
    const directory = resolve('sdk-candidate', language);
    const github = new GitHubReleaseClient(env.SDK_READ_TOKEN);
    const artifacts = await originalCandidates(github, env.GITHUB_RUN_ID);
    let existing;
    try {
      existing = reuseCandidate(
        artifacts,
        `sdk-candidate-${language}`,
        env.GITHUB_RUN_ID,
        env.GITHUB_SHA
      );
    } catch (error) {
      if (env.GITHUB_RUN_ATTEMPT > 1)
        await writeFile(env.GITHUB_OUTPUT, 'terminal=true\n', { flag: 'a' });
      throw error;
    }
    await mkdir(directory, { recursive: true });
    if (existing) {
      await downloadCandidate(env.SDK_READ_TOKEN, existing, directory);
      const manifest = candidateManifestSchema.parse(
        await Bun.file(join(directory, 'candidate.json')).json()
      );
      if (
        manifest.sourceSha !== env.GITHUB_SHA ||
        manifest.producerRun !== env.GITHUB_RUN_ID ||
        manifest.language !== language
      )
        throw new Error('Candidate manifest producer/source mismatch');
      const actual = new Map(
        await Promise.all(
          (await readdir(directory))
            .filter(name => name !== 'candidate.json')
            .map(
              async name => [name, new Uint8Array(await readFile(join(directory, name)))] as const
            )
        )
      );
      verifyCandidateFiles(actual, manifest.files);
      await writeFile(
        env.GITHUB_OUTPUT,
        `selected=true\nbuild=false\nartifact-id=${existing.id}\nartifact-digest=${existing.digest}\nartifact-expires=${existing.expires_at}\n`,
        { flag: 'a' }
      );
    } else {
      if (
        env.GITHUB_RUN_ATTEMPT > 1 &&
        !(await mayRebuildMissingCandidate(
          github,
          env.GITHUB_RUN_ID,
          await registryInventoryEmpty(process.cwd())
        ))
      ) {
        await writeFile(env.GITHUB_OUTPUT, 'terminal=true\n', { flag: 'a' });
        throw new Error(
          'Candidate missing after possible publication; a newly approved corrective release is required'
        );
      }
      const pythonRelease = selected.find(release => release.language === 'python');
      if (
        pythonRelease &&
        (await discoverPythonPackages(process.cwd())).some(
          pkg => pkg.version !== pythonRelease.newVersion
        )
      )
        throw new Error('Python candidate train differs from the approved target');
      const { packages } = await getPackages(process.cwd());
      for (const release of selected) {
        const pkg = packages.find(pkg => pkg.packageJson.name === release.name);
        if (!pkg || pkg.packageJson.version !== release.newVersion)
          throw new Error(`Candidate version differs from approved target: ${release.name}`);
      }
      if (language === 'typescript')
        await buildTypescript(
          process.cwd(),
          directory,
          new Set(selected.map(release => release.name))
        );
      else await buildPython(process.cwd(), directory);
      const files = await Promise.all(
        (await readdir(directory)).map(async name => {
          const bytes = new Uint8Array(await readFile(join(directory, name)));
          return { name, sha256: sha256(bytes), size: bytes.length };
        })
      );
      const manifest = candidateManifestSchema.parse({
        sourceSha: env.GITHUB_SHA,
        producerRun: env.GITHUB_RUN_ID,
        language,
        files,
      });
      await writeFile(join(directory, 'candidate.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      await writeFile(env.GITHUB_OUTPUT, 'selected=true\nbuild=true\n', { flag: 'a' });
    }
  }
}
