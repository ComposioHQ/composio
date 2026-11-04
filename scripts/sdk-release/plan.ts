import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { getPackages } from '@manypkg/get-packages';
import { readChangesets } from '@changesets/read';
import { readConfig } from '@changesets/config';
import { assembleReleasePlan } from '@changesets/assemble-release-plan';
import { applyReleasePlan } from '@changesets/apply-release-plan';
import type { Config, NewChangeset, Packages, ReleasePlan } from '@changesets/types';
import semver from 'semver';
import { LANGUAGES, Language, PRIMARY_TARGETS, PYTHON_RELEASE_MARKER, languageOf } from './lanes';
import {
  discoverPythonPackages,
  synchronizePythonMetadata,
  type PythonMetadataOptions,
  type PythonReleasePackage,
} from './python-metadata';
import { ensure, fail, fromPromise, sha256Hex, writeFile } from './runtime';

export { PYTHON_RELEASE_MARKER } from './lanes';

const Bump = Schema.Literals(['major', 'minor', 'patch']);
type Bump = typeof Bump.Type;
const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));

/** The partial batch a corrective release supersedes, and the files its registries already hold. */
export const CorrectiveInput = Schema.Struct({
  batchId: Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/)),
  sourceSha: Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/)),
  releases: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      oldVersion: Schema.String,
      newVersion: Schema.String,
      language: Language,
    })
  ).check(Schema.isMinLength(1)),
  inventory: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      version: Schema.String,
      files: Schema.Array(Schema.Struct({ name: Schema.String, sha256: Sha256 })),
    })
  ),
});
export type CorrectiveInput = typeof CorrectiveInput.Type;
const CORRECTIVE_NOTE = /^sdk-corrective-\d+$/;
export const ReleaseChoice = Schema.Literals(['auto', 'major', 'minor', 'patch', 'skip']);
export type ReleaseChoice = typeof ReleaseChoice.Type;
export const autoByDefault = ReleaseChoice.pipe(
  Schema.withDecodingDefaultKey(Effect.succeed('auto' as const))
);

