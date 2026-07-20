#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readChangesets from '@changesets/read';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '../..');

export function findIgnoredChangesetReleases(changesetStatus, ignoredPackages) {
  const ignored = new Set(ignoredPackages);

  return (changesetStatus.changesets ?? []).flatMap(changeset =>
    (changeset.releases ?? [])
      .filter(release => ignored.has(release.name))
      .map(release => ({ changeset: changeset.id, package: release.name }))
  );
}

export async function validateChangesets(cwd = repositoryRoot) {
  const config = JSON.parse(readFileSync(resolve(cwd, '.changeset/config.json'), 'utf8'));
  const changesets = await readChangesets(cwd);
  const violations = findIgnoredChangesetReleases({ changesets }, config.ignore ?? []);

  if (violations.length > 0) {
    const details = violations
      .map(({ changeset, package: packageName }) => `- ${changeset}: ${packageName}`)
      .join('\n');

    throw new Error(
      [
        'Pending changesets must not target packages listed in .changeset/config.json#ignore.',
        details,
        '',
        'An ignored-package changeset makes changesets/action enter version-PR mode, but',
        '`changeset version` emits no commit. The release job then fails while trying to',
        'open a pull request with no commits. Remove the changeset, or remove the package',
        'from the ignore list when intentionally restoring its Changesets release flow.',
      ].join('\n')
    );
  }
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  try {
    await validateChangesets();
    console.log('changeset validation passed');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
