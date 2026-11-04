import { Config, Effect, FileSystem, Option, Path, Schema, Stdio } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { getPackages } from '@manypkg/get-packages';
import {
  ActionArtifact,
  CANDIDATE_MANIFEST,
  type ApprovedCandidate,
  CandidateManifest,
  candidateArtifactName,
  downloadCandidate,
  mayRebuildMissingCandidate,
  normalizeArtifactDigest,
  originalCandidates,
  reuseCandidate,
  verifyCandidateFiles,
  type CandidateArtifact,
} from './artifacts';
import {
  GitHub,
  REPOSITORY_PATH,
  ReleaseRun,
  SDK_RELEASE_REPOSITORY,
  Sha,
  request,
} from './github';
import { Language, REGISTRY_LANES } from './lanes';
import type { SdkRelease } from './plan';
import { discoverPythonPackages, type PythonReleasePackage } from './python-metadata';
import {
  ensure,
  fail,
  formatJson,
  fromPromise,
  readJson,
  run,
  runMain,
  sha256Hex,
  withoutReleaseTokens,
  type ReleaseServices,
} from './runtime';
import { BATCH_PATH, ReleaseBatch } from './source';

/** Package versions whose public presence means a lane may already have published. */
const REGISTRY_TARGETS: Record<
  Language,
  (release: SdkRelease, python: ReadonlyArray<PythonReleasePackage>) => ReadonlyArray<string>
> = {
  typescript: release => [release.name],
  python: (_release, python) => python.map(pkg => pkg.name),
};

const registryStatus = (url: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.get(url);
    return response.status;
  }).pipe(Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }));

/** True when no planned version is public yet; any other registry answer than 404 is an error. */
export const registryInventoryEmpty = (cwd: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const batch = yield* readJson(ReleaseBatch, path.resolve(cwd, BATCH_PATH));
    const python = yield* discoverPythonPackages(cwd);
    const urls = batch.plan.releases.flatMap(release =>
      REGISTRY_TARGETS[release.language](release, python).map(name =>
        REGISTRY_LANES[release.language].versionUrl(name, release.newVersion)
      )
    );
    const statuses = yield* Effect.forEach(urls, registryStatus, { concurrency: 8 });
    for (const status of statuses) {
      if (status >= 200 && status < 300) return false;
      if (status !== 404)
        return yield* fail(`Cannot establish public registry inventory (${status})`);
    }
    return true;
  });

const PackedManifest = Schema.StructWithRest(
  Schema.Struct({ name: Schema.String, version: Schema.String }),
  [Schema.Record(Schema.String, Schema.Unknown)]
);
const command =
  (cwd: string, extraEnv: Record<string, string> = {}) =>
  (executable: string, args: ReadonlyArray<string>) =>
    run(executable, args, { cwd, env: { ...withoutReleaseTokens, ...extraEnv } });

const tarballName = (name: string, version: string) =>
  `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`;

/** Builds and packs every public SDK package, keeps the selected tarballs, and checks provider compatibility. */
export const buildTypescript = (cwd: string, directory: string, names: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const exec = command(cwd);
    const { packages } = yield* fromPromise(() => getPackages(cwd));
    const sdk = packages.filter(
      pkg =>
        !pkg.packageJson.private &&
        pkg.packageJson.name.startsWith('@composio/') &&
        pkg.packageJson.name !== '@composio/cli'
    );
    yield* exec('pnpm', [
      'exec',
      'turbo',
      'build',
      ...sdk.map(pkg => `--filter=${pkg.packageJson.name}`),
    ]);
    const compatibility = path.resolve(cwd, '.artifacts/sdk-compatibility');
    yield* fs.makeDirectory(compatibility, { recursive: true });
    for (const pkg of sdk) {
      yield* exec('pnpm', [
        '--dir',
        pkg.dir,
        'pack',
        '--pack-destination',
        compatibility,
        '--config.ignore-scripts=true',
      ]);
      const name = tarballName(pkg.packageJson.name, pkg.packageJson.version);
      const packed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PackedManifest))(
        yield* exec('tar', ['-xOf', path.join(compatibility, name), 'package/package.json'])
      );
      yield* ensure(
        packed.name === pkg.packageJson.name && packed.version === pkg.packageJson.version,
        'Packed npm metadata differs from the approved source'
      );
      if (names.has(pkg.packageJson.name))
        yield* fs.copyFile(path.join(compatibility, name), path.join(directory, name));
    }
    yield* exec('pnpm', [
      'exec',
      'tsx',
      'ts/scripts/check-provider-compatibility.ts',
      '--lane',
      'current',
      '--candidate-dir',
      compatibility,
    ]);
  });

const PYTHON_DISTRIBUTION = /\.whl$|\.tar\.gz$/;

