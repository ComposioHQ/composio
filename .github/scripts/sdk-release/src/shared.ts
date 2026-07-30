import {
  Command,
  CommandExecutor,
  FileSystem,
  HttpClient,
  HttpClientRequest,
} from '@effect/platform';
import { Data, Effect, Option, Schema, Stream } from 'effect';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export const repoRoot = resolve(import.meta.dir, '../../../..');
export const draftPath = resolve(repoRoot, '.github/sdk-release/draft.mdx');
export const changelogDir = resolve(repoRoot, 'docs/content/changelog');

export class ExecError extends Data.TaggedError('ExecError')<{
  readonly command: string;
  readonly exitCode: number;
}> {}

export class RegistryError extends Data.TaggedError('RegistryError')<{
  readonly url: string;
  readonly status: number;
}> {}

/** Run a command from the repo root, streaming stderr through; fails on non-zero exit. */
export const exec = (executable: string, ...args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;
    const process = yield* executor.start(
      Command.make(executable, ...args).pipe(
        Command.workingDirectory(repoRoot),
        Command.stderr('inherit')
      )
    );
    const stdout = yield* process.stdout.pipe(Stream.decodeText(), Stream.mkString);
    const exitCode = yield* process.exitCode;
    return exitCode === 0
      ? stdout
      : yield* new ExecError({ command: [executable, ...args].join(' '), exitCode });
  }).pipe(Effect.scoped);

/** True when the URL serves the artifact (200), false when the registry has no such version (404). */
export const urlExists = (url: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.execute(HttpClientRequest.get(url));
    if (response.status === 200) return true;
    if (response.status === 404) return false;
    return yield* new RegistryError({ url, status: response.status });
  }).pipe(Effect.scoped, Effect.timeout('30 seconds'), Effect.retry({ times: 2 }));

export const npmVersionUrl = (name: string, version: string) =>
  `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`;

export const pypiVersionUrl = (name: string, version: string) =>
  `https://pypi.org/pypi/${name}/${version}/json`;

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

const PackageJson = Schema.parseJson(
  Schema.Struct({
    name: Schema.String,
    version: Schema.String,
    private: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  })
);

const PnpmProjects = Schema.parseJson(Schema.Array(Schema.Struct({ path: Schema.String })));

const ChangesetConfig = Schema.parseJson(
  Schema.Struct({ ignore: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }) })
);

export interface SdkPackage {
  readonly name: string;
  readonly version: string;
  readonly dir: string;
}

/**
 * Every workspace package that publishes to npm: public in its package.json and
 * not on the Changesets ignore list (the CLI releases through its own binary pipeline).
 */
export const publishablePackages = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const config = yield* fs
    .readFileString(resolve(repoRoot, '.changeset/config.json'))
    .pipe(Effect.flatMap(Schema.decodeUnknown(ChangesetConfig)));
  const ignored = new Set(config.ignore);
  const projects = yield* exec('pnpm', 'm', 'ls', '--json', '--depth', '-1').pipe(
    Effect.flatMap(Schema.decodeUnknown(PnpmProjects))
  );
  const packages: Array<SdkPackage> = [];
  for (const project of projects) {
    const decoded = yield* fs
      .readFileString(resolve(project.path, 'package.json'))
      .pipe(Effect.flatMap(Schema.decodeUnknown(PackageJson)), Effect.option);
    if (Option.isSome(decoded) && !decoded.value.private && !ignored.has(decoded.value.name)) {
      packages.push({
        name: decoded.value.name,
        version: decoded.value.version,
        dir: project.path,
      });
    }
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
});

export const pyprojectPath = resolve(repoRoot, 'python/pyproject.toml');
export const pyVersionFilePath = resolve(repoRoot, 'python/composio/__version__.py');

/** Name and version of the Python SDK, read from python/pyproject.toml. */
export const pythonPackage = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const pyproject = yield* fs.readFileString(pyprojectPath);
  const name = pyproject.match(/^name = "([^"]+)"$/m)?.[1];
  const version = pyproject.match(/^version = "([^"]+)"$/m)?.[1];
  if (name === undefined || version === undefined) {
    return yield* Effect.fail(
      new ExecError({ command: 'parse python/pyproject.toml', exitCode: 1 })
    );
  }
  return { name, version };
});
