#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const packagesDir = path.join(rootDir, 'ts', 'packages');
const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const attwIgnoredRules = ['internal-resolution-error', 'no-resolution', 'cjs-resolves-to-esm'];

const skippedDirectories = new Set(['node_modules', 'dist', '.turbo']);

async function findPackageManifests(directory, manifests = []) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        await findPackageManifests(entryPath, manifests);
      }
      continue;
    }

    if (entry.name === 'package.json') {
      manifests.push(entryPath);
    }
  }

  return manifests;
}

function toPosixPath(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

async function readManifest(manifestPath) {
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

function isPublishablePackage(pkg) {
  return (
    pkg.private !== true &&
    typeof pkg.name === 'string' &&
    pkg.name.startsWith('@composio/') &&
    pkg.publishConfig &&
    pkg.exports
  );
}

async function assertBuiltFile(packageDir, packageName, fieldName, filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error(`${packageName} is missing package.json#${fieldName}`);
  }

  try {
    await access(path.join(packageDir, filePath), constants.R_OK);
  } catch {
    throw new Error(`${packageName} package.json#${fieldName} points to missing file: ${filePath}`);
  }
}

async function discoverPublishablePackages() {
  const manifests = await findPackageManifests(packagesDir);
  const packages = [];
  const metadataErrors = [];

  for (const manifestPath of manifests) {
    const pkg = await readManifest(manifestPath);

    if (!isPublishablePackage(pkg)) {
      continue;
    }

    const packageDir = path.dirname(manifestPath);
    const expectedMain = pkg.publishConfig.main;
    const expectedTypes = pkg.publishConfig.types;

    if (pkg.main !== expectedMain) {
      metadataErrors.push(
        `${pkg.name} package.json#main must match publishConfig.main (${expectedMain})`
      );
    }

    if (pkg.types !== expectedTypes) {
      metadataErrors.push(
        `${pkg.name} package.json#types must match publishConfig.types (${expectedTypes})`
      );
    }

    try {
      await assertBuiltFile(packageDir, pkg.name, 'main', pkg.main);
      await assertBuiltFile(packageDir, pkg.name, 'types', pkg.types);
    } catch (error) {
      metadataErrors.push(error.message);
    }

    packages.push({
      dir: toPosixPath(packageDir),
      name: pkg.name,
    });
  }

  if (metadataErrors.length > 0) {
    throw new Error(`Package metadata is not release-ready:\n- ${metadataErrors.join('\n- ')}`);
  }

  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      npm_config_update_notifier: 'false',
    },
    ...options,
  });
}

function printFailure(command, args, result) {
  console.error(`\nCommand failed: ${command} ${args.join(' ')}`);
  if (result.stdout) {
    console.error(result.stdout.trimEnd());
  }
  if (result.stderr) {
    console.error(result.stderr.trimEnd());
  }
}

function runPublint(pkg) {
  const args = ['exec', 'publint', 'run', pkg.dir, '--pack', 'npm', '--level', 'error'];
  const result = run(pnpmBin, args);

  if (result.status !== 0) {
    printFailure(pnpmBin, args, result);
    return false;
  }

  return true;
}

function runAttw(pkg) {
  const quietArgs = [
    'exec',
    'attw',
    pkg.dir,
    '--pack',
    '--quiet',
    '--profile',
    'esm-only',
    '--ignore-rules',
    ...attwIgnoredRules,
  ];
  const quietResult = run(pnpmBin, quietArgs);

  if (quietResult.status === 0) {
    return true;
  }

  const detailsArgs = [
    'exec',
    'attw',
    pkg.dir,
    '--pack',
    '--format',
    'table',
    '--no-emoji',
    '--no-color',
    '--profile',
    'esm-only',
    '--ignore-rules',
    ...attwIgnoredRules,
  ];
  const detailsResult = run(pnpmBin, detailsArgs);
  printFailure(pnpmBin, detailsArgs, detailsResult);
  return false;
}

try {
  const packages = await discoverPublishablePackages();

  console.log(`Checking package exports for ${packages.length} publishable packages...`);

  for (const pkg of packages) {
    process.stdout.write(`- ${pkg.name}... `);

    if (!runPublint(pkg) || !runAttw(pkg)) {
      process.stdout.write('failed\n');
      process.exit(1);
    }

    process.stdout.write('ok\n');
  }

  console.log('Package export checks passed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