/** Builds the synchronized Python train with the locked release toolchain and keeps its distributions. */
export const buildPython = (cwd: string, directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const environment = { UV_PROJECT_ENVIRONMENT: path.resolve(cwd, 'python/.venv') };
    const exec = command(cwd, environment);
    yield* exec('uv', ['sync', '--locked', '--only-group', 'release']);
    yield* command(path.join(cwd, 'python'), environment)('make', [
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

const appendOutput = (outputPath: string, text: string) =>
  Effect.gen(function* () {
    yield* (yield* FileSystem.FileSystem).writeFileString(outputPath, text, { flag: 'a' });
  });

const PositiveIntFromString = Schema.NumberFromString.check(
  Schema.isInt(),
  Schema.isGreaterThan(0)
);

const BuildEnvironment = Config.all({
  runId: Config.schema(PositiveIntFromString, 'GITHUB_RUN_ID'),
  runAttempt: Config.schema(PositiveIntFromString, 'GITHUB_RUN_ATTEMPT'),
  sha: Config.schema(Sha, 'GITHUB_SHA'),
  ref: Config.String('GITHUB_REF'),
  outputPath: Config.String('GITHUB_OUTPUT'),
  token: Config.schema(Schema.NonEmptyString, 'SDK_READ_TOKEN'),
  controllerToken: Config.option(Config.String('SDK_RELEASE_TOKEN')),
});
type BuildEnvironment = Config.Success<typeof BuildEnvironment>;

/** Release-PR runs build candidates; source-tag runs publish the approved release-PR bytes. */
const isSourceTag = (ref: string) => ref.startsWith('refs/tags/sdk-release/');

const WORKFLOW_PATH = '.github/workflows/sdk.release.yml';

const readCandidateFiles = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const names = (yield* fs.readDirectory(directory)).filter(name => name !== CANDIDATE_MANIFEST);
    return new Map(
      yield* Effect.forEach(names, name =>
        Effect.map(fs.readFile(`${directory}/${name}`), bytes => [name, bytes] as const)
      )
    );
  });

/**
 * Copies the candidate a release-PR run built and checked on this exact head into `directory`.
 * Every successful release-PR run on the head passed the candidate checks the merge requires;
 * the newest one is used.
 */
export const adoptApprovedCandidate = (sha: string, language: Language, directory: string) =>
  Effect.gen(function* () {
    const { workflow_runs } = yield* request(
      'GET',
      `${REPOSITORY_PATH}/actions/workflows/sdk.release.yml/runs?event=pull_request&head_sha=${sha}&status=success&per_page=100`,
      Schema.Struct({ workflow_runs: Schema.Array(ReleaseRun) })
    );
    const [run] = workflow_runs
      .filter(
        candidate =>
          candidate.path === WORKFLOW_PATH &&
          candidate.repository.full_name === SDK_RELEASE_REPOSITORY &&
          candidate.event === 'pull_request' &&
          candidate.head_sha === sha &&
          candidate.conclusion === 'success'
      )
      .toSorted((a, b) => b.id - a.id);
    if (!run)
      return yield* fail(`No successful release-PR run built the approved ${language} candidate`);
    const artifact = yield* reuseCandidate(
      yield* originalCandidates(run.id),
      candidateArtifactName(language),
      run.id,
      sha
    );
    if (Option.isNone(artifact))
      return yield* fail(`Approved ${language} candidate is missing from ${run.html_url}`);
    yield* downloadCandidate(artifact.value, directory);
    const manifestPath = `${directory}/${CANDIDATE_MANIFEST}`;
    const manifest = yield* readJson(CandidateManifest, manifestPath);
    yield* ensure(
      manifest.sourceSha === sha &&
        manifest.producerRun === run.id &&
        manifest.language === language,
      'Approved candidate manifest producer/source mismatch'
    );
    yield* verifyCandidateFiles(yield* readCandidateFiles(directory), manifest.files);
    yield* (yield* FileSystem.FileSystem).remove(manifestPath);
    return {
      run: run.id,
      artifactId: artifact.value.id,
      digest: artifact.value.digest,
    } satisfies ApprovedCandidate;
  });

/** A retained candidate is reused only when its manifest and bytes match this run's source. */
const recoverCandidate = (
  env: BuildEnvironment,
  language: Language,
  directory: string,
  existing: CandidateArtifact
) =>
  Effect.gen(function* () {
    yield* downloadCandidate(existing, directory);
    const manifest = yield* readJson(CandidateManifest, `${directory}/${CANDIDATE_MANIFEST}`);
    yield* ensure(
      manifest.sourceSha === env.sha &&
        manifest.producerRun === env.runId &&
        manifest.language === language,
      'Candidate manifest producer/source mismatch'
    );
    yield* verifyCandidateFiles(yield* readCandidateFiles(directory), manifest.files);
    yield* appendOutput(
      env.outputPath,
      `selected=true\nbuild=false\nartifact-id=${existing.id}\nartifact-digest=${existing.digest}\nartifact-expires=${existing.expires_at}\n`
    );
  });

/**
 * Builds a release-PR candidate, or copies the approved one on a source-tag push, unless a rerun
 * may already have published the missing one.
 */
const buildCandidate = (
  env: BuildEnvironment,
  language: Language,
  directory: string,
  selected: ReadonlyArray<SdkRelease>
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cwd = (yield* Path.Path).resolve('.');
    if (
      env.runAttempt > 1 &&
      !(yield* mayRebuildMissingCandidate(env.runId, yield* registryInventoryEmpty(cwd)))
    ) {
      yield* appendOutput(env.outputPath, 'terminal=true\n');
      return yield* fail(
        'Candidate missing after possible publication; a newly approved corrective release is required'
      );
    }
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
    const approvedFrom = isSourceTag(env.ref)
      ? yield* adoptApprovedCandidate(env.sha, language, directory)
      : yield* Effect.as(lane.build(cwd, directory, selected), undefined);
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
      ...(approvedFrom && { approvedFrom }),
    });
    yield* fs.writeFileString(`${directory}/${CANDIDATE_MANIFEST}`, formatJson(manifest));
    yield* appendOutput(env.outputPath, 'selected=true\nbuild=true\n');
  });

