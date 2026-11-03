import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { compare, valid } from 'semver';
import { z } from 'zod';

export const branch = 'chore/update-composio-client';
export const paths = [
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'python/pyproject.toml',
  'python/setup.py',
  'uv.lock',
  '.changeset/composio-client-update.md',
  'ts/packages/cli/CHANGELOG.md',
] as const;

export const stableVersion = z
  .string()
  .refine(
    value => /^\d+\.\d+\.\d+$/.test(value) && valid(value) === value,
    'Expected a canonical stable semver version'
  );
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const dispatch = z
  .object({
    version: stableVersion,
    source_sha: sha,
    source_repository: z.literal('ComposioHQ/composio-client'),
  })
  .strict();
const pypiFile = z.object({ yanked: z.boolean(), filename: z.string() });
const npmIndex = z.object({ versions: z.record(z.string(), z.unknown()) });
const pypiIndex = z.object({ releases: z.record(z.string(), z.array(pypiFile)) });
const npmRelease = z.object({
  name: z.literal('@composio/client'),
  version: stableVersion,
  dist: z.object({
    integrity: z.string().min(1),
    tarball: z.url().startsWith('https://registry.npmjs.org/'),
  }),
});
const pypiRelease = z.object({
  info: z.object({ name: z.literal('composio-client'), version: stableVersion }),
  urls: z.array(pypiFile),
});
const artifactSchema = z
  .object({
    version: stableVersion,
    base_sha: sha,
    files: z
      .array(z.object({ path: z.enum(paths), content: z.string() }).strict())
      .min(1)
      .max(paths.length),
  })
  .strict();

export function validateEvent(name: string, payload: unknown) {
  if (name === 'repository_dispatch') {
    return z.object({ client_payload: dispatch }).parse(payload).client_payload;
  }
  if (name !== 'schedule' && name !== 'workflow_dispatch')
    throw new Error(`Unsupported event: ${name}`);
  return undefined;
}

export function commonStableVersion(npmData: unknown, pypiData: unknown): string {
  const npm = npmIndex.parse(npmData);
  const pypi = pypiIndex.parse(pypiData);
  const versions = Object.keys(npm.versions).filter(
    version =>
      stableVersion.safeParse(version).success && pypi.releases[version]?.some(file => !file.yanked)
  );
  versions.sort(compare);
  const latest = versions.at(-1);
  if (!latest) throw new Error('npm and PyPI have no common stable composio-client release');
  return latest;
}

export function verifyReleases(version: string, npmData: unknown, pypiData: unknown) {
  const npm = npmRelease.parse(npmData);
  const pypi = pypiRelease.parse(pypiData);
  if (
    npm.version !== version ||
    pypi.info.version !== version ||
    !pypi.urls.some(file => !file.yanked && file.filename.endsWith('.whl'))
  ) {
    throw new Error(`Both registries must expose usable composio-client ${version} distributions`);
  }
}

