import { dirname, resolve } from 'node:path';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { Data, Effect, FileSystem } from 'effect';
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
    const header = '# @composio/cli\n\n## Unreleased\n';
    const marker = '### Patch Changes\n';
    if (!changelog.startsWith(header)) {
      throw new Error('CLI changelog is missing its Unreleased section');
    }
    const nextRelease = changelog.indexOf('\n## ', header.length);
    const end = nextRelease === -1 ? changelog.length : nextRelease;
    const unreleased = changelog.slice(header.length, end);
    const note = `- Update @composio/client to ${target} to include the latest API changes.\n`;
    const updated = unreleased.includes(marker)
      ? unreleased.replace(marker, `${marker}\n${note}`)
      : `\n${marker}\n${note}${unreleased}`;
    changed['ts/packages/cli/CHANGELOG.md'] = `${header}${updated}${changelog.slice(end)}`;
  }
  if (current[1] !== target) {
    for (const path of ['python/pyproject.toml', 'python/setup.py']) {
      changed[path] = files[path]!.replace(pythonPattern, `$1${target}$3`);
    }
  }
  return { changed, typescript: current[0] !== target, python: current[1] !== target };
}

export class ClientUpdateIoError extends Data.TaggedError('ClientUpdateIoError')<{
  readonly operation: string;
  readonly path: string;
  readonly message: string;
  readonly cause: unknown;
}> {}
export class ClientUpdateRegistryError extends Data.TaggedError('ClientUpdateRegistryError')<{
  readonly url: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}
export class ClientUpdateCommandError extends Data.TaggedError('ClientUpdateCommandError')<{
  readonly command: readonly string[];
  readonly message: string;
  readonly cause?: unknown;
}> {}
export class ClientUpdateValidationError extends Data.TaggedError('ClientUpdateValidationError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
type ClientUpdateError =
  | ClientUpdateIoError
  | ClientUpdateRegistryError
  | ClientUpdateCommandError
  | ClientUpdateValidationError;

const checked = <A>(operation: () => A) =>
  Effect.try({
    try: operation,
    catch: cause =>
      new ClientUpdateValidationError({
        message: cause instanceof Error ? cause.message : 'Client update validation failed',
        cause,
      }),
  });
const file = <A, E>(
  operation: string,
  path: string,
  action: (fs: FileSystem.FileSystem) => Effect.Effect<A, E>
) =>
  Effect.gen(function* () {
    return yield* action(yield* FileSystem.FileSystem);
  }).pipe(
    Effect.mapError(
      cause =>
        new ClientUpdateIoError({ operation, path, message: `Cannot ${operation}: ${path}`, cause })
    )
  );
const read = (path: string) => file('read file', path, fs => fs.readFileString(path));
const write = (path: string, content: string) =>
  file('write file', path, fs => fs.writeFileString(path, content));
const directory = (path: string) =>
  file('create directory', path, fs => fs.makeDirectory(path, { recursive: true }));

const registryJson = (url: string) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: signal =>
        fetch(url, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
          headers: { accept: 'application/json' },
          redirect: 'error',
        }),
      catch: cause =>
        new ClientUpdateRegistryError({ url, message: `Registry request failed: ${url}`, cause }),
    });
    if (!response.ok)
      return yield* Effect.fail(
        new ClientUpdateRegistryError({
          url,
          message: `Registry request failed: ${url} (${response.status})`,
        })
      );
    return yield* Effect.tryPromise({
      try: () => response.json(),
      catch: cause =>
        new ClientUpdateRegistryError({ url, message: `Invalid registry JSON: ${url}`, cause }),
    });
  });

const processResult = (args: string[], cwd: string, capture = false) =>
  Effect.acquireUseRelease(
    Effect.try({
      try: () =>
        Bun.spawn(args, {
          cwd,
          stdout: capture ? 'pipe' : 'inherit',
          stderr: capture ? 'ignore' : 'inherit',
        }),
      catch: cause =>
        new ClientUpdateCommandError({
          command: args,
          message: `Cannot start command: ${args.join(' ')}`,
          cause,
        }),
    }),
    child =>
      Effect.gen(function* () {
        const [stdout, exitCode] = yield* Effect.all(
          [
            capture
              ? Effect.tryPromise({
                  try: () => new Response(child.stdout).text(),
                  catch: cause =>
                    new ClientUpdateCommandError({
                      command: args,
                      message: `Cannot read command output: ${args.join(' ')}`,
                      cause,
                    }),
                })
              : Effect.succeed(''),
            Effect.tryPromise({
              try: () => child.exited,
              catch: cause =>
                new ClientUpdateCommandError({
                  command: args,
                  message: `Cannot await command: ${args.join(' ')}`,
                  cause,
                }),
            }),
          ],
          { concurrency: 'unbounded' }
        );
        return { stdout, exitCode };
      }),
    child =>
      Effect.try({
        try: () => {
          if (child.exitCode === null) child.kill();
        },
        catch: cause =>
          new ClientUpdateCommandError({
            command: args,
            message: 'Cannot stop interrupted command',
            cause,
          }),
      }).pipe(Effect.ignore)
  );
