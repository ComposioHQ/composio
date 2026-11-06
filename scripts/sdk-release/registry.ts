import { Config, Data, Effect, FileSystem, Option, Path, Schedule, Schema, Stdio } from 'effect';
import type { Duration } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import semver from 'semver';
import {
  ActionArtifact,
  ApprovedCandidates,
  CANDIDATE_MANIFEST,
  CandidateManifest,
  candidateArtifactName,
  downloadCandidate,
  readCandidateFiles,
  reuseCandidate,
  verifyCandidateFiles,
  type CandidateFile,
} from './artifacts';
import { GitHub, REPOSITORY_PATH, Sha, request } from './github';
import { NPM_REGISTRY, REGISTRY_LANES, Language, type Language as Lang } from './lanes';
import { discoverPythonPackages } from './python-metadata';
import {
  appendFile,
  ensure,
  fail,
  parseJson,
  readJson,
  run,
  runMain,
  sha256Hex,
  withoutReleaseTokens,
} from './runtime';
import { BATCH_PATH, ReleaseBatch, batchLanguages } from './source';

/** One reviewed distribution file: an npm tarball or a Python wheel/sdist. */
export interface Distribution {
  readonly language: Lang;
  readonly name: string;
  readonly version: string;
  readonly file: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

export interface StableTag {
  readonly name: string;
  readonly version: string;
}

/** What the registries already serve, what they are missing, and which `latest` tags lag. */
export interface RegistryState {
  readonly existing: ReadonlyArray<Distribution>;
  readonly missing: ReadonlyArray<Distribution>;
  readonly tagsToRepair: ReadonlyArray<StableTag>;
}

const REGISTRY_TIMEOUT = '30 seconds';

const Url = Schema.String.check(
  Schema.makeFilter(value => (URL.canParse(value) ? undefined : 'Expected a URL'))
);

const isSuccess = (status: number) => status >= 200 && status < 300;

const registryGet = (url: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return yield* client.get(url);
  }).pipe(Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }));

/** A registry that does not yet serve something it should; propagation may still fix it. */
class RegistryIncomplete extends Data.TaggedError('RegistryIncomplete')<{
  readonly message: string;
}> {}
const incomplete = (condition: boolean, message: string) =>
  condition ? Effect.void : Effect.fail(new RegistryIncomplete({ message }));

/** Registry metadata at `url`, or `None` when the registry answers 404. */
const registryJson = <S extends Schema.Top>(url: string, schema: S) =>
  Effect.gen(function* () {
    const response = yield* registryGet(url);
    if (response.status === 404) return Option.none<S['Type']>();
    yield* incomplete(
      isSuccess(response.status),
      `Registry lookup incomplete: ${url} (${response.status})`
    );
    return Option.some(yield* parseJson(schema, yield* response.text));
  }).pipe(Effect.timeout(REGISTRY_TIMEOUT));

const registryBytes = (url: string, failure: (status: number) => string) =>
  Effect.gen(function* () {
    const response = yield* registryGet(url);
    yield* incomplete(isSuccess(response.status), failure(response.status));
    return new Uint8Array(yield* response.arrayBuffer);
  }).pipe(Effect.timeout(REGISTRY_TIMEOUT));

const servedBy = (language: Lang, url: string) =>
  URL.canParse(url) &&
  new URL(url).protocol === 'https:' &&
  new URL(url).hostname === REGISTRY_LANES[language].downloadHost;

/** A file the registry already serves must be byte for byte the reviewed candidate. */
const verifyOriginalBytes = (url: string, file: Distribution) =>
  Effect.gen(function* () {
    yield* ensure(servedBy(file.language, url), `Unexpected registry download host: ${file.file}`);
    const bytes = yield* registryBytes(
      url,
      status => `Registry download incomplete: ${file.file} (${status})`
    );
    yield* ensure(
      bytes.length === file.bytes.length && (yield* sha256Hex(bytes)) === file.sha256,
      `Registry content conflict: ${file.name}@${file.version}/${file.file} differs from the approved candidate. Published files are never replaced; release a new version.`
    );
  });

