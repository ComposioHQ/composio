import { Config, Effect, FileSystem, Option, Path, Schema, Stdio } from 'effect';
import { getPackages } from '@manypkg/get-packages';
import {
  ActionArtifact,
  CANDIDATE_MANIFEST,
  CandidateManifest,
  candidateArtifactName,
  normalizeArtifactDigest,
  reuseCandidate,
} from './artifacts';
import {
  GitHub,
  PositiveIntFromString,
  REPOSITORY_PATH,
  Sha,
  request,
} from './github';
import { Language } from './lanes';
import type { SdkRelease } from './plan';
import { discoverPythonPackages } from './python-metadata';
import {
  appendFile,
  ensure,
  formatJson,
  fromPromise,
  inDirectory,
  readJson,
  runMain,
  sha256Hex,
  type ReleaseServices,
} from './runtime';
import { BATCH_PATH, ReleaseBatch } from './source';

const PackedManifest = Schema.StructWithRest(
  Schema.Struct({ name: Schema.String, version: Schema.String }),
  [Schema.Record(Schema.String, Schema.Unknown)]
);

export const tarballName = (name: string, version: string) =>
  `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`;

/**
 * Builds the SDK packages and packs the selected ones into `directory`. Provider compatibility is
 * checked by ts.test.yml; this job runs no registry installs before the files are hashed.
 */
export const buildTypescript = (cwd: string, directory: string, names: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const exec = inDirectory(cwd);
    const { packages } = yield* fromPromise(() => getPackages(cwd));
    const selected = packages.filter(pkg => names.has(pkg.packageJson.name));
    yield* exec('pnpm', [
      'exec',
      'turbo',
      'build',
      ...selected.map(pkg => `--filter=${pkg.packageJson.name}`),
    ]);
    for (const pkg of selected) {
      yield* exec('pnpm', [
        '--dir',
        pkg.dir,
        'pack',
        '--pack-destination',
        directory,
        '--config.ignore-scripts=true',
      ]);
      const name = tarballName(pkg.packageJson.name, pkg.packageJson.version);
      const packed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PackedManifest))(
        yield* exec('tar', ['-xOf', path.join(directory, name), 'package/package.json'])
      );
      yield* ensure(
        packed.name === pkg.packageJson.name && packed.version === pkg.packageJson.version,
        'Packed npm metadata differs from the approved source'
      );
    }
  });

const PYTHON_DISTRIBUTION = /\.whl$|\.tar\.gz$/;

/** Builds the synchronized Python train with the locked release toolchain and keeps its distributions. */
export const buildPython = (cwd: string, directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const environment = { UV_PROJECT_ENVIRONMENT: path.resolve(cwd, 'python/.venv') };
    const exec = inDirectory(cwd, environment);
    yield* exec('uv', ['sync', '--locked', '--only-group', 'release']);
    yield* inDirectory(path.join(cwd, 'python'), environment)('make', [
      'build',
      'BUILD_ARGS=--no-isolation',
    ]);
    yield* exec('uv', [
      'run',
      '--locked',
      '--only-group',
      'release',
      'python',
      'scripts/sdk-release/validate-python-candidates.py',
    ]);
    const dist = path.resolve(cwd, 'python/dist');
    for (const name of (yield* fs.readDirectory(dist)).filter(name =>
      PYTHON_DISTRIBUTION.test(name)
    ))
      yield* fs.copyFile(path.join(dist, name), path.join(directory, name));
  });

/** Lane-specific source checks and builds for a fresh candidate. */
const LANE_BUILDS: Record<
  Language,
  {
    readonly verifyTrain: (
      cwd: string,
      selected: ReadonlyArray<SdkRelease>
    ) => Effect.Effect<void, unknown, ReleaseServices>;
    readonly build: (
      cwd: string,
      directory: string,
      selected: ReadonlyArray<SdkRelease>
    ) => Effect.Effect<void, unknown, ReleaseServices>;
  }
> = {
  typescript: {
    verifyTrain: () => Effect.void,
    build: (cwd, directory, selected) =>
      buildTypescript(cwd, directory, new Set(selected.map(release => release.name))),
  },
  python: {
    verifyTrain: (cwd, selected) =>
      Effect.gen(function* () {
        const [release] = selected;
        const python = yield* discoverPythonPackages(cwd);
        yield* ensure(
          python.every(pkg => pkg.version === release.newVersion),
          'Python candidate train differs from the approved target'
        );
      }),
    build: (cwd, directory) => buildPython(cwd, directory),
  },
};

const BuildEnvironment = Config.all({
  runId: Config.schema(PositiveIntFromString, 'GITHUB_RUN_ID'),
  /** The release PR head; on pull_request, GITHUB_SHA is the merge commit instead. */
  sha: Config.schema(Sha, 'SDK_SOURCE_SHA'),
  ref: Config.String('GITHUB_REF'),
  outputPath: Config.String('GITHUB_OUTPUT'),
  controllerToken: Config.option(Config.String('SDK_RELEASE_TOKEN')),
});
type BuildEnvironment = Config.Success<typeof BuildEnvironment>;

