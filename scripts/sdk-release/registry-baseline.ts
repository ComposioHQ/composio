import { Effect, Path, Schema } from 'effect';
import { getPackages } from '@manypkg/get-packages';
import semver from 'semver';
import { discoverPythonPackages } from './python-metadata';
import { ensure, fromPromise, getJson, readJson } from './runtime';

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