const PypiVersion = Schema.Struct({
  urls: Schema.Array(
    Schema.Struct({
      filename: Schema.String,
      url: Url,
      digests: Schema.Struct({ sha256: Schema.String }),
    })
  ),
});
const NpmVersion = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  dist: Schema.Struct({ tarball: Url }),
});
const NpmLatest = Schema.Struct({ version: Schema.String });
const PackageIdentity = Schema.Struct({ name: Schema.String, version: Schema.String });

const pythonDistributionNames = (name: string, version: string) => {
  const prefix = `${name.replaceAll('-', '_')}-${version}`;
  return [`${prefix}-py3-none-any.whl`, `${prefix}.tar.gz`];
};

interface LoadedCandidate {
  readonly cwd: string;
  readonly batch: ReleaseBatch;
  readonly directory: string;
  readonly manifest: CandidateManifest;
  readonly bytes: ReadonlyMap<string, Uint8Array>;
}

const distributionOf = (
  language: Lang,
  identity: { name: string; version: string },
  entry: CandidateFile,
  bytes: ReadonlyMap<string, Uint8Array>
): Distribution => ({
  language,
  name: identity.name,
  version: identity.version,
  file: entry.name,
  bytes: bytes.get(entry.name) ?? new Uint8Array(),
  sha256: entry.sha256,
});

/** npm: one tarball per package version and a stable `latest` tag. */
const npmAdapter = {
  reconcileGroup: (group: ReadonlyArray<Distribution>) =>
    Effect.gen(function* () {
      yield* ensure(group.length === 1, 'Expected exactly one npm tarball per package');
      const [file] = group;
      const metadata = yield* registryJson(
        REGISTRY_LANES.typescript.versionUrl(file.name, file.version),
        NpmVersion
      );
      if (Option.isSome(metadata)) {
        const { name, version, dist } = metadata.value;
        yield* ensure(
          name === file.name && version === file.version,
          'Registry npm identity conflict'
        );
        yield* verifyOriginalBytes(dist.tarball, file);
      }
      const latest = yield* registryJson(
        `${NPM_REGISTRY}/${encodeURIComponent(file.name)}/latest`,
        NpmLatest
      );
      const tagged = Option.getOrUndefined(Option.map(latest, value => value.version));
      yield* ensure(
        tagged === undefined || semver.valid(tagged) !== null,
        `Invalid stable npm tag: ${file.name}`
      );
      return {
        existing: Option.isSome(metadata) ? [file] : [],
        missing: Option.isSome(metadata) ? [] : [file],
        tagsToRepair:
          tagged === undefined || semver.lt(tagged, file.version)
            ? [{ name: file.name, version: file.version }]
            : [],
      } satisfies RegistryState;
    }),
  candidateDistributions: (candidate: LoadedCandidate) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const releases = candidate.batch.plan.releases.filter(
        release => release.language === 'typescript'
      );
      const files: Distribution[] = [];
      for (const entry of candidate.manifest.files) {
        const manifest = yield* parseJson(
          PackageIdentity,
          yield* run(
            'tar',
            ['-xOf', path.join(candidate.directory, entry.name), 'package/package.json'],
            { cwd: candidate.cwd, env: withoutReleaseTokens }
          )
        );
        yield* ensure(
          releases.some(
            release => release.name === manifest.name && release.newVersion === manifest.version
          ),
          'Candidate contains an unplanned npm package'
        );
        files.push(distributionOf('typescript', manifest, entry, candidate.bytes));
      }
      yield* ensure(
        candidate.manifest.files.length === releases.length,
        'Candidate npm package inventory differs'
      );
      return files;
    }),
};

