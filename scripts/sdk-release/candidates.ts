import { Config, Effect, FileSystem, Option, Path, Schema, Stdio } from 'effect';
import { getPackages } from '@manypkg/get-packages';
import {
  ActionArtifact,
  CANDIDATE_MANIFEST,
  type ApprovedCandidate,
  CandidateManifest,
  candidateArtifactName,
  downloadCandidate,
  normalizeArtifactDigest,
  originalCandidates,
  readCandidateFiles,
  reuseCandidate,
  verifyCandidateFiles,
} from './artifacts';
import {
  GitHub,
  PositiveIntFromString,
  REPOSITORY_PATH,
  ReleaseRun,
  SDK_RELEASE_REPOSITORY,
  Sha,
  jobs,
  request,
} from './github';
import { Language } from './lanes';
import type { SdkRelease } from './plan';
import { discoverPythonPackages } from './python-metadata';
import {
  appendFile,
  ensure,
  fail,
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

/** Builds and packs every public SDK package, keeps the selected tarballs, and checks provider compatibility. */
export const buildTypescript = (cwd: string, directory: string, names: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const exec = inDirectory(cwd);
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
  sha: Config.schema(Sha, 'GITHUB_SHA'),
  ref: Config.String('GITHUB_REF'),
  outputPath: Config.String('GITHUB_OUTPUT'),
  token: Config.schema(Schema.NonEmptyString, 'SDK_READ_TOKEN'),
  controllerToken: Config.option(Config.String('SDK_RELEASE_TOKEN')),
});
type BuildEnvironment = Config.Success<typeof BuildEnvironment>;

/** Release-PR runs build candidates; source-tag runs publish the approved release-PR bytes. */
const isSourceTag = (ref: string) => ref.startsWith('refs/tags/sdk-release/');

/** The pull_request-only workflow that builds release-PR candidates. */
const CANDIDATES_WORKFLOW = 'sdk.release.candidates.yml';
const CANDIDATES_WORKFLOW_PATH = `.github/workflows/${CANDIDATES_WORKFLOW}`;

/**
 * Copies the candidate a release-PR run built and checked on this exact head into `directory`.
 * Every successful release-PR run on the head passed the candidate checks the merge requires;
 * the newest one is used. Later jobs in that run hold its runtime token and could replace the
 * artifact, so an artifact created after the build job finished is refused.
 */
export const adoptApprovedCandidate = (sha: string, language: Language, directory: string) =>
  Effect.gen(function* () {
    const { workflow_runs } = yield* request(
      'GET',
      `${REPOSITORY_PATH}/actions/workflows/${CANDIDATES_WORKFLOW}/runs?event=pull_request&head_sha=${sha}&status=success&per_page=100`,
      Schema.Struct({ workflow_runs: Schema.Array(ReleaseRun) })
    );
    const [run] = workflow_runs
      .filter(
        candidate =>
          candidate.path === CANDIDATES_WORKFLOW_PATH &&
          candidate.repository.full_name === SDK_RELEASE_REPOSITORY &&
          candidate.event === 'pull_request' &&
          candidate.head_sha === sha &&
          candidate.conclusion === 'success'
      )
      .toSorted((a, b) => b.id - a.id);
    if (!run)
      return yield* fail(
        `No successful release-PR run built the approved ${language} candidate; request a new release with supersede`
      );
    const artifact = yield* reuseCandidate(
      yield* originalCandidates(run.id),
      candidateArtifactName(language),
      run.id,
      sha
    );
    if (Option.isNone(artifact))
      return yield* fail(
        `Approved ${language} candidate was deleted from ${run.html_url}; request a new release with supersede`
      );
    const buildJob = `SDK candidate (${language})`;
    const build = (yield* jobs(String(run.id), 'latest')).find(job => job.name === buildJob);
    if (build?.conclusion !== 'success' || !build.completed_at)
      return yield* fail(
        `The ${buildJob} job did not succeed in ${run.html_url}; request a new release with supersede`
      );
    yield* ensure(
      Date.parse(artifact.value.created_at) <= Date.parse(build.completed_at),
      `Approved ${language} candidate artifact was created at ${artifact.value.created_at}, after its build job finished at ${build.completed_at}; request a new release with supersede`
    );
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

/** Builds a release-PR candidate, or copies the approved one on a source-tag push. */
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
    yield* appendFile(env.outputPath, 'selected=true\n');
  });

const buildMode = (language: Language) =>
  Effect.gen(function* () {
    const env = yield* BuildEnvironment;
    yield* ensure(
      !Option.exists(env.controllerToken, token => token !== ''),
      'Candidate jobs must not receive the controller credential'
    );
    const batch = yield* readJson(ReleaseBatch, BATCH_PATH);
    const selected = batch.plan.releases.filter(release => release.language === language);
    if (!selected.length) return yield* appendFile(env.outputPath, 'selected=false\n');
    yield* buildCandidate(env, language, selected).pipe(Effect.provide(GitHub.layer(env.token)));
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
    const approved = manifest.approvedFrom
      ? `Copied from approved release-PR run ${manifest.approvedFrom.run} (artifact ${manifest.approvedFrom.artifactId}, ${manifest.approvedFrom.digest}).\n\n`
      : '';
    yield* appendFile(
      env.summaryPath,
      `${language} candidate ID=${artifact.id} digest=${artifact.digest} producer=${env.runId} source=${env.sourceSha} expires=${artifact.expires_at}\n\n${approved}${files}\n`
    );
  });

/** `candidates.ts <language>` builds or copies; `candidates.ts report <language>` records identity. */
const Arguments = Schema.Union([
  Schema.Tuple([Language]),
  Schema.Tuple([Schema.Literal('report'), Language]),
]);

const main = Effect.gen(function* () {
  const args = yield* Schema.decodeUnknownEffect(Arguments)(yield* (yield* Stdio.Stdio).args);
  return yield* args.length === 1 ? buildMode(args[0]) : reportMode(args[1]);
});

if (import.meta.main) runMain(main);