const catalogPattern = /^(\s*'@composio\/client':\s*)([^\s#]+)(\s*)$/gm;
const pythonPattern = /("composio-client==)([^"\s]+)(")/g;

function onePin(content: string, pattern: RegExp, label: string): string {
  const matches = [...content.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`Expected exactly one ${label} pin`);
  return stableVersion.parse(matches[0]?.[2]);
}

export function catalogVersion(content: string) {
  return onePin(content, catalogPattern, 'catalog');
}

function exactReleaseAgeExclusion(content: string, target: string) {
  const policy = z
    .object({ minimumReleaseAgeExclude: z.array(z.string()) })
    .parse(Bun.YAML.parse(content));
  const clientExclusions = policy.minimumReleaseAgeExclude.filter(
    value => value === '@composio/client' || value.startsWith('@composio/client@')
  );
  const pattern = /^([ \t]*-[ \t]*)['"]?@composio\/client(?:@[^'"\r\n]+)?['"]?[ \t]*$/gm;
  let result: string;
  if (clientExclusions.length > 0) {
    let replaced = false;
    result = content.replace(pattern, (_line, prefix: string) => {
      if (replaced) return '';
      replaced = true;
      return `${prefix}'@composio/client@${target}'`;
    });
  } else {
    result = content.replace(
      /^minimumReleaseAgeExclude:[ \t]*$/m,
      `minimumReleaseAgeExclude:\n  - '@composio/client@${target}'`
    );
  }
  const exclusions = z
    .object({ minimumReleaseAgeExclude: z.array(z.string()) })
    .parse(Bun.YAML.parse(result))
    .minimumReleaseAgeExclude.filter(
      value => value === '@composio/client' || value.startsWith('@composio/client@')
    );
  if (exclusions.length !== 1 || exclusions[0] !== `@composio/client@${target}`) {
    throw new Error('Cannot restrict the client release-age exemption to the exact target');
  }
  return result;
}

export function planUpdates(
  files: Record<string, string>,
  targetInput: string,
  existingCandidate?: string
) {
  const target = stableVersion.parse(targetInput);
  const current = [
    catalogVersion(z.string().parse(files['pnpm-workspace.yaml'])),
    onePin(z.string().parse(files['python/pyproject.toml']), pythonPattern, 'Python pyproject'),
    onePin(z.string().parse(files['python/setup.py']), pythonPattern, 'Python setup'),
  ];
  if (current[1] !== current[2])
    throw new Error('Python client pins disagree; reconcile metadata first');
  if (
    [...current, ...(existingCandidate ? [stableVersion.parse(existingCandidate)] : [])].some(
      version => compare(version, target) > 0
    )
  ) {
    throw new Error(`Refusing to downgrade a current or pending client pin to ${target}`);
  }
  const changed: Record<string, string> = {};
  if (current[0] !== target) {
    changed['pnpm-workspace.yaml'] = exactReleaseAgeExclusion(
      files['pnpm-workspace.yaml']!.replace(catalogPattern, `$1${target}$3`),
      target
    );
    changed['.changeset/composio-client-update.md'] =
      `---\n'@composio/core': patch\n---\n\nUpdate @composio/client to ${target} to include the latest API changes.\n`;
    const changelog = z.string().parse(files['ts/packages/cli/CHANGELOG.md']);
    const marker = '### Patch Changes\n';
    if (
      !changelog.startsWith('# @composio/cli\n\n## Unreleased\n') ||
      !changelog.includes(marker)
    ) {
      throw new Error('CLI changelog is missing its Unreleased patch section');
    }
    changed['ts/packages/cli/CHANGELOG.md'] = changelog.replace(
      marker,
      `${marker}\n- Update @composio/client to ${target} to include the latest API changes.\n`
    );
  }
  if (current[1] !== target) {
    for (const path of ['python/pyproject.toml', 'python/setup.py']) {
      changed[path] = files[path]!.replace(pythonPattern, `$1${target}$3`);
    }
  }
  return { changed, typescript: current[0] !== target, python: current[1] !== target };
}

async function registryJson(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(60_000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Registry request failed: ${url} (${response.status})`);
  return response.json();
}

async function command(args: string[], cwd: string) {
  const child = Bun.spawn(args, { cwd, stdout: 'inherit', stderr: 'inherit' });
  if ((await child.exited) !== 0) throw new Error(`Command failed: ${args.join(' ')}`);
}

async function output(name: string, value: string) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

export async function prepare(
  root: string,
  options: {
    eventName: string;
    event: unknown;
    registry?: typeof registryJson;
    runCommand?: typeof command;
    setOutput?: typeof output;
  }
) {
  const readRegistry = options.registry ?? registryJson;
  const runCommand = options.runCommand ?? command;
  const setOutput = options.setOutput ?? output;
  const source = validateEvent(options.eventName, options.event);
  await rm(resolve(root, '.artifacts/client-update/update.json'), { force: true });
  const [npm, pypi] = await Promise.all([
    readRegistry('https://registry.npmjs.org/@composio%2fclient'),
    readRegistry('https://pypi.org/pypi/composio-client/json'),
  ]);
  const version = commonStableVersion(npm, pypi);
  // A dispatch may race the registry CDN. Retry next hour rather than silently acknowledging an older release.
  if (source && compare(version, source.version) < 0)
    throw new Error(`Dispatched ${source.version} is not yet available on both registries`);
  const [npmExact, pypiExact] = await Promise.all([
    readRegistry(`https://registry.npmjs.org/@composio%2fclient/${version}`),
    readRegistry(`https://pypi.org/pypi/composio-client/${version}/json`),
  ]);
  verifyReleases(version, npmExact, pypiExact);
  const files = Object.fromEntries(
    await Promise.all(
      [
        'pnpm-workspace.yaml',
        'python/pyproject.toml',
        'python/setup.py',
        'ts/packages/cli/CHANGELOG.md',
      ].map(async path => [path, await readFile(resolve(root, path), 'utf8')])
    )
  );
  const candidate = Bun.spawn(
    ['git', 'show', `refs/remotes/origin/${branch}:pnpm-workspace.yaml`],
    { cwd: root, stdout: 'pipe', stderr: 'ignore' }
  );
  const candidateText = await new Response(candidate.stdout).text();
  const existing = (await candidate.exited) === 0 ? catalogVersion(candidateText) : undefined;
  const plan = planUpdates(files, version, existing);
  const changed = Object.keys(plan.changed).length > 0;
  await setOutput('changed', String(changed));
  await setOutput('version', version);
  if (!changed) {
    console.log(`All client pins already use ${version}`);
    return;
  }
  for (const [path, content] of Object.entries(plan.changed)) {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), content);
  }
  if (plan.typescript) {
    const catalog = z.string().parse(plan.changed['pnpm-workspace.yaml']);
    // pnpm validates the old lock before resolving the new one. Its current
    // client may also be less than three days old: exempt both exact versions
    // during resolution, then retain only the target in the committed policy.
    const previous = catalogVersion(z.string().parse(files['pnpm-workspace.yaml']));
    await writeFile(
      resolve(root, 'pnpm-workspace.yaml'),
      catalog.replace(
        `  - '@composio/client@${version}'`,
        `  - '@composio/client@${previous} || ${version}'`
      )
    );
    try {
      await runCommand(
        ['pnpm', 'install', '--lockfile-only', '--ignore-scripts', '--no-frozen-lockfile'],
        root
      );
    } finally {
      await writeFile(resolve(root, 'pnpm-workspace.yaml'), catalog);
    }
  }
  if (plan.python) {
    const python = z.string().min(1).parse(Bun.which('python'));
    await runCommand(
      ['uv', 'lock', '--python', python, '--upgrade-package', 'composio-client'],
      root
    );
  }
  const diff = Bun.spawn(['git', 'diff', '--name-only'], { cwd: root, stdout: 'pipe' });
  const diffPaths = (await new Response(diff.stdout).text()).trim().split('\n').filter(Boolean);
  if (
    (await diff.exited) !== 0 ||
    diffPaths.some(path => !paths.some(allowed => allowed === path))
  ) {
    throw new Error('Lock generation changed files outside the client update allowlist');
  }
  const base = Bun.spawn(['git', 'rev-parse', 'HEAD'], { cwd: root, stdout: 'pipe' });
  const baseSha = sha.parse((await new Response(base.stdout).text()).trim());
  if ((await base.exited) !== 0) throw new Error('Cannot determine trusted checkout revision');
  const artifact = artifactSchema.parse({
    version,
    base_sha: baseSha,
    files: await Promise.all(
      [...new Set([...diffPaths, ...Object.keys(plan.changed)])].map(async path => ({
        path,
        content: await readFile(resolve(root, path), 'utf8'),
      }))
    ),
  });
  await mkdir(resolve(root, '.artifacts/client-update'), { recursive: true });
  await writeFile(resolve(root, '.artifacts/client-update/update.json'), JSON.stringify(artifact));
  console.log(`Prepared client ${version}; npm and PyPI exact distributions verified`);
}

