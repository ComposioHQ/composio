import { Config, Effect, FileSystem, Option, Path, Schema, Stdio } from 'effect';
import { getPackages } from '@manypkg/get-packages';
import {
  ActionArtifact,
  ApprovedCandidates,
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
  type CandidateArtifact,
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
import { BATCH_PATH, ReleaseBatch, batchLanguages } from './source';

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

/** The pull_request-only workflow that builds release-PR candidates. */
const CANDIDATES_WORKFLOW = 'sdk.release.candidates.yml';
const CANDIDATES_WORKFLOW_PATH = `.github/workflows/${CANDIDATES_WORKFLOW}`;

/** The release-PR build step that uploads the candidate artifact. */
const UPLOAD_STEP = 'Retain candidate bytes for publication';

/**
 * Requires `artifact` to have been created by the upload step of the newest successful `jobName`
 * job of `runId`. Every other job and step in that run holds its runtime token and could replace
 * the artifact. Jobs from every attempt are read because a partial re-run leaves earlier jobs out
 * of the latest attempt.
 */
const requireCreatedDuring = (
  runId: number,
  jobName: string,
  artifact: CandidateArtifact,
  where: string
) =>
  Effect.gen(function* () {
    const [step] = (yield* jobs(String(runId), 'all'))
      .filter(job => job.name === jobName && job.conclusion === 'success')
      .flatMap(job => job.steps)
      .flatMap(step =>
        step.name === UPLOAD_STEP &&
        step.conclusion === 'success' &&
        step.started_at &&
        step.completed_at
          ? [{ startedAt: step.started_at, completedAt: step.completed_at }]
          : []
      )
      .toSorted((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
    if (!step)
      return yield* fail(
        `The ${jobName} job did not upload a candidate in ${where}; add changesets and request a new release`
      );
    const created = Date.parse(artifact.created_at);
    yield* ensure(
      Date.parse(step.startedAt) <= created && created <= Date.parse(step.completedAt),
      `${artifact.name} was created at ${artifact.created_at}, outside its upload step, which ran from ${step.startedAt} to ${step.completedAt}; add changesets and request a new release`
    );
  });

/**
 * Copies the candidate a release-PR run built and checked on this exact head into `directory`.
 * Every successful release-PR run on the head passed the candidate checks the merge requires;
 * the newest one is used, and its artifact must come from that run's build job.
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
        `No successful release-PR run built the approved ${language} candidate; add changesets and request a new release`
      );
    const artifact = yield* reuseCandidate(
      yield* originalCandidates(run.id),
      candidateArtifactName(language),
      run.id,
      sha
    );
    if (Option.isNone(artifact))
      return yield* fail(
        `Approved ${language} candidate was deleted from ${run.html_url}; add changesets and request a new release`
      );
    yield* requireCreatedDuring(
      run.id,
      `SDK candidate (${language})`,
      artifact.value,
      run.html_url
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

const ApproveEnvironment = Config.all({
  sha: Config.schema(Sha, 'GITHUB_SHA'),
  ref: Config.String('GITHUB_REF'),
  outputPath: Config.String('GITHUB_OUTPUT'),
  summaryPath: Config.String('GITHUB_STEP_SUMMARY'),
  token: Config.schema(Schema.NonEmptyString, 'SDK_READ_TOKEN'),
  controllerToken: Config.option(Config.String('SDK_RELEASE_TOKEN')),
});

/**
 * Checks the approved release-PR candidate of every selected language once and pins its artifact
 * ID and digest as a job output. Publish jobs download exactly that artifact, and a retried job
 * reuses the output, so every attempt publishes the same bytes.
 */
const approveMode = Effect.gen(function* () {
  const env = yield* ApproveEnvironment;
  yield* ensure(
    !Option.exists(env.controllerToken, token => token !== ''),
    'Candidate jobs must not receive the controller credential'
  );
  yield* ensure(isSourceTag(env.ref), 'Approved candidates are pinned only by a source-tag run');
  const path = yield* Path.Path;
  const batch = yield* readJson(ReleaseBatch, BATCH_PATH);
  const approved: Record<string, ApprovedCandidate> = {};
  yield* Effect.gen(function* () {
    for (const language of batchLanguages(batch)) {
      const candidate = yield* adoptApprovedCandidate(
        env.sha,
        language,
        path.resolve('sdk-candidate', language)
      );
      approved[language] = candidate;
      yield* appendFile(
        env.summaryPath,
        `${language}: approved release-PR run ${candidate.run}, artifact ${candidate.artifactId} (${candidate.digest})\n`
      );
    }
  }).pipe(Effect.provide(GitHub.layer(env.token)));
  const pinned = yield* Schema.decodeUnknownEffect(ApprovedCandidates)(approved);
  yield* appendFile(
    env.outputPath,
    `approved=${JSON.stringify(pinned)}\ntypescript=${'typescript' in pinned}\npython=${'python' in pinned}\n`
  );
});

/**
 * `candidates.ts <language>` builds a release-PR candidate, `candidates.ts report <language>`
 * records its identity, and `candidates.ts approve` pins the approved candidates in a tag run.
 */
const Arguments = Schema.Union([
  Schema.Tuple([Schema.Literal('approve')]),
  Schema.Tuple([Language]),
  Schema.Tuple([Schema.Literal('report'), Language]),
]);

const main = Effect.gen(function* () {
  const args = yield* Schema.decodeUnknownEffect(Arguments)(yield* (yield* Stdio.Stdio).args);
  if (args[0] === 'approve') return yield* approveMode;
  return yield* args.length === 1 ? buildMode(args[0]) : reportMode(args[1]);
});

if (import.meta.main) runMain(main);