export const ReleaseOptions = Schema.Struct({
  typescript: autoByDefault,
  python: autoByDefault,
  baseline: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  corrective: Schema.optionalKey(CorrectiveInput),
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
  choices: Schema.Struct({ typescript: ReleaseChoice, python: ReleaseChoice }),
  recommended: Schema.Array(Release),
  releases: Schema.Array(Release),
  changesets: Schema.Array(Changeset),
  retainedChangesets: Schema.Array(Changeset),
  corrective: Schema.optionalKey(CorrectiveInput),
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

/**
 * A corrective release may start from versions a partial batch already published,
 * provided the recorded inventory covers that package.
 */
const reconciledByCorrective = (
  corrective: CorrectiveInput,
  python: ReadonlyArray<PythonReleasePackage>,
  published: string,
  pkg: { name: string; version: string }
) => {
  const original = corrective.releases.find(
    release =>
      release.name === pkg.name ||
      (release.language === 'python' && python.some(candidate => candidate.name === pkg.name))
  );
  return (
    original !== undefined &&
    pkg.version === original.newVersion &&
    [original.oldVersion, original.newVersion].includes(published) &&
    corrective.inventory.some(
      item => item.name === pkg.name && item.version === original.newVersion
    )
  );
};

const assertStableBaselines = (
  packages: Packages,
  python: ReadonlyArray<PythonReleasePackage>,
  allowed: Set<string>,
  baseline: Record<string, string> | undefined,
  corrective: CorrectiveInput | undefined
) =>
  Effect.gen(function* () {
    const npm = packages.packages
      .filter(pkg => allowed.has(pkg.packageJson.name))
      .map(pkg => ({ name: pkg.packageJson.name, version: pkg.packageJson.version }));
    for (const pkg of npm)
      yield* ensure(isStable(pkg.version), `SDK baseline must be stable for ${pkg.name}`);
    if (!baseline) return;
    for (const pkg of [...npm, ...python]) {
      const published = baseline[pkg.name];
      yield* ensure(
        published === undefined ||
          published === pkg.version ||
          (corrective !== undefined && reconciledByCorrective(corrective, python, published, pkg)),
        `Registry baseline mismatch for ${pkg.name}: source ${pkg.version}, published ${published}`
      );
    }
    const missing = [...npm.filter(pkg => pkg.name !== PYTHON_RELEASE_MARKER), ...python]
      .map(pkg => pkg.name)
      .filter(name => baseline[name] === undefined);
    yield* ensure(missing.length === 0, `Registry baseline is incomplete: ${missing.join(', ')}`);
  });

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

/** A corrective release re-releases a partial batch's targets as patches over their recorded versions. */
const correctiveNote = (
  corrective: CorrectiveInput,
  inputs: { allowed: Set<string>; packages: Packages }
) =>
  Effect.gen(function* () {
    for (const release of corrective.releases)
      yield* ensure(
        inputs.allowed.has(release.name) &&
          inputs.packages.packages.find(pkg => pkg.packageJson.name === release.name)?.packageJson
            .version === release.newVersion,
        `Corrective source metadata differs from recorded partial batch: ${release.name}`
      );
    return {
      id: `sdk-corrective-${corrective.batchId}`,
      summary: `Corrective release after incomplete publication of batch ${corrective.batchId}. Previously uploaded files remain unchanged.`,
      releases: corrective.releases.map(release => ({
        name: release.name,
        type: 'patch' as const,
      })),
    } satisfies NewChangeset;
  });

export const createSdkReleasePlan = (cwd: string, options: SdkReleaseOptions = {}) =>
  Effect.gen(function* () {
    const choices = yield* Schema.decodeUnknownEffect(ReleaseOptions)(options);
    const inputs = yield* loadInputs(cwd);
    yield* assertStableBaselines(
      inputs.packages,
      inputs.python,
      inputs.allowed,
      choices.baseline,
      choices.corrective
    );
    const notes = [
      ...inputs.changesets,
      ...(choices.corrective ? [yield* correctiveNote(choices.corrective, inputs)] : []),
    ];
    const recommendation = assembleReleasePlan(notes, inputs.packages, inputs.config, undefined);
    const { selected, retained } = splitNotes(notes, choices);
    selected.push(...(yield* maintenanceNotes(selected, choices, inputs.allowed)));
    const native = assembleReleasePlan(selected, inputs.packages, inputs.config, undefined);
    const releases = yield* selectedReleases(native);
    for (const release of releases)
      yield* ensure(
        inputs.allowed.has(release.name),
        `Unexpected SDK release target ${release.name}`
      );
    return yield* decodePlan({
      schemaVersion: 1,
      inputFingerprint: inputs.fingerprint,
      choices: { typescript: choices.typescript, python: choices.python },
      recommended: yield* selectedReleases(recommendation),
      releases,
      changesets: native.changesets,
      retainedChangesets: retained,
      ...(choices.corrective ? { corrective: choices.corrective } : {}),
    });
  });

const serializeChangeset = (note: NewChangeset) =>
  `---\n${note.releases.map(entry => `${JSON.stringify(entry.name)}: ${entry.type}`).join('\n')}\n---\n\n${note.summary}\n`;

export const applySdkReleasePlan = (
  cwd: string,
  value: SdkReleasePlan,
  options: PythonMetadataOptions = {}
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const plan = yield* decodePlan(value);
    const inputs = yield* loadInputs(cwd);
    if (plan.releases.length === 0) return { alreadyApplied: false, changedPaths: [] as string[] };
    const versionOf = (name: string) =>
      inputs.packages.packages.find(pkg => pkg.packageJson.name === name)?.packageJson.version;
    const pendingNote = inputs.changesets.some(note =>
      plan.changesets.some(
        selected =>
          selected.id === note.id &&
          selected.releases.some(entry =>
            note.releases.some(remaining => remaining.name === entry.name)
          )
      )
    );
    const applied =
      plan.releases.every(release => versionOf(release.name) === release.newVersion) &&
      !pendingNote;
    const pythonRelease = plan.releases.find(release => release.name === PYTHON_RELEASE_MARKER);
    const syncPython = pythonRelease
      ? synchronizePythonMetadata(cwd, pythonRelease.newVersion, options)
      : Effect.succeed([] as string[]);
    if (applied)
      return {
        alreadyApplied: true,
        changedPaths: options.updateLockfile === false ? [] : yield* syncPython,
      };
    yield* ensure(
      inputs.fingerprint === plan.inputFingerprint,
      'Release inputs changed after planning; create a new plan'
    );
    const expected = yield* createSdkReleasePlan(cwd, {
      ...plan.choices,
      ...(plan.corrective ? { corrective: plan.corrective } : {}),
    });
    yield* ensure(
      JSON.stringify(expected) === JSON.stringify(plan),
      'Release data changed from the selected source plan'
    );
    for (const release of plan.releases)
      yield* ensure(
        inputs.allowed.has(release.name) &&
          versionOf(release.name) === release.oldVersion &&
          semver.inc(release.oldVersion, release.type) === release.newVersion,
        `Invalid release target ${release.name}`
      );
    const native = assembleReleasePlan(
      plan.changesets.map(toNewChangeset),
      inputs.packages,
      inputs.config,
      undefined
    );
    yield* ensure(
      JSON.stringify(yield* selectedReleases(native)) === JSON.stringify(plan.releases),
      'Release targets changed from the selected Changesets plan'
    );
    const changedPaths = (yield* fromPromise(() =>
      applyReleasePlan(native, inputs.packages, inputs.config, undefined, cwd)
    )).map(file => path.relative(cwd, file));
    for (const note of plan.retainedChangesets.filter(note => !CORRECTIVE_NOTE.test(note.id))) {
      const file = path.resolve(cwd, '.changeset', `${note.id}.md`);
      yield* writeFile(file, serializeChangeset(toNewChangeset(note)));
      changedPaths.push(path.relative(cwd, file));
    }
    const retainedIds = new Set(plan.retainedChangesets.map(note => note.id));
    for (const note of plan.changesets.filter(note => !retainedIds.has(note.id)))
      yield* fs.remove(path.resolve(cwd, '.changeset', `${note.id}.md`), { force: true });
    changedPaths.push(...(yield* syncPython));
    return { alreadyApplied: false, changedPaths: [...new Set(changedPaths)].sort() };
  });
