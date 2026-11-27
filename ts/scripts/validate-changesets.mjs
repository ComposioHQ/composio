#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { getPackages } from '@manypkg/get-packages';
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

export function missingReleaseNotes(changedPaths, changesets, packages, exemption = '') {
  if (/<!--\s*sdk-release-note-exempt:\s*(.{20,}?)\s*-->/s.test(exemption)) return [];
  const required = new Set();
  for (const path of changedPaths) {
    if (
      /(?:^|\/)(?:tests?|integration_tests?|__tests__|fixtures?|__fixtures__|examples|scripts)(?:\/|$)|(?:\.test|\.spec)\.|(?:^|\/)test_[^/]*\.py$|_test\.py$|(?:^|\/)(?:AGENTS\.md|CHANGELOG\.md|README\.md)$/.test(
        path
      )
    )
      continue;
    if (
      /^python\/(?:composio\/.*\.pyi?|providers\/[^/]+\/(?:composio_[^/]+\/.*\.pyi?|pyproject\.toml|setup\.py)|pyproject\.toml|setup\.py)$/.test(
        path
      )
    )
      required.add('@composio/python-sdk');
    for (const pkg of packages) {
      if (
        !pkg.private &&
        pkg.name !== '@composio/cli' &&
        path.startsWith(`${pkg.directory}/`) &&
        /\.(?:ts|tsx|js|mjs|json)$/.test(path)
      )
        required.add(pkg.name);
    }
  }
  const covered = new Set(
    changesets
      .filter(note => changedPaths.includes(`.changeset/${note.id}.md`))
      .flatMap(note =>
        note.releases
          .filter(entry => ['patch', 'minor', 'major'].includes(entry.type))
          .map(entry => entry.name)
      )
  );
  return [...required].filter(name => !covered.has(name)).sort();
}

export async function validateChangesets(
  cwd = repositoryRoot,
  base = process.env.SDK_RELEASE_NOTE_BASE
) {
  const config = JSON.parse(readFileSync(resolve(cwd, '.changeset/config.json'), 'utf8'));
  const changesets = await readChangesets(cwd);
  if (base) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(base)) throw new Error('Invalid release-note comparison base');
    const paths = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
      cwd,
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    const { packages } = await getPackages(cwd);
    const missing = missingReleaseNotes(
      paths,
      changesets,
      packages.map(pkg => ({
        name: pkg.packageJson.name,
        private: pkg.packageJson.private,
        directory: pkg.dir.slice(cwd.length + 1),
      })),
      process.env.SDK_RELEASE_PR_BODY ?? ''
    );
    if (missing.length)
      throw new Error(
        `SDK behavior changes require release notes for: ${missing.join(', ')}. Add a Changeset or explain the public-behavior exemption in the PR description.`
      );
  }
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