export async function applyArtifact(root: string, data: unknown, baseSha: string) {
  const artifact = artifactSchema.parse(data);
  if (artifact.base_sha !== baseSha)
    throw new Error('next advanced after preparation; retry against its current revision');
  if (new Set(artifact.files.map(file => file.path)).size !== artifact.files.length)
    throw new Error('Duplicate artifact path');
  for (const file of artifact.files) {
    await mkdir(dirname(resolve(root, file.path)), { recursive: true });
    await writeFile(resolve(root, file.path), file.content);
  }
  return artifact.version;
}

if (import.meta.main) {
  try {
    const root = process.cwd();
    if (process.argv[2] === 'prepare')
      await prepare(root, {
        eventName: process.env.GITHUB_EVENT_NAME ?? 'workflow_dispatch',
        event: process.env.GITHUB_EVENT_PATH
          ? JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'))
          : {},
      });
    else if (process.argv[2] === 'apply') {
      const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root });
      if (head.exitCode !== 0) throw new Error('Cannot read checkout revision');
      const version = await applyArtifact(
        root,
        JSON.parse(await readFile(resolve(root, '.artifacts/client-update/update.json'), 'utf8')),
        head.stdout.toString().trim()
      );
      await output('version', version);
    } else throw new Error('Usage: bun scripts/update-composio-client.ts prepare|apply');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Client update failed');
    process.exitCode = 1;
  }
}
