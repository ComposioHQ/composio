import { z } from 'zod';
import { getPackages } from '@manypkg/get-packages';
import semver from 'semver';
import { sdkReleasePlanSchema } from './plan';

export const sourceShaSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const releaseBatchSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[1-9][0-9]*$/),
  inputBase: sourceShaSchema,
  originalRunId: z.string().regex(/^[1-9][0-9]*$/),
  statusUrl: z.url(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plan: sdkReleasePlanSchema,
  outputs: z.array(z.string()),
  replaces: z.object({ number: z.number().int().positive(), headSha: sourceShaSchema }).optional(),
});
export type ReleaseBatch = z.infer<typeof releaseBatchSchema>;
export const batchPath = '.github/sdk-release-plan.json';

export function eligibleApproval(
  reviews: { user: string; state: string; commitId: string; permission: string }[],
  author: string,
  head: string
): boolean {
  const latest = new Map(reviews.map(review => [review.user, review]));
  if (
    [...latest.values()].some(
      review =>
        ['write', 'maintain', 'admin'].includes(review.permission) &&
        review.state === 'CHANGES_REQUESTED'
    )
  )
    return false;
  return [...latest.values()].some(
    review =>
      review.user !== author &&
      review.state === 'APPROVED' &&
      review.commitId === head &&
      ['write', 'maintain', 'admin'].includes(review.permission)
  );
}

export interface ReleaseFile {
  path: string;
  before: string | null;
  after: string | null;
}
type DiffPlan = Pick<
  z.infer<typeof sdkReleasePlanSchema>,
  'releases' | 'changesets' | 'retainedChangesets'
>;
function updatedDependencyRange(
  range: string,
  version: string,
  type: 'major' | 'minor' | 'patch'
): string {
  const workspace = range.startsWith('workspace:');
  const value = workspace ? range.slice('workspace:'.length) : range;
  const sets = new semver.Range(value).set;
  const comparators = sets.length === 1 ? sets[0] : [];
  let updated: string;
  if (comparators.length === 2 && value.includes('>') && value.includes('<')) {
    const lower = comparators.find(comparator => comparator.operator.startsWith('>'));
    const upper = comparators.find(comparator => comparator.operator.startsWith('<'));
    if (!lower || !upper) throw new Error('Unsupported SDK dependency range');
    const upperBound = semver.satisfies(version, upper.value)
      ? upper.value
      : `<${semver.inc(version, type)}`;
    updated =
      comparators[0] === lower ? `>=${version} ${upperBound}` : `${upperBound} >=${version}`;
  } else {
    const prefix = ['^', '~', '>=', '<=', '>'].find(prefix => value.startsWith(prefix)) ?? '';
    updated = `${prefix}${version}`;
  }
  return workspace ? `workspace:${updated}` : updated;
}

