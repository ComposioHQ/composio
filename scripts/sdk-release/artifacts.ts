import { Effect, FileSystem, Option, Schema, Stream } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { GitHub, REPOSITORY_PATH, Sha, jobs, paginate } from './github';
import { Language } from './lanes';
import { ensure, fail, run, sha256Hex, withoutReleaseTokens } from './runtime';

const Digest = Schema.String.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/));
const IsoDate = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T/));
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));
const ArchiveEntry = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const CandidateFile = Schema.Struct({
  name: Schema.String.check(Schema.isPattern(ArchiveEntry)),
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  size: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type CandidateFile = typeof CandidateFile.Type;

export const CandidateManifest = Schema.Struct({
  sourceSha: Sha,
  producerRun: PositiveInt,
  language: Language,
  files: Schema.Array(CandidateFile).check(
    Schema.isMinLength(1),
    Schema.makeFilter(files =>
      new Set(files.map(file => file.name)).size === files.length
        ? undefined
        : 'Candidate filenames must be unique'
    )
  ),
});
export type CandidateManifest = typeof CandidateManifest.Type;

/** Name of the manifest each candidate artifact carries next to its distributions. */
export const CANDIDATE_MANIFEST = 'candidate.json';
export const candidateArtifactName = (language: Language) => `sdk-candidate-${language}`;

export const ActionArtifact = Schema.Struct({
  id: PositiveInt,
  name: Schema.String,
  digest: Digest,
  expired: Schema.Boolean,
  created_at: IsoDate,
  expires_at: IsoDate,
  workflow_run: Schema.Struct({ id: PositiveInt, head_sha: Sha }),
});
export type CandidateArtifact = typeof ActionArtifact.Type;

export const normalizeArtifactDigest = (value: unknown) =>
  Effect.gen(function* () {
    const digest = yield* Schema.decodeUnknownEffect(Schema.String)(value);
    return yield* Schema.decodeUnknownEffect(Digest)(
      digest.startsWith('sha256:') ? digest : `sha256:${digest}`
    );
  });

/** An artifact is usable while GitHub still retains it. */
export const isRetained = (artifact: CandidateArtifact, now: number) =>
  !artifact.expired && Date.parse(artifact.expires_at) > now;

/** The run's single artifact with this name, if it was produced from this source and is still retained. */
export const reuseCandidate = (
  artifacts: ReadonlyArray<CandidateArtifact>,
  name: string,
  producerRun: number,
  sourceSha: string,
  now = Date.now()
) =>
  Effect.gen(function* () {
    const matching = artifacts.filter(artifact => artifact.name === name);
    yield* ensure(matching.length <= 1, 'Multiple immutable candidates have the same name');
    const [artifact] = matching;
    if (!artifact) return Option.none<CandidateArtifact>();
    yield* ensure(
      artifact.workflow_run.id === producerRun && artifact.workflow_run.head_sha === sourceSha,
      'Candidate source or producer does not match'
    );
    yield* ensure(
      isRetained(artifact, now),
      'Original candidate unavailable; a corrective release is required'
    );
    return Option.some(yield* Schema.decodeUnknownEffect(ActionArtifact)(artifact));
  });

export const verifyArchive = (bytes: Uint8Array, digest: string) =>
  Effect.gen(function* () {
    yield* ensure(
      `sha256:${yield* sha256Hex(bytes)}` === digest,
      'Actions artifact archive digest mismatch'
    );
  });

export const verifyCandidateFiles = (
  actual: ReadonlyMap<string, Uint8Array>,
  expected: ReadonlyArray<CandidateFile>
) =>
  Effect.gen(function* () {
    yield* ensure(actual.size === expected.length, 'Candidate file inventory mismatch');
    for (const file of expected) {
      const bytes = actual.get(file.name);
      yield* ensure(
        bytes !== undefined &&
          bytes.length === file.size &&
          (yield* sha256Hex(bytes)) === file.sha256,
        `Candidate checksum mismatch: ${file.name}`
      );
    }
  });

export const originalCandidates = (run: number) =>
  Stream.runCollect(
    paginate(
      `${REPOSITORY_PATH}/actions/runs/${run}/artifacts`,
      Schema.Struct({ artifacts: Schema.Array(ActionArtifact) }),
      body => body.artifacts
    )
  );

const PUBLISHER_STEP = /upload.*(?:npm|pypi)|publish.*(?:npm|pypi)/i;

/** Whether any registry upload or publish step of these jobs may have run. */
export const publisherStarted = (
  runJobs: ReadonlyArray<{
    steps: ReadonlyArray<{ name: string; status: string; conclusion: string | null }>;
  }>
) =>
  runJobs.some(job =>
    job.steps.some(
      step =>
        PUBLISHER_STEP.test(step.name) && step.status !== 'queued' && step.conclusion !== 'skipped'
    )
  );

/** A rebuild needs both an empty public inventory and proof that no publisher ran; a 404 alone is not enough. */
export const mayRebuildMissingCandidate = (run: number, publicInventoryEmpty: boolean) =>
  Effect.map(jobs(String(run)), runJobs => publicInventoryEmpty && !publisherStarted(runJobs));

/** Downloads an original Actions artifact, checks its digest and archive paths, and unpacks it into `directory`. */
export const downloadCandidate = (artifact: { id: number; digest: string }, directory: string) =>
  Effect.gen(function* () {
    const github = yield* GitHub;
    const fs = yield* FileSystem.FileSystem;
    const client = yield* HttpClient.HttpClient;
    const location = yield* github.redirectLocation(
      `${REPOSITORY_PATH}/actions/artifacts/${artifact.id}/zip`
    );
    const url = yield* Option.match(location, {
      onNone: () => fail('Artifact download has no archive location'),
      onSome: value => Effect.try(() => new URL(value)),
    });
    yield* ensure(url.protocol === 'https:', 'Expected an HTTPS artifact archive');
    const archive = yield* client
      .get(url)
      .pipe(Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }));
    yield* ensure(
      archive.status >= 200 && archive.status < 300,
      'Original artifact is unavailable'
    );
    const bytes = new Uint8Array(yield* archive.arrayBuffer);
    yield* verifyArchive(bytes, artifact.digest);
    const zip = `${directory}.zip`;
    yield* fs.makeDirectory(directory, { recursive: true });
    yield* fs.writeFile(zip, bytes);
    const paths = (yield* run('unzip', ['-Z1', zip], { env: withoutReleaseTokens }))
      .trim()
      .split('\n');
    yield* ensure(
      new Set(paths).size === paths.length && paths.every(path => ArchiveEntry.test(path)),
      'Unexpected artifact archive path'
    );
    yield* run('unzip', ['-q', zip, '-d', directory], { env: withoutReleaseTokens });
  });

/** Downloads a candidate into a scoped temporary directory and returns its verified manifest and file bytes. */
export const readVerifiedCandidate = (
  artifact: CandidateArtifact,
  expected: { sourceSha: string; producerRun: number; language: Language },
  mismatch: string
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: 'sdk-candidate-' });
    const directory = `${root}/${expected.language}`;
    yield* downloadCandidate(artifact, directory);
    const manifest = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(CandidateManifest))(
      yield* fs.readFileString(`${directory}/${CANDIDATE_MANIFEST}`)
    );
    yield* ensure(
      manifest.sourceSha === expected.sourceSha &&
        manifest.producerRun === expected.producerRun &&
        manifest.language === expected.language,
      mismatch
    );
    const names = (yield* fs.readDirectory(directory)).filter(name => name !== CANDIDATE_MANIFEST);
    const files = new Map(
      yield* Effect.forEach(names, name =>
        Effect.map(fs.readFile(`${directory}/${name}`), bytes => [name, bytes] as const)
      )
    );
    yield* verifyCandidateFiles(files, manifest.files);
    return { manifest, files };
  });
