import { Effect, Schema } from 'effect';
import { getPackages } from '@manypkg/get-packages';
import semver from 'semver';
import { PositiveInt, RunId, SDK_RELEASE_REPOSITORY, Sha } from './github';
import { PYTHON_RELEASE_MARKER, type Language } from './lanes';
import { SdkReleasePlan } from './plan';
import { PROJECT_VERSION, RUNTIME_VERSION, SETUP_VERSION } from './python-metadata';
import { ensure, fail, fromPromise } from './runtime';

/** One release request: who asked, the frozen source, and the planned versions. */
export const ReleaseBatch = Schema.Struct({
  id: RunId,
  /** The protected `next` commit the release is planned from. */
  inputBase: Sha,
  /** The member who requested this release; they may not approve it. */
  requestedBy: Schema.String,
  /** The issue that tracks this release. */
  issue: PositiveInt,
  date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  plan: SdkReleasePlan,
});
export type ReleaseBatch = typeof ReleaseBatch.Type;
export const BATCH_PATH = '.github/sdk-release-plan.json';

export const issueUrl = (batch: ReleaseBatch) =>
  `https://github.com/${SDK_RELEASE_REPOSITORY}/issues/${batch.issue}`;

export const batchLanguages = (batch: {
  readonly plan: { readonly releases: ReadonlyArray<{ readonly language: Language }> };
}) => new Set(batch.plan.releases.map(release => release.language));

export const ReleaseFile = Schema.Struct({
  path: Schema.String,
  before: Schema.NullOr(Schema.String),
  after: Schema.NullOr(Schema.String),
});
export type ReleaseFile = typeof ReleaseFile.Type;

export const ReleasePatch = Schema.Struct({
  files: Schema.Array(ReleaseFile).check(Schema.isMinLength(1)),
});
export type ReleasePatch = typeof ReleasePatch.Type;

type DiffPlan = Pick<SdkReleasePlan, 'releases' | 'changesets' | 'retainedChangesets'>;
type Bump = SdkReleasePlan['releases'][number]['type'];

const updatedDependencyRange = (range: string, version: string, type: Bump) =>
  Effect.gen(function* () {
    const workspace = range.startsWith('workspace:');
    const value = workspace ? range.slice('workspace:'.length) : range;
    const sets = new semver.Range(value).set;
    const comparators = sets.length === 1 ? sets[0] : [];
    const bounded = comparators.length === 2 && value.includes('>') && value.includes('<');
    const updated = bounded
      ? yield* boundedRange(comparators, version, type)
      : `${['^', '~', '>=', '<=', '>'].find(prefix => value.startsWith(prefix)) ?? ''}${version}`;
    return workspace ? `workspace:${updated}` : updated;
  });

/** Moves a `>=lower <upper` range to the new version, widening the upper bound only when needed. */
const boundedRange = (comparators: ReadonlyArray<semver.Comparator>, version: string, type: Bump) =>
  Effect.gen(function* () {
    const lower = comparators.find(comparator => comparator.operator.startsWith('>'));
    const upper = comparators.find(comparator => comparator.operator.startsWith('<'));
    if (!lower || !upper) return yield* fail('Unsupported SDK dependency range');
    const upperBound = semver.satisfies(version, upper.value)
      ? upper.value
      : `<${semver.inc(version, type)}`;
    return comparators[0] === lower ? `>=${version} ${upperBound}` : `${upperBound} >=${version}`;
  });

const Manifest = Schema.StructWithRest(
  Schema.Struct({ name: Schema.String, version: Schema.String }),
  [Schema.Record(Schema.String, Schema.Unknown)]
);
const decodeManifest = (contents: string) =>
  Effect.map(Schema.decodeUnknownEffect(Schema.fromJsonString(Manifest))(contents), manifest => ({
    ...manifest,
  }));
const Dependencies = Schema.Record(Schema.String, Schema.String);
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