/** Release-PR runs build candidates; source-tag runs publish the approved release-PR bytes. */
const isSourceTag = (ref: string) => ref.startsWith('refs/tags/sdk-release/');

/** Builds a release-PR candidate. */
const buildCandidate = (
  env: BuildEnvironment,
  language: Language,
  selected: ReadonlyArray<SdkRelease>
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cwd = path.resolve('.');
    const directory = path.resolve('sdk-candidate', language);
    yield* fs.makeDirectory(directory, { recursive: true });
    const lane = LANE_BUILDS[language];
    yield* lane.verifyTrain(cwd, selected);
    const { packages } = yield* fromPromise(() => getPackages(cwd));
    for (const release of selected) {
      const pkg = packages.find(candidate => candidate.packageJson.name === release.name);
      yield* ensure(
        pkg?.packageJson.version === release.newVersion,
        `Candidate version differs from approved target: ${release.name}`
      );
    }
    yield* lane.build(cwd, directory, selected);
    const files = yield* Effect.forEach(yield* fs.readDirectory(directory), name =>
      Effect.gen(function* () {
        const bytes = yield* fs.readFile(`${directory}/${name}`);
        return { name, sha256: yield* sha256Hex(bytes), size: bytes.length };
      })
    );
    const manifest = yield* Schema.decodeUnknownEffect(CandidateManifest)({
      sourceSha: env.sha,
      producerRun: env.runId,
      language,
      files,
    });
    yield* fs.writeFileString(`${directory}/${CANDIDATE_MANIFEST}`, formatJson(manifest));
    yield* appendFile(env.outputPath, 'selected=true\n');
  });

const buildMode = (language: Language) =>
  Effect.gen(function* () {
    const env = yield* BuildEnvironment;
    yield* ensure(
      !Option.exists(env.controllerToken, token => token !== ''),
      'Candidate jobs must not receive the controller credential'
    );
    yield* ensure(
      !isSourceTag(env.ref),
      'Source-tag runs publish approved candidates, never builds'
    );
    const batch = yield* readJson(ReleaseBatch, BATCH_PATH);
    const selected = batch.plan.releases.filter(release => release.language === language);
    if (!selected.length) return yield* appendFile(env.outputPath, 'selected=false\n');
    yield* buildCandidate(env, language, selected);
  });

const ReportEnvironment = Config.all({
  artifactId: Config.schema(PositiveIntFromString, 'ARTIFACT_ID'),
  artifactDigest: Config.String('ARTIFACT_DIGEST'),
  sourceSha: Config.schema(Sha, 'SOURCE_SHA'),
  runId: Config.schema(PositiveIntFromString, 'GITHUB_RUN_ID'),
  summaryPath: Config.String('GITHUB_STEP_SUMMARY'),
  token: Config.schema(Schema.NonEmptyString, 'SDK_READ_TOKEN'),
});

/** Confirms the uploaded artifact is this run's candidate and records its identity. */
const reportMode = (language: Language) =>
  Effect.gen(function* () {
    const env = yield* ReportEnvironment;
    const artifact = yield* request(
      'GET',
      `${REPOSITORY_PATH}/actions/artifacts/${env.artifactId}`,
      ActionArtifact
    ).pipe(Effect.provide(GitHub.layer(env.token)));
    yield* reuseCandidate([artifact], candidateArtifactName(language), env.runId, env.sourceSha);
    yield* ensure(
      artifact.digest === (yield* normalizeArtifactDigest(env.artifactDigest)),
      'Uploaded artifact digest differs'
    );
    const manifest = yield* readJson(
      CandidateManifest,
      `sdk-candidate/${language}/${CANDIDATE_MANIFEST}`
    );
    const files = manifest.files
      .map(file => `- ${file.name}: ${file.sha256} (${file.size} bytes)`)
      .join('\n');
    yield* appendFile(
      env.summaryPath,
      `${language} candidate ID=${artifact.id} digest=${artifact.digest} producer=${env.runId} source=${env.sourceSha} expires=${artifact.expires_at}\n\n${files}\n`
    );
  });

/** `candidates.ts <language>` builds a release-PR candidate; `report <language>` records it. */
const Arguments = Schema.Union([
  Schema.Tuple([Language]),
  Schema.Tuple([Schema.Literal('report'), Language]),
]);

const main = Effect.gen(function* () {
  const args = yield* Schema.decodeUnknownEffect(Arguments)(yield* (yield* Stdio.Stdio).args);
  return yield* args.length === 1 ? buildMode(args[0]) : reportMode(args[1]);
});

if (import.meta.main) runMain(main);
