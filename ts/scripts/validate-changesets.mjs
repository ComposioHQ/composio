#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '../..');
const changesetBinPath = resolve(repositoryRoot, 'node_modules/.bin/changeset');

export function findIgnoredChangesetReleases(changesetStatus, ignoredPackages) {
  const ignored = new Set(ignoredPackages);

  return (changesetStatus.changesets ?? []).flatMap(changeset =>
    (changeset.releases ?? [])
      .filter(release => ignored.has(release.name))
      .map(release => ({ changeset: changeset.id, package: release.name }))
  );
}

export function validateChangesets(cwd = repositoryRoot) {
  const config = JSON.parse(readFileSync(resolve(cwd, '.changeset/config.json'), 'utf8'));
  const outputDir = mkdtempSync(join(tmpdir(), 'composio-changeset-status-'));
  const outputPath = join(outputDir, 'status.json');

  try {
    const result = spawnSync(changesetBinPath, ['status', `--output=${outputPath}`], {
      cwd,
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      throw new Error(
        `Unable to inspect pending changesets.\n${result.stdout}${result.stderr}`.trim()
      );
    }

    const status = JSON.parse(readFileSync(outputPath, 'utf8'));
    const violations = findIgnoredChangesetReleases(status, config.ignore ?? []);

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
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  try {
    validateChangesets();
    console.log('changeset validation passed');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
