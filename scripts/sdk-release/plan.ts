import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { getPackages } from '@manypkg/get-packages';
import { readChangesets } from '@changesets/read';
import { readConfig } from '@changesets/config';
import { assembleReleasePlan } from '@changesets/assemble-release-plan';
import { applyReleasePlan } from '@changesets/apply-release-plan';
import type { Config, NewChangeset, Packages, ReleasePlan } from '@changesets/types';
import semver from 'semver';
import { betaSnapshot, pythonVersion, stableByDefault } from './channel';
import { LANGUAGES, Language, PRIMARY_TARGETS, PYTHON_RELEASE_MARKER, languageOf } from './lanes';
import {
  discoverPythonPackages,
  synchronizePythonMetadata,
  type PythonMetadataOptions,
  type PythonReleasePackage,
} from './python-metadata';
import { ensure, fail, fromPromise, sameJson, sha256Hex, writeFile } from './runtime';

export { PYTHON_RELEASE_MARKER } from './lanes';

const Bump = Schema.Literals(['major', 'minor', 'patch']);
type Bump = typeof Bump.Type;

export const ReleaseChoice = Schema.Literals(['auto', 'major', 'minor', 'patch', 'skip']);
export type ReleaseChoice = typeof ReleaseChoice.Type;
export const autoByDefault = ReleaseChoice.pipe(
  Schema.withDecodingDefaultKey(Effect.succeed('auto' as const))
);

const PlanningRun = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/));

export const ReleaseOptions = Schema.Struct({
  typescript: autoByDefault,
  python: autoByDefault,
  channel: stableByDefault,
  /** The run that plans the release; a beta's versions end with it. */
  run: Schema.optionalKey(PlanningRun),
});
export type SdkReleaseOptions = typeof ReleaseOptions.Encoded;
type Choices = Record<Language, ReleaseChoice>;

const Changeset = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)),
  summary: Schema.String,
  releases: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      type: Schema.Literals(['major', 'minor', 'patch', 'none']),
    })
  ),
});
const Release = Schema.Struct({
  name: Schema.String,
  type: Bump,
  oldVersion: Schema.String,
  newVersion: Schema.String,
  changesets: Schema.Array(Schema.String),
  language: Language,
});
export const SdkReleasePlan = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  inputFingerprint: Schema.String,
  choices: Schema.Struct({
    typescript: ReleaseChoice,
    python: ReleaseChoice,
    channel: stableByDefault,
    run: Schema.optionalKey(PlanningRun),
  }),
  recommended: Schema.Array(Release),
  releases: Schema.Array(Release),
  changesets: Schema.Array(Changeset),
  retainedChangesets: Schema.Array(Changeset),
});
export type SdkReleasePlan = typeof SdkReleasePlan.Type;
export type SdkRelease = typeof Release.Type;

const decodePlan = Schema.decodeUnknownEffect(SdkReleasePlan);

/** Changesets' APIs take mutable notes. */
const toNewChangeset = (note: typeof Changeset.Type): NewChangeset => ({
  ...note,
  releases: [...note.releases],
});
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

/** An explicit bump overrides each note's recommendation; `auto` and `skip` keep it. */
const explicitBump = (choice: ReleaseChoice): Option.Option<Bump> =>
  Schema.is(Bump)(choice) ? Option.some(choice) : Option.none();

const isStable = (version: string) =>
  semver.valid(version) !== null && semver.prerelease(version) === null;

const isSdkTarget = (pkg: Packages['packages'][number], config: Config) =>
  !config.ignore.includes(pkg.packageJson.name) &&
  (pkg.packageJson.name === PYTHON_RELEASE_MARKER ||
    (!pkg.packageJson.private && pkg.packageJson.name.startsWith('@composio/')));