/** PyPI: a wheel and sdist for every package of the synchronized Python train. */
const pythonAdapter = {
  reconcileGroup: (group: ReadonlyArray<Distribution>) =>
    Effect.gen(function* () {
      const [first] = group;
      const metadata = yield* registryJson(
        REGISTRY_LANES.python.versionUrl(first.name, first.version),
        PypiVersion
      );
      const published = Option.match(metadata, { onNone: () => [], onSome: value => value.urls });
      yield* ensure(
        new Set(published.map(file => file.filename)).size === published.length &&
          published.every(file => group.some(candidate => candidate.file === file.filename)),
        `Unreviewed PyPI file for ${first.name}@${first.version}; release a new version`
      );
      const existing: Distribution[] = [];
      const missing: Distribution[] = [];
      for (const file of group) {
        const match = published.find(item => item.filename === file.file);
        if (!match) {
          missing.push(file);
          continue;
        }
        yield* ensure(
          match.digests.sha256 === file.sha256,
          `Registry content conflict: ${file.file}`
        );
        yield* verifyOriginalBytes(match.url, file);
        existing.push(file);
      }
      return { existing, missing, tagsToRepair: [] } satisfies RegistryState;
    }),
  candidateDistributions: (candidate: LoadedCandidate) =>
    Effect.gen(function* () {
      const release = candidate.batch.plan.releases.find(entry => entry.language === 'python');
      const version = release?.newVersion ?? '';
      const files: Distribution[] = [];
      for (const pkg of yield* discoverPythonPackages(candidate.cwd))
        for (const name of pythonDistributionNames(pkg.name, version)) {
          const entry = candidate.manifest.files.find(file => file.name === name);
          if (!entry) return yield* fail(`Original Python distribution missing: ${name}`);
          files.push(distributionOf('python', { name: pkg.name, version }, entry, candidate.bytes));
        }
      yield* ensure(
        candidate.manifest.files.length === files.length,
        'Candidate Python file inventory differs'
      );
      return files;
    }),
};

const REGISTRY_ADAPTERS = { typescript: npmAdapter, python: pythonAdapter } as const;

/** Splits reviewed files into those the registry already serves and those still missing. */
export const reconcileRegistry = (files: ReadonlyArray<Distribution>) =>
  Effect.gen(function* () {
    const groups = Map.groupBy(files, file => `${file.language}:${file.name}@${file.version}`);
    const states: ReadonlyArray<RegistryState> = yield* Effect.forEach(groups.values(), group =>
      REGISTRY_ADAPTERS[group[0].language].reconcileGroup(group)
    );
    return {
      existing: states.flatMap(state => state.existing),
      missing: states.flatMap(state => state.missing),
      tagsToRepair: states.flatMap(state => state.tagsToRepair),
    } satisfies RegistryState;
  });

const incompleteInventory = (state: RegistryState, stableTags: boolean) =>
  [
    ...state.missing.map(file => `${file.name}@${file.version}/${file.file}`),
    ...(stableTags ? state.tagsToRepair : []).map(tag => `${tag.name}@${tag.version} stable tag`),
  ].join(', ');

/**
 * Polls the registries until every file is visible, and every stable tag too unless
 * `stableTags` is false (right after an upload, before `latest` moves).
 */
export const waitForRegistry = (
  files: ReadonlyArray<Distribution>,
  options: {
    readonly attempts?: number;
    readonly spacing?: Duration.Input;
    readonly stableTags?: boolean;
  } = {}
) => {
  const attempts = options.attempts ?? 6;
  return reconcileRegistry(files).pipe(
    Effect.flatMap(state => {
      const missing = incompleteInventory(state, options.stableTags ?? true);
      return missing
        ? Effect.fail(new RegistryIncomplete({ message: missing }))
        : Effect.succeed(state);
    }),
    Effect.retry({
      schedule: Schedule.spaced(options.spacing ?? '10 seconds'),
      times: attempts - 1,
      while: error => error instanceof RegistryIncomplete,
    }),
    Effect.catchTag('RegistryIncomplete', error =>
      Effect.fail(
        new RegistryIncomplete({
          message: `Registry verification incomplete after ${attempts} attempts: ${error.message}`,
        })
      )
    )
  );
};

/**
 * Downloads the approved release-PR artifact pinned for `language` and checks its files
 * against the manifest the release-PR build recorded.
 */