const command = (args: string[], cwd: string) =>
  Effect.gen(function* () {
    const result = yield* processResult(args, cwd);
    if (result.exitCode !== 0)
      return yield* Effect.fail(
        new ClientUpdateCommandError({
          command: args,
          message: `Command failed: ${args.join(' ')}`,
        })
      );
  });
const git = (args: string[], root: string, allowFailure = false) =>
  Effect.gen(function* () {
    const result = yield* processResult(['git', ...args], root, true);
    if (!allowFailure && result.exitCode !== 0)
      return yield* Effect.fail(
        new ClientUpdateCommandError({
          command: ['git', ...args],
          message: `Git command failed: ${args[0]}`,
        })
      );
    return result;
  });
const output = (name: string, value: string) =>
  Effect.gen(function* () {
    const path = process.env.GITHUB_OUTPUT;
    if (path)
      yield* file('append workflow output', path, fs =>
        fs.writeFileString(path, `${name}=${value}\n`, { flag: 'a' })
      );
  });

export const prepare = (
  root: string,
  options: {
    eventName: string;
    event: unknown;
    registry?: (url: string) => Effect.Effect<unknown, ClientUpdateError>;
    runCommand?: (
      args: string[],
      cwd: string
    ) => Effect.Effect<void, ClientUpdateError, FileSystem.FileSystem>;
    setOutput?: (
      name: string,
      value: string
    ) => Effect.Effect<void, ClientUpdateError, FileSystem.FileSystem>;
  }
) =>
  Effect.gen(function* () {
    const readRegistry = options.registry ?? registryJson;
    const runCommand = options.runCommand ?? command;
    const setOutput = options.setOutput ?? output;
    const source = yield* checked(() => validateEvent(options.eventName, options.event));
    const artifactPath = resolve(root, '.artifacts/client-update/update.json');
    yield* file('remove stale artifact', artifactPath, fs =>
      fs.remove(artifactPath, { force: true })
    );
    const [npm, pypi] = yield* Effect.all(
      [
        readRegistry('https://registry.npmjs.org/@composio%2fclient'),
        readRegistry('https://pypi.org/pypi/composio-client/json'),
      ],
      { concurrency: 'unbounded' }
    );
    const version = yield* checked(() => commonStableVersion(npm, pypi));
    // A dispatch may race the registry CDN. Retry next hour rather than silently acknowledging an older release.
    if (source && compare(version, source.version) < 0)
      return yield* Effect.fail(
        new ClientUpdateValidationError({
          message: `Dispatched ${source.version} is not yet available on both registries`,
        })
      );
    const [npmExact, pypiExact] = yield* Effect.all(
      [
        readRegistry(`https://registry.npmjs.org/@composio%2fclient/${version}`),
        readRegistry(`https://pypi.org/pypi/composio-client/${version}/json`),
      ],
      { concurrency: 'unbounded' }
    );
    yield* checked(() => verifyReleases(version, npmExact, pypiExact));
    const files = Object.fromEntries(
      yield* Effect.all(
        [
          'pnpm-workspace.yaml',
          'python/pyproject.toml',
          'python/setup.py',
          'ts/packages/cli/CHANGELOG.md',
        ].map(path =>
          Effect.gen(function* () {
            return [path, yield* read(resolve(root, path))];
          })
        ),
        { concurrency: 'unbounded' }
      )
    );
    const candidate = yield* git(
      ['show', `refs/remotes/origin/${branch}:pnpm-workspace.yaml`],
      root,
      true
    );
    const existing =
      candidate.exitCode === 0 ? yield* checked(() => catalogVersion(candidate.stdout)) : undefined;
    const plan = yield* checked(() => planUpdates(files, version, existing));
    const changed = Object.keys(plan.changed).length > 0;
    yield* setOutput('changed', String(changed));
    yield* setOutput('version', version);
    if (!changed) {
      yield* Effect.sync(() => console.log(`All client pins already use ${version}`));
      return;
    }
    for (const [path, content] of Object.entries(plan.changed)) {
      yield* directory(dirname(resolve(root, path)));
      yield* write(resolve(root, path), content);
    }
    if (plan.typescript) {
      const catalog = yield* checked(() => z.string().parse(plan.changed['pnpm-workspace.yaml']));
      // pnpm validates the old lock before resolving the new one. Its current
      // client may also be less than three days old: exempt both exact versions
      // during resolution, then retain only the target in the committed policy.
      const previous = yield* checked(() =>
        catalogVersion(z.string().parse(files['pnpm-workspace.yaml']))
      );
      const exclusion = `'@composio/client@${version}'`;
      const resolving = catalog.replace(exclusion, `'@composio/client@${previous} || ${version}'`);
      if (resolving === catalog)
        return yield* Effect.fail(
          new ClientUpdateValidationError({
            message: 'Cannot widen the client release-age exemption for lock resolution',
          })
        );
      yield* Effect.acquireUseRelease(
        write(resolve(root, 'pnpm-workspace.yaml'), resolving),
        () =>
          runCommand(
            ['pnpm', 'install', '--lockfile-only', '--ignore-scripts', '--no-frozen-lockfile'],
            root
          ),
        () => write(resolve(root, 'pnpm-workspace.yaml'), catalog)
      );
    }
    if (plan.python) {
      const python = yield* checked(() => z.string().min(1).parse(Bun.which('python')));
      yield* runCommand(
        ['uv', 'lock', '--python', python, '--upgrade-package', 'composio-client'],
        root
      );
    }
    const diff = yield* git(['diff', '--name-only'], root);
    const diffPaths = diff.stdout.trim().split('\n').filter(Boolean);
    if (diffPaths.some(path => !paths.some(allowed => allowed === path))) {
      return yield* Effect.fail(
        new ClientUpdateValidationError({
          message: 'Lock generation changed files outside the client update allowlist',
        })
      );
    }
    const base = yield* git(['rev-parse', 'HEAD'], root);
    const baseSha = yield* checked(() => sha.parse(base.stdout.trim()));
    const artifactFiles = yield* Effect.all(
      [...new Set([...diffPaths, ...Object.keys(plan.changed)])].map(path =>
        Effect.gen(function* () {
          return { path, content: yield* read(resolve(root, path)) };
        })
      ),
      { concurrency: 'unbounded' }
    );
    const artifact = yield* checked(() =>
      artifactSchema.parse({
        version,
        base_sha: baseSha,
        files: artifactFiles,
      })
    );
    yield* directory(resolve(root, '.artifacts/client-update'));
    yield* write(artifactPath, JSON.stringify(artifact));
    yield* Effect.sync(() =>
      console.log(`Prepared client ${version}; npm and PyPI exact distributions verified`)
    );
  });

