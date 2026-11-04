import { Effect, FileSystem, Path, Schema } from 'effect';
import { Yaml } from 'effect/encoding';
import { getPackages } from '@manypkg/get-packages';
import semver from 'semver';
import { PYTHON_RELEASE_MARKER } from './lanes';
import { createSdkReleasePlan, type ReleaseChoice } from './plan';
import { discoverPythonPackages } from './python-metadata';
import { ensure, fromPromise, getJson, readJson, writeFile } from './runtime';

const Workspace = Schema.StructWithRest(Schema.Struct({ packages: Schema.Array(Schema.String) }), [
  Schema.Record(Schema.String, Schema.Unknown),
]);
const RootManifest = Schema.StructWithRest(
  Schema.Struct({ workspaces: Schema.optionalKey(Schema.Array(Schema.String)) }),
  [Schema.Record(Schema.String, Schema.Unknown)]
);
const ChangesetConfig = Schema.StructWithRest(
  Schema.Struct({
    ignore: Schema.Array(Schema.String).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
);
const NpmLatest = Schema.Struct({ version: Schema.String });
const PypiReleases = Schema.Struct({
  releases: Schema.Record(
    Schema.String,
    Schema.Array(
      Schema.Struct({
        yanked: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
      })
    )
  ),
});

const isStable = (version: string) =>
  semver.valid(version) !== null && semver.prerelease(version) === null;
const BASELINE_FAILURE = 'Registry baseline lookup failed';

const npmBaseline = (name: string) =>
  Effect.gen(function* () {
    const { version } = yield* getJson(
      `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
      NpmLatest,
      BASELINE_FAILURE
    );
    yield* ensure(isStable(version), `Expected a stable npm baseline for ${name}`);
    return [name, version] as const;
  });

const pypiBaseline = (name: string) =>
  Effect.gen(function* () {
    const { releases } = yield* getJson(
      `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
      PypiReleases,
      BASELINE_FAILURE
    );
    const published = Object.entries(releases)
      .filter(([version, files]) => isStable(version) && files.some(file => !file.yanked))
      .map(([version]) => version);
    const [version] = semver.rsort(published);
    yield* ensure(version !== undefined, `No public stable PyPI baseline for ${name}`);
    return [name, version] as const;
  });

export const fetchStableRegistryBaseline = (cwd: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const { packages } = yield* fromPromise(() => getPackages(cwd));
    const config = yield* readJson(ChangesetConfig, path.resolve(cwd, '.changeset/config.json'));
    const python = yield* discoverPythonPackages(cwd);
    const npm = packages
      .map(pkg => pkg.packageJson)
      .filter(
        manifest =>
          !manifest.private &&
          manifest.name.startsWith('@composio/') &&
          !config.ignore.includes(manifest.name)
      );
    const entries = yield* Effect.all(
      [
        ...npm.map(manifest => npmBaseline(manifest.name)),
        ...python.map(pkg => pypiBaseline(pkg.name)),
      ],
      { concurrency: 'unbounded' }
    );
    return Object.fromEntries(entries);
  });

const parseYaml = (contents: string) => Effect.try(() => Yaml.parse(contents));

/** Assembles the future cross-language plan in a scratch copy, without activating the marker in source. */
export const createPilotPlan = (
  cwd: string,
  choices: { typescript: ReleaseChoice; python: ReleaseChoice }
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const baseline = yield* fetchStableRegistryBaseline(cwd);
      const temporary = yield* fs.makeTempDirectoryScoped({ prefix: 'composio-sdk-preview-' });
      const scratch = (file: string) => path.resolve(temporary, file);
      const copy = (file: string) =>
        Effect.gen(function* () {
          yield* fs.makeDirectory(path.dirname(scratch(file)), { recursive: true });
          yield* fs.copyFile(path.resolve(cwd, file), scratch(file));
        });
      const { packages } = yield* fromPromise(() => getPackages(cwd));
      for (const pkg of packages)
        yield* copy(path.relative(cwd, path.resolve(pkg.dir, 'package.json')));
      const root = yield* readJson(RootManifest, path.resolve(cwd, 'package.json'));
      yield* writeFile(
        scratch('package.json'),
        JSON.stringify({ ...root, workspaces: [...(root.workspaces ?? []), 'python'] })
      );
      const workspace = yield* Schema.decodeUnknownEffect(Workspace)(
        yield* parseYaml(yield* fs.readFileString(path.resolve(cwd, 'pnpm-workspace.yaml')))
      );
      yield* writeFile(
        scratch('pnpm-workspace.yaml'),
        JSON.stringify({ ...workspace, packages: [...workspace.packages, 'python'] })
      );
      const changesetInputs = (yield* fs.readDirectory(path.resolve(cwd, '.changeset'))).filter(
        entry => entry.endsWith('.md') || entry === 'config.json' || entry === 'pre.json'
      );
      for (const entry of changesetInputs) yield* copy(`.changeset/${entry}`);
      const config = yield* readJson(ChangesetConfig, path.resolve(cwd, '.changeset/config.json'));
      yield* writeFile(
        scratch('.changeset/config.json'),
        JSON.stringify({ ...config, privatePackages: { version: true, tag: false } })
      );
      const python = yield* discoverPythonPackages(cwd);
      for (const pkg of python) {
        yield* copy(`${pkg.directory}/pyproject.toml`);
        if (pkg.directory !== 'python') yield* copy(`${pkg.directory}/setup.py`);
      }
      yield* copy('python/composio/__version__.py');
      yield* writeFile(
        scratch('python/package.json'),
        JSON.stringify({ name: PYTHON_RELEASE_MARKER, private: true, version: python[0].version })
      );
      return yield* createSdkReleasePlan(temporary, { ...choices, baseline });
    })
  );