/** A release may change only its own version and the ranges that point at released SDK packages. */
const validateManifest = (before: string, after: string, plan: DiffPlan, path: string) =>
  Effect.gen(function* () {
    const old = yield* decodeManifest(before);
    const next: Record<string, unknown> = yield* decodeManifest(after);
    const release = plan.releases.find(candidate => candidate.name === old.name);
    if (release) {
      yield* ensure(
        old.version === release.oldVersion && next.version === release.newVersion,
        `Wrong target version: ${path}`
      );
      next.version = old.version;
    }
    for (const field of DEPENDENCY_FIELDS) {
      if (old[field] === undefined && next[field] === undefined) continue;
      const previous = yield* Schema.decodeUnknownEffect(Dependencies)(old[field]);
      const updated = { ...(yield* Schema.decodeUnknownEffect(Dependencies)(next[field])) };
      yield* ensure(
        JSON.stringify(Object.keys(previous).sort()) ===
          JSON.stringify(Object.keys(updated).sort()),
        `Release changes dependency inventory: ${path}`
      );
      for (const [name, range] of Object.entries(previous)) {
        if (updated[name] === range) continue;
        const dependency = plan.releases.find(candidate => candidate.name === name);
        const dependencyRange = range.replace(/^workspace:/, '');
        const planned =
          dependency !== undefined &&
          semver.validRange(dependencyRange) !== null &&
          !(
            field === 'peerDependencies' && semver.satisfies(dependency.newVersion, dependencyRange)
          ) &&
          updated[name] ===
            (yield* updatedDependencyRange(range, dependency.newVersion, dependency.type));
        yield* ensure(planned, `Unplanned dependency change: ${path} ${name}`);
        updated[name] = range;
      }
      next[field] = updated;
    }
    yield* ensure(
      JSON.stringify(old) === JSON.stringify(next),
      `Release changes package behavior: ${path}`
    );
  });

/** Python files the synchronized train rewrites, and the version pattern each one carries. */
const PYTHON_VERSION_FILES: ReadonlyArray<{ readonly suffix: string; readonly pattern: RegExp }> = [
  { suffix: 'pyproject.toml', pattern: PROJECT_VERSION },
  { suffix: 'setup.py', pattern: SETUP_VERSION },
  { suffix: '__version__.py', pattern: RUNTIME_VERSION },
];
const PYTHON_METADATA_PATH =
  /^python\/(?:providers\/[^/]+\/)?(?:pyproject\.toml|setup\.py)$|^python\/composio\/__version__\.py$/;

const pythonRelease = (plan: DiffPlan) =>
  plan.releases.find(release => release.name === PYTHON_RELEASE_MARKER);

const expectedPythonMetadata = (before: string, plan: DiffPlan, path: string) =>
  Effect.gen(function* () {
    const release = pythonRelease(plan);
    if (!release) return before;
    const { pattern } =
      PYTHON_VERSION_FILES.find(file => path.endsWith(file.suffix)) ?? PYTHON_VERSION_FILES[2];
    const current = before.match(pattern)?.[3];
    yield* ensure(
      current === undefined || current === release.oldVersion,
      `Python baseline changed: ${path}`
    );
    return before.replace(
      pattern,
      (_match, prefix: string, quote: string) => `${prefix}${quote}${release.newVersion}${quote}`
    );
  });

const WORKSPACE_LOCK_SOURCE =
  /^source = \{ (?:editable|virtual) = "python(?:\/providers\/[^"/]+)?" \}$/m;
const LOCK_VERSION = /^version = "([^"]+)"$/m;

const expectedUvLock = (before: string, plan: DiffPlan) =>
  Effect.gen(function* () {
    const release = pythonRelease(plan);
    if (!release) return before;
    const blocks = before.split('[[package]]');
    const workspaceVersions = blocks
      .filter(block => WORKSPACE_LOCK_SOURCE.test(block))
      .map(block => block.match(LOCK_VERSION)?.[1])
      .filter(version => version !== undefined);
    yield* ensure(
      workspaceVersions.every(version => version === release.oldVersion),
      'Python lock baseline changed'
    );
    return blocks
      .map(block =>
        WORKSPACE_LOCK_SOURCE.test(block)
          ? block.replace(LOCK_VERSION, `version = "${release.newVersion}"`)
          : block
      )
      .join('[[package]]');
  });

/** Only a released package's own peer-context version may change in the pnpm lockfile. */
const normalizePnpmContexts = (contents: string, plan: DiffPlan) =>
  plan.releases
    .filter(release => release.language === 'typescript')
    .reduce(
      (result, release) =>
        result.replaceAll(
          `${release.name}@${release.newVersion}`,
          `${release.name}@${release.oldVersion}`
        ),
      contents
    );

