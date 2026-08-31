#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, options);
  if (result.error) {
    throw result.error;
  }
  return result;
}

function output(command, args) {
  const result = run(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const miseCommand = process.platform === 'win32' ? 'mise.exe' : 'mise';
const installPath = process.env.MISE_TOOL_INSTALL_PATH ?? output(miseCommand, ['where', 'bun']);
const requiredRevision = process.env.MISE_TOOL_VERSION ?? output(miseCommand, ['current', 'bun']);
const bunExecutable =
  process.platform === 'win32'
    ? join(installPath, 'node_modules', 'bun', 'bin', 'bun.exe')
    : join(installPath, 'node_modules', '.bin', 'bun');

const installedRevision = spawnSync(bunExecutable, ['--revision'], { encoding: 'utf8' });
if (installedRevision.status === 0 && installedRevision.stdout.trim() === requiredRevision) {
  process.exit(0);
}

const install = run(
  npmCommand,
  [
    'install',
    '--prefix',
    installPath,
    '--ignore-scripts=false',
    '--no-audit',
    '--no-fund',
    '--save=false',
    join(installPath, 'package'),
  ],
  { stdio: 'inherit' }
);

if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

const revision = run(bunExecutable, ['--revision'], { encoding: 'utf8' });

if (revision.status !== 0) {
  process.stderr.write(revision.stderr);
  process.exit(revision.status ?? 1);
}
if (revision.stdout.trim() !== requiredRevision) {
  throw new Error(
    `Bun revision mismatch: expected ${requiredRevision}, got ${revision.stdout.trim()}`
  );
}
