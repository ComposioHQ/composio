import { Effect, FileSystem, Path, Schema } from 'effect';
import { Toml } from 'effect/encoding';
import semver from 'semver';
import { ensure, fail, readFile, spawn, withoutReleaseTokens, writeFile } from './runtime';

const PyProject = Schema.Struct({
  project: Schema.Struct({ name: Schema.String, version: Schema.String }),
});

export interface PythonReleasePackage {
  readonly name: string;
  readonly version: string;
  readonly directory: string;
}

export interface PythonMetadataOptions {
  readonly updateLockfile?: boolean;
}

const CORE_DIRECTORY = 'python';
const PROVIDERS_DIRECTORY = 'python/providers';
const RUNTIME_VERSION_PATH = 'python/composio/__version__.py';

/** Each pattern captures `(prefix)(quote)(version)`. */
export const PROJECT_VERSION = /(^\[project\][\s\S]*?^version\s*=\s*)(["'])([^"']+)\2/m;
export const SETUP_VERSION = /(\bversion\s*=\s*)(["'])([^"']+)\2/;
export const RUNTIME_VERSION = /(^\s*__version__\s*=\s*)(["'])([^"']+)\2/m;

const mirroredVersion = (contents: string, pattern: RegExp) => contents.match(pattern)?.[3];
const withVersion = (contents: string, pattern: RegExp, version: string) =>
  contents.replace(
    pattern,
    (_match, prefix: string, quote: string) => `${prefix}${quote}${version}${quote}`
  );

/** Providers mirror their version in setup.py; the core package keeps it in pyproject.toml only. */
const hasSetupMirror = (directory: string) => directory !== CORE_DIRECTORY;

const parsePyProject = (contents: string) =>
  Effect.fromResult(Toml.parse(contents)).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(PyProject))
  );

const providerDirectories = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs
      .readDirectory(path.resolve(cwd, PROVIDERS_DIRECTORY))
      .pipe(Effect.catchReason('PlatformError', 'NotFound', () => Effect.succeed([])));
    const candidates = entries
      .toSorted((a, b) => a.localeCompare(b))
      .map(entry => `${PROVIDERS_DIRECTORY}/${entry}`);
    return yield* Effect.filter(candidates, directory =>
      Effect.gen(function* () {
        const info = yield* fs.stat(path.resolve(cwd, directory));
        return (
          info.type === 'Directory' &&
          (yield* fs.exists(path.resolve(cwd, directory, 'pyproject.toml')))
        );
      })
    );
  });

const readPackage = (cwd: string, directory: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const project = yield* parsePyProject(
      yield* readFile(path.resolve(cwd, directory, 'pyproject.toml'))
    );
    if (hasSetupMirror(directory)) {
      const setupPath = `${directory}/setup.py`;
      const setup = yield* readFile(path.resolve(cwd, setupPath));
      yield* ensure(
        mirroredVersion(setup, SETUP_VERSION) === project.project.version,
        `Python version mirror mismatch in ${setupPath}`
      );
    }
    return {
      name: project.project.name.toLowerCase().replace(/[-_.]+/g, '-'),
      version: project.project.version,
      directory,
    } satisfies PythonReleasePackage;
  });

export const discoverPythonPackages = (cwd: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const directories = [CORE_DIRECTORY, ...(yield* providerDirectories(cwd))];
    const packages = yield* Effect.forEach(directories, directory => readPackage(cwd, directory), {
      concurrency: 'unbounded',
    });
    const runtime = yield* readFile(path.resolve(cwd, RUNTIME_VERSION_PATH));
    yield* ensure(
      mirroredVersion(runtime, RUNTIME_VERSION) === packages[0].version,
      `Python version mirror mismatch in ${RUNTIME_VERSION_PATH}`
    );
    return packages;
  });

interface Edit {
  readonly path: string;
  readonly contents: string;
}

const editVersion = (absolutePath: string, pattern: RegExp, version: string, missing: string) =>
  Effect.gen(function* () {
    const contents = yield* readFile(absolutePath);
    yield* ensure(pattern.test(contents), missing);
    const updated = withVersion(contents, pattern, version);
    return updated === contents
      ? undefined
      : ({ path: absolutePath, contents: updated } satisfies Edit);
  });

const editPyProject = (absolutePath: string, directory: string, version: string) =>
  Effect.gen(function* () {
    const contents = yield* readFile(absolutePath);
    const updated = withVersion(contents, PROJECT_VERSION, version);
    const project = yield* parsePyProject(updated);
    yield* ensure(
      project.project.version === version,
      `Cannot update Python project version in ${directory}/pyproject.toml`
    );
    return updated === contents
      ? undefined
      : ({ path: absolutePath, contents: updated } satisfies Edit);
  });

const lockWorkspace = (cwd: string) =>
  spawn('uv', ['lock'], { cwd, env: withoutReleaseTokens }).pipe(
    Effect.mapError(error => error.message),
    Effect.flatMap(result =>
      result.exitCode === 0 ? Effect.void : Effect.fail(result.stderr || 'unknown failure')
    ),
    Effect.catch(detail => fail(`uv lock failed: ${detail}`))
  );

export const synchronizePythonMetadata = (
  cwd: string,
  version: string,
  options: PythonMetadataOptions = {}
) =>
  Effect.gen(function* () {
    yield* ensure(
      semver.valid(version) !== null && semver.prerelease(version) === null,
      `Python stable release requires a stable semantic version, received ${version}`
    );
    const path = yield* Path.Path;
    const packages = yield* discoverPythonPackages(cwd);
    const edits: Array<Edit | undefined> = [];
    for (const pkg of packages) {
      edits.push(
        yield* editPyProject(
          path.resolve(cwd, pkg.directory, 'pyproject.toml'),
          pkg.directory,
          version
        )
      );
      if (hasSetupMirror(pkg.directory))
        edits.push(
          yield* editVersion(
            path.resolve(cwd, pkg.directory, 'setup.py'),
            SETUP_VERSION,
            version,
            `Cannot find provider setup version in ${pkg.directory}/setup.py`
          )
        );
    }
    edits.push(
      yield* editVersion(
        path.resolve(cwd, RUNTIME_VERSION_PATH),
        RUNTIME_VERSION,
        version,
        'Cannot find Python runtime __version__'
      )
    );
    const changed = edits.filter(edit => edit !== undefined);
    yield* Effect.forEach(changed, edit => writeFile(edit.path, edit.contents), { discard: true });
    const changedPaths = changed.map(edit => path.relative(cwd, edit.path));
    if (options.updateLockfile === false) return changedPaths;
    yield* lockWorkspace(cwd);
    return [...changedPaths, 'uv.lock'];
  });