export const loadOriginalDistributions = (
  cwd: string,
  batch: ReleaseBatch,
  sha: string,
  approved: ApprovedCandidates,
  language: Lang
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const pinned = approved[language];
    if (pinned === undefined)
      return yield* fail(`No approved ${language} candidate was pinned for this run`);
    const listed = yield* request(
      'GET',
      `${REPOSITORY_PATH}/actions/artifacts/${pinned.artifactId}`,
      ActionArtifact
    );
    const reused = yield* reuseCandidate(
      [listed],
      candidateArtifactName(language),
      pinned.run,
      sha
    );
    if (Option.isNone(reused) || reused.value.digest !== pinned.digest)
      return yield* fail(
        `The approved ${language} candidate artifact ${pinned.artifactId} changed; release a new version`
      );
    const directory = path.resolve(cwd, 'sdk-publication', language);
    yield* fs.remove(directory, { recursive: true, force: true });
    yield* downloadCandidate(reused.value, directory);
    const manifest = yield* readJson(CandidateManifest, path.join(directory, CANDIDATE_MANIFEST));
    yield* ensure(
      manifest.sourceSha === sha &&
        manifest.producerRun === pinned.run &&
        manifest.language === language,
      'Original candidate producer/source conflict'
    );
    const bytes = yield* readCandidateFiles(directory);
    yield* verifyCandidateFiles(bytes, manifest.files);
    return yield* REGISTRY_ADAPTERS[language].candidateDistributions({
      cwd,
      batch,
      directory,
      manifest,
      bytes,
    });
  });

/** Publishes under a release-only dist-tag, then moves `latest` once the upload is visible. */
const publishNpm = (cwd: string, batch: ReleaseBatch, files: ReadonlyArray<Distribution>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const npm = (args: ReadonlyArray<string>) =>
      run('npm', args, { cwd, env: withoutReleaseTokens });
    for (const file of (yield* reconcileRegistry(files)).missing)
      yield* npm([
        'publish',
        path.resolve(cwd, 'sdk-publication/typescript', file.file),
        '--ignore-scripts',
        '--provenance',
        '--access=public',
        `--tag=sdk-release-${batch.id}`,
      ]);
    const visible = yield* waitForRegistry(files, { stableTags: false });
    for (const tag of visible.tagsToRepair)
      yield* npm(['dist-tag', 'add', `${tag.name}@${tag.version}`, 'latest']);
    yield* waitForRegistry(files);
  });

/** Stages only the missing Python files for the trusted-publisher upload step. */
const stageMissingPython = (cwd: string, files: ReadonlyArray<Distribution>, output: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = path.resolve(cwd, 'sdk-publication/missing-python');
    yield* fs.remove(directory, { recursive: true, force: true });
    yield* fs.makeDirectory(directory, { recursive: true });
    const { missing } = yield* reconcileRegistry(files);
    for (const file of missing) yield* fs.writeFile(path.join(directory, file.file), file.bytes);
    yield* appendFile(output, `missing=${missing.length > 0}\n`);
  });

const Environment = Config.all({
  token: Config.schema(Schema.NonEmptyString, 'SDK_READ_TOKEN'),
  sha: Config.schema(Sha, 'GITHUB_SHA'),
  ref: Config.String('GITHUB_REF'),
  output: Config.String('GITHUB_OUTPUT'),
  approved: Config.schema(Schema.fromJsonString(ApprovedCandidates), 'APPROVED_CANDIDATES'),
});

const Arguments = Schema.Tuple([Schema.Literals(['publish', 'verify']), Language]);

/**
 * `registry.ts publish typescript` uploads to npm and moves `latest`; `publish python` stages
 * the missing PyPI files for the upload action; `verify <language>` waits until every file is
 * served.
 */
const main = Effect.gen(function* () {
  const [mode, language] = yield* Schema.decodeUnknownEffect(Arguments)(
    yield* (yield* Stdio.Stdio).args
  );
  const env = yield* Environment;
  yield* ensure(
    env.ref.startsWith('refs/tags/sdk-release/'),
    'Registry jobs require a release tag'
  );
  const cwd = (yield* Path.Path).resolve('.');
  const batch = yield* readJson(ReleaseBatch, BATCH_PATH);
  yield* ensure(batchLanguages(batch).has(language), `This release plans no ${language} packages`);
  const files = yield* loadOriginalDistributions(cwd, batch, env.sha, env.approved, language).pipe(
    Effect.provide(GitHub.layer(env.token))
  );
  if (mode === 'verify') return yield* waitForRegistry(files);
  if (language === 'typescript') return yield* publishNpm(cwd, batch, files);
  yield* stageMissingPython(cwd, files, env.output);
});

if (import.meta.main) runMain(main);