const retainedNote = (note: DiffPlan['retainedChangesets'][number]) =>
  `---\n${note.releases.map(entry => `${JSON.stringify(entry.name)}: ${entry.type}`).join('\n')}\n---\n\n${note.summary}\n`;

const GENERATED_NOTE = /^sdk-maintenance-(typescript|python)$/;

const plannedVersionMetadata = (
  files: ReadonlyArray<ReleaseFile>,
  release: { name: string; newVersion: string }
) =>
  files.some(file => {
    if (!file.path.endsWith('/package.json') || file.after === null) return false;
    const manifest = Schema.decodeUnknownOption(Manifest)(JSON.parse(file.after));
    return (
      manifest._tag === 'Some' &&
      manifest.value.name === release.name &&
      manifest.value.version === release.newVersion
    );
  });

/** Checks one changed file against the release outputs it may legitimately belong to. */
const validateReleaseFile = (
  file: ReleaseFile,
  plan: DiffPlan,
  outputs: ReadonlyArray<string>,
  notes: ReadonlySet<string>,
  selected: ReadonlySet<string>
) =>
  Effect.gen(function* () {
    const { path, before, after } = file;
    if (path === BATCH_PATH) return;
    yield* ensure(
      !path.includes('..') && !path.startsWith('/') && !path.includes('\\'),
      'Invalid release path'
    );
    if (
      outputs.some(output => path === output || (output.endsWith('/') && path.startsWith(output)))
    )
      return;
    if (notes.has(path)) {
      const retained = plan.retainedChangesets.find(note => path === `.changeset/${note.id}.md`);
      yield* ensure(
        after === (retained ? retainedNote(retained) : null),
        `Selected release note changed: ${path}`
      );
      return;
    }
    if (path === 'uv.lock' || path === 'pnpm-lock.yaml') {
      const unchanged =
        before !== null &&
        after !== null &&
        (path === 'uv.lock'
          ? (yield* expectedUvLock(before, plan)) === after
          : normalizePnpmContexts(before, plan) === normalizePnpmContexts(after, plan));
      yield* ensure(unchanged, `Release changes dependency resolution: ${path}`);
      return;
    }
    if (/^(ts\/packages\/.*|python)\/package\.json$/.test(path) && before && after)
      return yield* validateManifest(before, after, plan, path);
    if (selected.has(PYTHON_RELEASE_MARKER) && PYTHON_METADATA_PATH.test(path) && before && after) {
      yield* ensure(
        (yield* expectedPythonMetadata(before, plan, path)) === after,
        `Python source changed: ${path}`
      );
      return;
    }
    return yield* fail(`Not a planned release output: ${path}`);
  });

/** Every changed file must be a planned version, note, lockfile, or generated release output. */
export const validateReleaseDiff = (
  files: ReadonlyArray<ReleaseFile>,
  plan: DiffPlan,
  outputs: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    for (const release of plan.releases)
      yield* ensure(
        plannedVersionMetadata(files, release),
        `Missing planned version metadata: ${release.name}`
      );
    for (const note of plan.changesets)
      yield* ensure(
        GENERATED_NOTE.test(note.id) ||
          files.some(file => file.path === `.changeset/${note.id}.md`),
        `Selected release note was not consumed: ${note.id}`
      );
    const selected = new Set(plan.releases.map(release => release.name));
    const notes = new Set(plan.changesets.map(note => `.changeset/${note.id}.md`));
    for (const file of files) yield* validateReleaseFile(file, plan, outputs, notes, selected);
  });

/** The changelog and reference paths a release may write besides version metadata. */
export const releaseOutputs = (cwd: string, batch: ReleaseBatch) =>
  Effect.gen(function* () {
    const { packages } = yield* fromPromise(() => getPackages(cwd));
    const names = new Set(batch.plan.releases.map(release => release.name));
    const [year, month, day] = batch.date.split('-');
    return [
      ...packages
        .filter(pkg => names.has(pkg.packageJson.name))
        .map(pkg => `${pkg.dir.slice(cwd.length + 1)}/CHANGELOG.md`),
      `docs/content/changelog/${month}-${day}-${year.slice(2)}-sdk-${batch.id}.mdx`,
      ...[...batchLanguages(batch)].map(
        language => `docs/content/reference/sdk-reference/${language}/`
      ),
    ].sort();
  });
