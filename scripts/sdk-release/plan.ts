import { createHash } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { getPackages } from '@manypkg/get-packages';
import { readChangesets } from '@changesets/read';
import { readConfig } from '@changesets/config';
import { assembleReleasePlan } from '@changesets/assemble-release-plan';
import { applyReleasePlan } from '@changesets/apply-release-plan';
import type { Config, NewChangeset, Packages, ReleasePlan } from '@changesets/types';
import semver from 'semver';
import { z } from 'zod';
import {
  discoverPythonPackages,
  synchronizePythonMetadata,
  type PythonMetadataOptions,
} from './python-metadata';

export const PYTHON_RELEASE_MARKER = '@composio/python-sdk';
const bumpSchema = z.enum(['major', 'minor', 'patch']);
export const releaseChoiceSchema = z.enum(['auto', 'major', 'minor', 'patch', 'skip']);
export type ReleaseChoice = z.infer<typeof releaseChoiceSchema>;
export const releaseOptionsSchema = z.object({
  typescript: releaseChoiceSchema.default('auto'),
  python: releaseChoiceSchema.default('auto'),
  baseline: z.record(z.string(), z.string()).optional(),
});
export type SdkReleaseOptions = z.input<typeof releaseOptionsSchema>;
const changesetSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  summary: z.string(),
  releases: z.array(
    z.object({ name: z.string(), type: z.enum(['major', 'minor', 'patch', 'none']) })
  ),
});
const releaseSchema = z.object({
  name: z.string(),
  type: bumpSchema,
  oldVersion: z.string(),
  newVersion: z.string(),
  changesets: z.array(z.string()),
  language: z.enum(['typescript', 'python']),
});
export const sdkReleasePlanSchema = z.object({
  schemaVersion: z.literal(1),
  inputFingerprint: z.string(),
  choices: z.object({ typescript: releaseChoiceSchema, python: releaseChoiceSchema }),
  recommended: z.array(releaseSchema),
  releases: z.array(releaseSchema),
  changesets: z.array(changesetSchema),
  retainedChangesets: z.array(changesetSchema),
});
export type SdkReleasePlan = z.infer<typeof sdkReleasePlanSchema>;
export type SdkRelease = z.infer<typeof releaseSchema>;

function language(name: string): 'python' | 'typescript' {
  return name === PYTHON_RELEASE_MARKER ? 'python' : 'typescript';
}

async function loadInputs(cwd: string) {
  if (await Bun.file(resolve(cwd, '.changeset/pre.json')).exists()) {
    throw new Error('Stable SDK planning does not consume Changesets prerelease state');
  }
  const packages = await getPackages(cwd);
  const result = await readConfig(cwd, packages);
  if (!result.config) throw new Error(`Invalid Changesets config: ${result.errors.join('; ')}`);
  const config: Config = {
    ...result.config,
    ignore: [
      ...new Set([
        ...result.config.ignore,
        ...packages.packages
          .filter(pkg => pkg.packageJson.private && pkg.packageJson.name !== PYTHON_RELEASE_MARKER)
          .map(pkg => pkg.packageJson.name),
      ]),
    ].sort(),
  };
  const changesets = z
    .array(changesetSchema)
    .parse(await readChangesets(cwd))
    .sort((a, b) => a.id.localeCompare(b.id));
  const allowed = new Set(
    packages.packages
      .filter(
        pkg =>
          !config.ignore.includes(pkg.packageJson.name) &&
          (pkg.packageJson.name === PYTHON_RELEASE_MARKER ||
            (!pkg.packageJson.private && pkg.packageJson.name.startsWith('@composio/')))
      )
      .map(pkg => pkg.packageJson.name)
  );
  for (const note of changesets) {
    for (const entry of note.releases) {
      if (!allowed.has(entry.name))
        throw new Error(`${entry.name} is not an SDK release target (${note.id})`);
    }
  }
  const python = packages.packages.some(pkg => pkg.packageJson.name === PYTHON_RELEASE_MARKER)
    ? await discoverPythonPackages(cwd)
    : [];
  const marker = packages.packages.find(pkg => pkg.packageJson.name === PYTHON_RELEASE_MARKER);
  if (marker) {
    if (!marker.packageJson.private) throw new Error('Python release marker must be private');
    for (const pkg of python) {
      if (pkg.version !== marker.packageJson.version)
        throw new Error(`Python metadata baseline mismatch for ${pkg.name}`);
    }
  }
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        config,
        packages: packages.packages
          .map(pkg => ({ directory: relative(cwd, pkg.dir), manifest: pkg.packageJson }))
          .sort((a, b) => a.directory.localeCompare(b.directory)),
        changesets: [...changesets].sort((a, b) => a.id.localeCompare(b.id)),
        python,
      })
    )
    .digest('hex');
  return { packages, config, changesets, python, allowed, fingerprint };
}