/** Builds or recovers the exact immutable candidate for one language lane. */
const buildMode = (language: Language) =>
  Effect.gen(function* () {
    const env = yield* BuildEnvironment;
    yield* ensure(
      !Option.exists(env.controllerToken, token => token !== ''),
      'Candidate jobs must not receive the controller credential'
    );
    const batch = yield* readJson(ReleaseBatch, BATCH_PATH);
    const selected = batch.plan.releases.filter(release => release.language === language);
    if (!selected.length)
      return yield* appendOutput(env.outputPath, 'selected=false\nbuild=false\n');
    yield* laneCandidate(env, language, selected).pipe(Effect.provide(GitHub.layer(env.token)));
  });

const laneCandidate = (
  env: BuildEnvironment,
  language: Language,
  selected: ReadonlyArray<SdkRelease>
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = (yield* Path.Path).resolve('sdk-candidate', language);
    const artifacts = yield* originalCandidates(env.runId);
    const existing = yield* reuseCandidate(
      artifacts,
      candidateArtifactName(language),
      env.runId,
      env.sha
    ).pipe(
      Effect.tapError(() =>
        env.runAttempt > 1 ? appendOutput(env.outputPath, 'terminal=true\n') : Effect.void
      )
    );
    yield* fs.makeDirectory(directory, { recursive: true });
    yield* Option.match(existing, {
      onSome: artifact => recoverCandidate(env, language, directory, artifact),
      onNone: () => buildCandidate(env, language, directory, selected),
    });
  });

const ReportEnvironment = Config.all({
  artifactId: Config.schema(PositiveIntFromString, 'ARTIFACT_ID'),
  artifactDigest: Config.String('ARTIFACT_DIGEST'),
  sourceSha: Config.schema(Sha, 'SOURCE_SHA'),
  runId: Config.schema(PositiveIntFromString, 'GITHUB_RUN_ID'),
  summaryPath: Config.String('GITHUB_STEP_SUMMARY'),
  token: Config.schema(Schema.NonEmptyString, 'SDK_READ_TOKEN'),
});

/** Confirms the uploaded or recovered artifact is this run's candidate and records its identity. */
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
    const approved = manifest.approvedFrom
      ? `Copied from approved release-PR run ${manifest.approvedFrom.run} (artifact ${manifest.approvedFrom.artifactId}, ${manifest.approvedFrom.digest}).\n\n`
      : '';
    yield* appendOutput(
      env.summaryPath,
      `${language} candidate ID=${artifact.id} digest=${artifact.digest} producer=${env.runId} source=${env.sourceSha} expires=${artifact.expires_at}\n\n${approved}${files}\n`
    );
  });

/** `candidates.ts <language>` builds or recovers; `candidates.ts report <language>` records identity. */
const Arguments = Schema.Union([
  Schema.Tuple([Language]),
  Schema.Tuple([Schema.Literal('report'), Language]),
]);

const main = Effect.gen(function* () {
  const args = yield* Schema.decodeUnknownEffect(Arguments)(yield* (yield* Stdio.Stdio).args);
  return yield* args.length === 1 ? buildMode(args[0]) : reportMode(args[1]);
});

if (import.meta.main) runMain(main);