const loadInputs = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (yield* fs.exists(path.resolve(cwd, '.changeset/pre.json')))
      return yield* fail('Stable SDK planning does not consume Changesets prerelease state');
    const packages = yield* fromPromise(() => getPackages(cwd));
    const result = yield* fromPromise(() => readConfig(cwd, packages));
    if (!result.config)
      return yield* fail(`Invalid Changesets config: ${result.errors.join('; ')}`);
    const unversionedPrivate = packages.packages
      .filter(pkg => pkg.packageJson.private && pkg.packageJson.name !== PYTHON_RELEASE_MARKER)
      .map(pkg => pkg.packageJson.name);
    const config: Config = {
      ...result.config,
      ignore: [...new Set([...result.config.ignore, ...unversionedPrivate])].sort(),
    };
    const changesets = (yield* Schema.decodeUnknownEffect(Schema.Array(Changeset))(
      yield* fromPromise(() => readChangesets(cwd))
    ))
      .toSorted(byId)
      .map(toNewChangeset);
    const allowed = new Set(
      packages.packages.filter(pkg => isSdkTarget(pkg, config)).map(pkg => pkg.packageJson.name)
    );
    for (const note of changesets)
      for (const entry of note.releases)
        yield* ensure(
          allowed.has(entry.name),
          `${entry.name} is not an SDK release target (${note.id})`
        );
    const marker = packages.packages.find(pkg => pkg.packageJson.name === PYTHON_RELEASE_MARKER);
    const python: ReadonlyArray<PythonReleasePackage> = marker
      ? yield* discoverPythonPackages(cwd)
      : [];
    if (marker) {
      yield* ensure(marker.packageJson.private === true, 'Python release marker must be private');
      for (const pkg of python)
        yield* ensure(
          pkg.version === marker.packageJson.version,
          `Python metadata baseline mismatch for ${pkg.name}`
        );
    }
    const fingerprint = yield* sha256Hex(
      JSON.stringify({
        config,
        packages: packages.packages
          .map(pkg => ({ directory: path.relative(cwd, pkg.dir), manifest: pkg.packageJson }))
          .sort((a, b) => a.directory.localeCompare(b.directory)),
        changesets,
        python,
      })
    );
    return { packages, config, changesets, python, allowed, fingerprint };
  });

const selectedReleases = (native: ReleasePlan) =>
  Schema.decodeUnknownEffect(Schema.Array(Release))(
    native.releases
      .filter(release => release.type !== 'none')
      .map(release => ({ ...release, language: languageOf(release.name) }))
      .sort(byName)
  );

/** Applies per-language choices to authored notes; skipped entries stay for a later release. */
const splitNotes = (notes: ReadonlyArray<NewChangeset>, choices: Choices) => {
  const selected: NewChangeset[] = [];
  const retained: NewChangeset[] = [];
  for (const note of notes) {
    const isSkipped = (entry: NewChangeset['releases'][number]) =>
      choices[languageOf(entry.name)] === 'skip';
    const releases = note.releases
      .filter(entry => !isSkipped(entry))
      .map(entry => ({
        ...entry,
        type: Option.getOrElse(explicitBump(choices[languageOf(entry.name)]), () => entry.type),
      }));
    const remaining = note.releases.filter(isSkipped);
    if (releases.length) selected.push({ ...note, releases });
    if (remaining.length) retained.push({ ...note, releases: remaining });
  }
  return { selected, retained };
};

/** An explicit bump for a language without notes becomes an honest primary-group maintenance release. */
const maintenanceNotes = (
  selected: ReadonlyArray<NewChangeset>,
  choices: Choices,
  allowed: Set<string>
) =>
  Effect.forEach(
    LANGUAGES.flatMap(language =>
      Option.match(explicitBump(choices[language]), {
        onNone: () => [],
        onSome: type =>
          selected.some(note => note.releases.some(entry => languageOf(entry.name) === language))
            ? []
            : [{ language, type }],
      })
    ),
    ({ language, type }) =>
      Effect.gen(function* () {
        for (const name of PRIMARY_TARGETS[language])
          yield* ensure(allowed.has(name), `Missing primary SDK release target ${name}`);
        return {
          id: `sdk-maintenance-${language}`,
          summary: 'Maintenance release. No user-facing changes were recorded.',
          releases: PRIMARY_TARGETS[language].map(name => ({ name, type })),
        } satisfies NewChangeset;
      })
  );

/**
 * How Changesets computes versions for a channel: the normal bump for stable, a snapshot of it
 * for beta. A beta needs its planning run, which makes its versions unique.
 */
const versioning = (choices: typeof ReleaseOptions.Type, config: Config) =>
  Effect.gen(function* () {
    if (choices.channel === 'stable') return { config, snapshot: undefined };
    if (choices.run === undefined) return yield* fail('A beta plan needs its planning run');
    const { config: snapshot, parameters } = betaSnapshot(choices.run);
    return { config: { ...config, snapshot }, snapshot: parameters };
  });