function selectedReleases(native: ReleasePlan): SdkRelease[] {
  return native.releases
    .filter(release => release.type !== 'none')
    .map(release => releaseSchema.parse({ ...release, language: language(release.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function assertStableBaselines(
  packages: Packages,
  python: Awaited<ReturnType<typeof discoverPythonPackages>>,
  allowed: Set<string>,
  baseline?: Record<string, string>
) {
  for (const pkg of packages.packages) {
    if (!allowed.has(pkg.packageJson.name)) continue;
    if (!semver.valid(pkg.packageJson.version) || semver.prerelease(pkg.packageJson.version))
      throw new Error(`SDK baseline must be stable for ${pkg.packageJson.name}`);
    if (
      baseline?.[pkg.packageJson.name] !== undefined &&
      baseline[pkg.packageJson.name] !== pkg.packageJson.version
    ) {
      throw new Error(
        `Registry baseline mismatch for ${pkg.packageJson.name}: source ${pkg.packageJson.version}, published ${baseline[pkg.packageJson.name]}`
      );
    }
  }
  for (const pkg of python) {
    if (baseline?.[pkg.name] !== undefined && baseline[pkg.name] !== pkg.version)
      throw new Error(
        `Registry baseline mismatch for ${pkg.name}: source ${pkg.version}, published ${baseline[pkg.name]}`
      );
  }
  if (baseline) {
    const expected = [
      ...packages.packages
        .filter(
          pkg => allowed.has(pkg.packageJson.name) && pkg.packageJson.name !== PYTHON_RELEASE_MARKER
        )
        .map(pkg => pkg.packageJson.name),
      ...python.map(pkg => pkg.name),
    ];
    const missing = expected.filter(name => baseline[name] === undefined);
    if (missing.length) throw new Error(`Registry baseline is incomplete: ${missing.join(', ')}`);
  }
}

export async function createSdkReleasePlan(
  cwd: string,
  options: SdkReleaseOptions = {}
): Promise<SdkReleasePlan> {
  const choices = releaseOptionsSchema.parse(options);
  const inputs = await loadInputs(cwd);
  assertStableBaselines(inputs.packages, inputs.python, inputs.allowed, choices.baseline);
  const recommendation = assembleReleasePlan(
    inputs.changesets,
    inputs.packages,
    inputs.config,
    undefined
  );
  const selected: NewChangeset[] = [];
  const retained: NewChangeset[] = [];
  for (const note of inputs.changesets) {
    const releases = note.releases
      .filter(entry => choices[language(entry.name)] !== 'skip')
      .map(entry => {
        const choice = choices[language(entry.name)];
        return { ...entry, type: choice === 'auto' || choice === 'skip' ? entry.type : choice };
      });
    const remaining = note.releases.filter(entry => choices[language(entry.name)] === 'skip');
    if (releases.length) selected.push({ ...note, releases });
    if (remaining.length) retained.push({ ...note, releases: remaining });
  }
  for (const target of ['typescript', 'python'] as const) {
    const choice = choices[target];
    if (
      choice === 'auto' ||
      choice === 'skip' ||
      selected.some(note => note.releases.some(entry => language(entry.name) === target))
    )
      continue;
    const names =
      target === 'python' ? [PYTHON_RELEASE_MARKER] : ['@composio/core', '@composio/slim'];
    for (const name of names)
      if (!inputs.allowed.has(name)) throw new Error(`Missing primary SDK release target ${name}`);
    selected.push({
      id: `sdk-maintenance-${target}`,
      summary: 'Maintenance release. No user-facing changes were recorded.',
      releases: names.map(name => ({ name, type: choice })),
    });
  }
  const native = assembleReleasePlan(selected, inputs.packages, inputs.config, undefined);
  const releases = selectedReleases(native);
  for (const release of releases)
    if (!inputs.allowed.has(release.name))
      throw new Error(`Unexpected SDK release target ${release.name}`);
  return sdkReleasePlanSchema.parse({
    schemaVersion: 1,
    inputFingerprint: inputs.fingerprint,
    choices: { typescript: choices.typescript, python: choices.python },
    recommended: selectedReleases(recommendation),
    releases,
    changesets: native.changesets,
    retainedChangesets: retained,
  });
}

function serializeChangeset(note: NewChangeset): string {
  return `---\n${note.releases.map(entry => `${JSON.stringify(entry.name)}: ${entry.type}`).join('\n')}\n---\n\n${note.summary}\n`;
}

export async function applySdkReleasePlan(
  cwd: string,
  value: SdkReleasePlan,
  options: PythonMetadataOptions = {}
): Promise<{ alreadyApplied: boolean; changedPaths: string[] }> {
  const plan = sdkReleasePlanSchema.parse(value);
  const inputs = await loadInputs(cwd);
  if (plan.releases.length === 0) return { alreadyApplied: false, changedPaths: [] };
  const packageMap = new Map(inputs.packages.packages.map(pkg => [pkg.packageJson.name, pkg]));
  const applied =
    plan.releases.every(
      release => packageMap.get(release.name)?.packageJson.version === release.newVersion
    ) &&
    !inputs.changesets.some(note =>
      plan.changesets.some(
        selected =>
          selected.id === note.id &&
          selected.releases.some(entry =>
            note.releases.some(remaining => remaining.name === entry.name)
          )
      )
    );
  const pythonRelease = plan.releases.find(release => release.name === PYTHON_RELEASE_MARKER);
  if (applied) {
    const changedPaths =
      pythonRelease && options.updateLockfile !== false
        ? await synchronizePythonMetadata(cwd, pythonRelease.newVersion, options)
        : [];
    return { alreadyApplied: true, changedPaths };
  }
  if (inputs.fingerprint !== plan.inputFingerprint)
    throw new Error('Release inputs changed after planning; create a new plan');
  const expected = await createSdkReleasePlan(cwd, plan.choices);
  if (JSON.stringify(expected) !== JSON.stringify(plan)) {
    throw new Error('Release data changed from the selected source plan');
  }
  for (const release of plan.releases) {
    if (
      !inputs.allowed.has(release.name) ||
      packageMap.get(release.name)?.packageJson.version !== release.oldVersion ||
      semver.inc(release.oldVersion, release.type) !== release.newVersion
    )
      throw new Error(`Invalid release target ${release.name}`);
  }
  const native = assembleReleasePlan(plan.changesets, inputs.packages, inputs.config, undefined);
  if (JSON.stringify(selectedReleases(native)) !== JSON.stringify(plan.releases))
    throw new Error('Release targets changed from the selected Changesets plan');
  const changedPaths = (
    await applyReleasePlan(native, inputs.packages, inputs.config, undefined, cwd)
  ).map(path => relative(cwd, path));
  for (const note of plan.retainedChangesets) {
    const path = resolve(cwd, '.changeset', `${note.id}.md`);
    await writeFile(path, serializeChangeset(note));
    changedPaths.push(relative(cwd, path));
  }
  for (const note of plan.changesets) {
    if (!plan.retainedChangesets.some(retained => retained.id === note.id)) {
      await rm(resolve(cwd, '.changeset', `${note.id}.md`), { force: true });
    }
  }
  if (pythonRelease)
    changedPaths.push(...(await synchronizePythonMetadata(cwd, pythonRelease.newVersion, options)));
  return { alreadyApplied: false, changedPaths: [...new Set(changedPaths)].sort() };
}