export const applyArtifact = (root: string, data: unknown, baseSha: string) =>
  Effect.gen(function* () {
    const artifact = yield* checked(() => artifactSchema.parse(data));
    if (artifact.base_sha !== baseSha)
      return yield* Effect.fail(
        new ClientUpdateValidationError({
          message: 'next advanced after preparation; retry against its current revision',
        })
      );
    if (new Set(artifact.files.map(file => file.path)).size !== artifact.files.length)
      return yield* Effect.fail(
        new ClientUpdateValidationError({ message: 'Duplicate artifact path' })
      );
    for (const file of artifact.files) {
      yield* directory(dirname(resolve(root, file.path)));
      yield* write(resolve(root, file.path), file.content);
    }
    return artifact.version;
  });

if (import.meta.main) {
  const main = Effect.gen(function* () {
    const root = process.cwd();
    if (process.argv[2] === 'prepare') {
      const eventText = process.env.GITHUB_EVENT_PATH
        ? yield* read(process.env.GITHUB_EVENT_PATH)
        : '{}';
      yield* prepare(root, {
        eventName: process.env.GITHUB_EVENT_NAME ?? 'workflow_dispatch',
        event: yield* checked(() => JSON.parse(eventText)),
      });
    } else if (process.argv[2] === 'apply') {
      const head = yield* git(['rev-parse', 'HEAD'], root);
      const artifactText = yield* read(resolve(root, '.artifacts/client-update/update.json'));
      const version = yield* applyArtifact(
        root,
        yield* checked(() => JSON.parse(artifactText)),
        head.stdout.trim()
      );
      yield* output('version', version);
    } else
      return yield* Effect.fail(
        new ClientUpdateValidationError({
          message: 'Usage: bun scripts/update-composio-client.ts prepare|apply',
        })
      );
  });
  BunRuntime.runMain(
    main.pipe(
      Effect.tapError(error => Effect.sync(() => console.error(error.message))),
      Effect.provide(BunFileSystem.layer)
    ),
    {
      disableErrorReporting: true,
    }
  );
}