export const createSdkReleasePlan = (cwd: string, options: SdkReleaseOptions = {}) =>
  Effect.gen(function* () {
    const choices = yield* Schema.decodeUnknownEffect(ReleaseOptions)(options);
    const inputs = yield* loadInputs(cwd);
    const { config, snapshot } = yield* versioning(choices, inputs.config);
    for (const pkg of inputs.packages.packages)
      if (inputs.allowed.has(pkg.packageJson.name))
        yield* ensure(
          isStable(pkg.packageJson.version),
          `SDK version must be stable for ${pkg.packageJson.name}`
        );
    const notes = inputs.changesets;
    const recommendation = assembleReleasePlan(notes, inputs.packages, config, undefined, snapshot);
    const { selected, retained } = splitNotes(notes, choices);
    selected.push(...(yield* maintenanceNotes(selected, choices, inputs.allowed)));
    const native = assembleReleasePlan(selected, inputs.packages, config, undefined, snapshot);
    const releases = yield* selectedReleases(native);
    for (const release of releases)
      yield* ensure(
        inputs.allowed.has(release.name),
        `Unexpected SDK release target ${release.name}`
      );
    return yield* decodePlan({
      schemaVersion: 1,
      inputFingerprint: inputs.fingerprint,
      choices: {
        typescript: choices.typescript,
        python: choices.python,
        channel: choices.channel,
        ...(choices.run === undefined ? {} : { run: choices.run }),
      },
      recommended: yield* selectedReleases(recommendation),
      releases,
      changesets: native.changesets,
      retainedChangesets: retained,
    });
  });

const serializeChangeset = (note: NewChangeset) =>
  `---\n${note.releases.map(entry => `${JSON.stringify(entry.name)}: ${entry.type}`).join('\n')}\n---\n\n${note.summary}\n`;

/** Writes the planned versions, changelogs, retained notes and Python metadata to `cwd`. */
export const applySdkReleasePlan = (
  cwd: string,
  value: SdkReleasePlan,
  options: PythonMetadataOptions = {}
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const plan = yield* decodePlan(value);
    if (plan.releases.length === 0) return;
    const inputs = yield* loadInputs(cwd);
    yield* ensure(
      inputs.fingerprint === plan.inputFingerprint,
      'Release inputs changed after planning; create a new plan'
    );
    yield* ensure(
      sameJson(yield* createSdkReleasePlan(cwd, plan.choices), plan),
      'Release data changed from the selected source plan'
    );
    const versionOf = (name: string) =>
      inputs.packages.packages.find(pkg => pkg.packageJson.name === name)?.packageJson.version;
    for (const release of plan.releases)
      yield* ensure(
        inputs.allowed.has(release.name) && versionOf(release.name) === release.oldVersion,
        `Invalid release target ${release.name}`
      );
    const { config, snapshot } = yield* versioning(
      yield* Schema.decodeUnknownEffect(ReleaseOptions)(plan.choices),
      inputs.config
    );
    const native = assembleReleasePlan(
      plan.changesets.map(toNewChangeset),
      inputs.packages,
      config,
      undefined,
      snapshot
    );
    yield* ensure(
      sameJson(yield* selectedReleases(native), plan.releases),
      'Release targets changed from the selected Changesets plan'
    );
    // A snapshot pins internal dependencies to the exact beta versions.
    yield* fromPromise(() =>
      applyReleasePlan(native, inputs.packages, config, snapshot !== undefined, cwd)
    );
    for (const note of plan.retainedChangesets)
      yield* writeFile(
        path.resolve(cwd, '.changeset', `${note.id}.md`),
        serializeChangeset(toNewChangeset(note))
      );
    const retainedIds = new Set(plan.retainedChangesets.map(note => note.id));
    for (const note of plan.changesets.filter(note => !retainedIds.has(note.id)))
      yield* fs.remove(path.resolve(cwd, '.changeset', `${note.id}.md`), { force: true });
    const python = plan.releases.find(release => release.name === PYTHON_RELEASE_MARKER);
    if (python) yield* synchronizePythonMetadata(cwd, pythonVersion(python.newVersion), options);
  });
