import * as fs from 'node:fs';
import * as path from 'node:path';

export interface BoundarySite {
  readonly rule: string;
  readonly reason: string;
  readonly target: string;
}

export type BoundaryManifest = Record<string, BoundarySite[]>;

export interface CollectedBoundaries {
  readonly manifest: BoundaryManifest;
  readonly errors: readonly string[];
}

const NEXT_LINE_FORM = /\/\/ eslint-disable-next-line (?<rules>[\w@/,\- ]+?) -- (?<reason>.+?)\s*$/;

const boundarySiteKey = (site: BoundarySite): string =>
  JSON.stringify([site.rule, site.reason, site.target]);

const compareBoundarySites = (left: BoundarySite, right: BoundarySite): number => {
  const leftKey = boundarySiteKey(left);
  const rightKey = boundarySiteKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
};

const formatBoundarySite = (site: BoundarySite): string =>
  `"${site.rule}" -- ${site.reason} -> ${JSON.stringify(site.target)}`;

export const listSourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [full] : [];
  });

export const parseBoundarySites = (
  relativePath: string,
  source: string
): { readonly sites: readonly BoundarySite[]; readonly errors: readonly string[] } => {
  const lines = source.split('\n');
  const sites: BoundarySite[] = [];
  const errors: string[] = [];

  lines.forEach((line, index) => {
    // oxlint honors both the eslint-disable and oxlint-disable spellings, so
    // the scanner must see both; only the eslint-disable next-line form below
    // is accepted into the manifest.
    if (!/(?:es|ox)lint-disable/.test(line)) return;

    const location = `${relativePath}:${index + 1}`;
    const match = NEXT_LINE_FORM.exec(line);
    if (!match?.groups) {
      errors.push(
        `${location}: only "// eslint-disable-next-line <rules> -- <reason>" is allowed ` +
          '(no file-wide disables, no bare disables without a justification, ' +
          'no oxlint-disable spellings).'
      );
      return;
    }

    const target = lines[index + 1]?.trim();
    if (!target) {
      errors.push(`${location}: eslint-disable-next-line must govern a non-empty next line.`);
      return;
    }

    const reason = match.groups.reason.trim();
    for (const rule of match.groups.rules.split(',').map(rule => rule.trim())) {
      sites.push({ rule, reason, target });
    }
  });

  return { errors, sites };
};

export const collectBoundaryManifest = (
  packageRoot: string,
  srcRoot: string
): CollectedBoundaries => {
  const manifest: BoundaryManifest = {};
  const errors: string[] = [];

  for (const file of listSourceFiles(srcRoot).sort()) {
    const relative = path.relative(packageRoot, file).split(path.sep).join('/');
    const parsed = parseBoundarySites(relative, fs.readFileSync(file, 'utf8'));
    errors.push(...parsed.errors);

    if (parsed.sites.length > 0) {
      manifest[relative] = [...parsed.sites].sort(compareBoundarySites);
    }
  }

  return { errors, manifest };
};

const countSites = (sites: readonly BoundarySite[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const site of sites) {
    const key = boundarySiteKey(site);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

export const compareBoundaryManifests = (
  found: BoundaryManifest,
  registered: BoundaryManifest
): readonly string[] => {
  const errors: string[] = [];
  const files = [...new Set([...Object.keys(found), ...Object.keys(registered)])].sort();

  for (const file of files) {
    const foundSites = found[file] ?? [];
    const registeredSites = registered[file] ?? [];
    const foundCounts = countSites(foundSites);
    const registeredCounts = countSites(registeredSites);
    const sitesByKey = new Map(
      [...foundSites, ...registeredSites].map(site => [boundarySiteKey(site), site])
    );

    for (const key of [...sitesByKey.keys()].sort()) {
      const site = sitesByKey.get(key)!;
      const foundCount = foundCounts.get(key) ?? 0;
      const registeredCount = registeredCounts.get(key) ?? 0;

      if (foundCount > registeredCount) {
        errors.push(
          `${file}: ${foundCount}x ${formatBoundarySite(site)} found, ${registeredCount} registered. ` +
            'New or relocated eslint-disables are not allowed in CLI src: thread the ' +
            '@effect/platform service (Path, FileSystem), effect/Config, or Either.try instead — ' +
            'see "Effect Boundary Policy" in ts/packages/cli/AGENTS.md. If this is genuinely a new ' +
            'runtime boundary, regenerate the manifest with ' +
            '`pnpm run validate:boundaries -- --update` and justify the boundary in your PR.'
        );
      }

      if (foundCount < registeredCount) {
        errors.push(
          `${file}: manifest registers ${registeredCount}x ${formatBoundarySite(site)} but only ` +
            `${foundCount} exist. Nice — a boundary went away or moved. Regenerate the manifest ` +
            'with `pnpm run validate:boundaries -- --update`.'
        );
      }
    }
  }

  return errors;
};

export const countBoundarySites = (manifest: BoundaryManifest): number =>
  Object.values(manifest).reduce((sum, sites) => sum + sites.length, 0);