function validateManifest(before: string, after: string, plan: DiffPlan, path: string): void {
  const schema = z.object({ name: z.string(), version: z.string() }).passthrough();
  const old = schema.parse(JSON.parse(before));
  const next = schema.parse(JSON.parse(after));
  const release = plan.releases.find(release => release.name === old.name);
  if (release) {
    if (old.version !== release.oldVersion || next.version !== release.newVersion)
      throw new Error(`Wrong target version: ${path}`);
    next.version = old.version;
  }
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    if (old[field] === undefined && next[field] === undefined) continue;
    const previous = z.record(z.string(), z.string()).parse(old[field]);
    const updated = z.record(z.string(), z.string()).parse(next[field]);
    if (
      JSON.stringify(Object.keys(previous).sort()) !== JSON.stringify(Object.keys(updated).sort())
    )
      throw new Error(`Release changes dependency inventory: ${path}`);
    for (const [name, range] of Object.entries(previous)) {
      if (updated[name] === range) continue;
      const dependency = plan.releases.find(release => release.name === name);
      const dependencyRange = range.replace(/^workspace:/, '');
      if (
        !dependency ||
        !semver.validRange(dependencyRange) ||
        (field === 'peerDependencies' &&
          semver.satisfies(dependency.newVersion, dependencyRange)) ||
        updated[name] !== updatedDependencyRange(range, dependency.newVersion, dependency.type)
      )
        throw new Error(`Unplanned dependency change: ${path} ${name}`);
      updated[name] = range;
    }
    next[field] = updated;
  }
  if (JSON.stringify(old) !== JSON.stringify(next))
    throw new Error(`Release changes package behavior: ${path}`);
}
function expectedPythonMetadata(before: string, plan: DiffPlan, path: string): string {
  const release = plan.releases.find(release => release.name === '@composio/python-sdk');
  if (!release) return before;
  const pattern = path.endsWith('pyproject.toml')
    ? /(^\[project\][\s\S]*?^version\s*=\s*)(["'])([^"']+)\2/m
    : path.endsWith('setup.py')
      ? /(\bversion\s*=\s*)(["'])([^"']+)\2/
      : /(^\s*__version__\s*=\s*)(["'])([^"']+)\2/m;
  return before.replace(pattern, (_match, prefix: string, quote: string, version: string) => {
    if (version !== release.oldVersion) throw new Error(`Python baseline changed: ${path}`);
    return `${prefix}${quote}${release.newVersion}${quote}`;
  });
}
function expectedUvLock(before: string, plan: DiffPlan): string {
  const release = plan.releases.find(release => release.name === '@composio/python-sdk');
  if (!release) return before;
  return before
    .split('[[package]]')
    .map(block => {
      if (!/^source = \{ (?:editable|virtual) = "python(?:\/providers\/[^"/]+)?" \}$/m.test(block))
        return block;
      return block.replace(/^version = "([^"]+)"$/m, (_match, version: string) => {
        if (version !== release.oldVersion) throw new Error('Python lock baseline changed');
        return `version = "${release.newVersion}"`;
      });
    })
    .join('[[package]]');
}
function normalizePnpmContexts(contents: string, plan: DiffPlan): string {
  let result = contents;
  for (const release of plan.releases.filter(release => release.language === 'typescript')) {
    // Only a named SDK package's peer-context version may change. Registry
    // resolution, integrity and unrelated packages remain byte-for-byte stable.
    result = result.replaceAll(
      `${release.name}@${release.newVersion}`,
      `${release.name}@${release.oldVersion}`
    );
  }
  return result;
}

/** Validate data only. No candidate executable runs in the credentialed controller. */
export function validateReleaseDiff(files: ReleaseFile[], plan: DiffPlan, outputs: string[]): void {
  for (const release of plan.releases) {
    const changed = files.some(file => {
      if (!file.path.endsWith('/package.json') || file.after === null) return false;
      const manifest = z
        .object({ name: z.string(), version: z.string() })
        .passthrough()
        .safeParse(JSON.parse(file.after));
      return (
        manifest.success &&
        manifest.data.name === release.name &&
        manifest.data.version === release.newVersion
      );
    });
    if (!changed) throw new Error(`Missing planned version metadata: ${release.name}`);
  }
  for (const note of plan.changesets) {
    if (
      !/^sdk-maintenance-(typescript|python)$/.test(note.id) &&
      !files.some(file => file.path === `.changeset/${note.id}.md`)
    )
      throw new Error(`Selected release note was not consumed: ${note.id}`);
  }
  const selected = new Set(plan.releases.map(release => release.name));
  const notes = new Set(plan.changesets.map(note => `.changeset/${note.id}.md`));
  for (const file of files) {
    const { path, before, after } = file;
    if (path === batchPath) continue;
    if (path.includes('..') || path.startsWith('/') || path.includes('\\'))
      throw new Error('Invalid release path');
    if (
      outputs.some(output => path === output || (output.endsWith('/') && path.startsWith(output)))
    )
      continue;
    if (notes.has(path)) {
      const retained = plan.retainedChangesets.find(note => path === `.changeset/${note.id}.md`);
      const expected = retained
        ? `---\n${retained.releases.map(entry => `${JSON.stringify(entry.name)}: ${entry.type}`).join('\n')}\n---\n\n${retained.summary}\n`
        : null;
      if (after !== expected) throw new Error(`Selected release note changed: ${path}`);
      continue;
    }
    if (/^(pnpm-lock\.yaml|uv\.lock)$/.test(path)) {
      if (
        before === null ||
        after === null ||
        (path === 'uv.lock'
          ? expectedUvLock(before, plan) !== after
          : normalizePnpmContexts(before, plan) !== normalizePnpmContexts(after, plan))
      )
        throw new Error(`Release changes dependency resolution: ${path}`);
      continue;
    }
    if (/^(ts\/packages\/.*|python)\/package\.json$/.test(path) && before && after) {
      validateManifest(before, after, plan, path);
      continue;
    }
    if (
      selected.has('@composio/python-sdk') &&
      /^python\/(?:providers\/[^/]+\/)?(?:pyproject\.toml|setup\.py)$|^python\/composio\/__version__\.py$/.test(
        path
      ) &&
      before &&
      after
    ) {
      if (expectedPythonMetadata(before, plan, path) !== after)
        throw new Error(`Python source changed: ${path}`);
      continue;
    }
    throw new Error(`Not a planned release output: ${path}`);
  }
}
export const releasePatchSchema = z.object({
  batch: releaseBatchSchema,
  files: z
    .array(
      z.object({ path: z.string(), before: z.string().nullable(), after: z.string().nullable() })
    )
    .min(1),
});
export async function releaseOutputs(
  cwd: string,
  date: string,
  id: string,
  languages: Set<string>,
  names: Set<string>
): Promise<string[]> {
  const { packages } = await getPackages(cwd);
  const [year, month, day] = date.split('-');
  return [
    ...packages
      .filter(pkg => names.has(pkg.packageJson.name))
      .map(pkg => `${pkg.dir.slice(cwd.length + 1)}/CHANGELOG.md`),
    `docs/content/changelog/${month}-${day}-${year.slice(2)}-sdk-${id}.mdx`,
    ...[...languages].map(language => `docs/content/reference/sdk-reference/${language}/`),
  ].sort();
}
