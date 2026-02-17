#!/usr/bin/env bun
/**
 * Builds Docker images for Node.js and Deno e2e tests.
 *
 * In CI mode (COMPOSIO_E2E_NODE_VERSION or COMPOSIO_E2E_DENO_VERSION set):
 *   Only builds the image for the specified version.
 *
 * In local mode:
 *   Builds images for all versions in WELL_KNOWN_NODE_VERSIONS and WELL_KNOWN_DENO_VERSIONS.
 */

import { $ } from 'bun';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { WELL_KNOWN_NODE_VERSIONS, WELL_KNOWN_DENO_VERSIONS } from '../src/const';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getRepoRoot(): string {
  // From scripts/ to repo root: scripts -> _utils -> e2e-tests -> ts -> composio
  return resolve(__dirname, '../../../..');
}

function getNvmrcVersion(repoRoot: string): string {
  try {
    return readFileSync(resolve(repoRoot, '.nvmrc'), 'utf-8').trim();
  } catch {
    return process.versions.node;
  }
}

function getDvmrcVersion(repoRoot: string): string {
  try {
    return readFileSync(resolve(repoRoot, '.dvmrc'), 'utf-8').trim();
  } catch {
    return '2.6.7'; // fallback default
  }
}

// ============================================================================
// Node.js image building
// ============================================================================

function imageTagForNodeVersion(nodeVersion: string): string {
  return `composio-e2e-node:${nodeVersion}`;
}

function defaultNodeLabels(nodeVersion: string): Record<string, string> {
  return {
    'composio.e2e': 'true',
    'composio.runtime': 'node',
    'composio.node_version': nodeVersion,
  };
}

async function buildNodeImage(nodeVersion: string, repoRoot: string): Promise<boolean> {
  const dockerfilePath = resolve(repoRoot, 'ts/e2e-tests/_utils/Dockerfile.node');
  const imageTag = imageTagForNodeVersion(nodeVersion);
  const labels = defaultNodeLabels(nodeVersion);
  const labelArgs = Object.entries(labels)
    .map(([k, v]) => `--label=${k}=${v}`)
    .join(' ');

  console.log(`\nBuilding image for Node.js ${nodeVersion}...`);

  const result = await $`docker build -f ${dockerfilePath} --build-arg NODE_VERSION=${nodeVersion} ${{ raw: labelArgs }} -t ${imageTag} ${repoRoot}`
    .cwd(repoRoot)
    .nothrow();

  if (result.exitCode !== 0) {
    console.error(`  Failed to build ${imageTag}:`);
    console.error(result.stderr.toString() || result.stdout.toString());
    return false;
  }

  console.log(`  Built ${imageTag}`);
  return true;
}

// ============================================================================
// Deno image building
// ============================================================================

function imageTagForDenoVersion(denoVersion: string): string {
  return `composio-e2e-deno:${denoVersion}`;
}

function defaultDenoLabels(denoVersion: string): Record<string, string> {
  return {
    'composio.e2e': 'true',
    'composio.runtime': 'deno',
    'composio.deno_version': denoVersion,
  };
}

async function buildDenoImage(denoVersion: string, repoRoot: string): Promise<boolean> {
  const dockerfilePath = resolve(repoRoot, 'ts/e2e-tests/_utils/Dockerfile.deno');
  const imageTag = imageTagForDenoVersion(denoVersion);
  const labels = defaultDenoLabels(denoVersion);
  const labelArgs = Object.entries(labels)
    .map(([k, v]) => `--label=${k}=${v}`)
    .join(' ');

  console.log(`\nBuilding image for Deno ${denoVersion}...`);

  const result = await $`docker build -f ${dockerfilePath} --build-arg DENO_VERSION=${denoVersion} ${{ raw: labelArgs }} -t ${imageTag} ${repoRoot}`
    .cwd(repoRoot)
    .nothrow();

  if (result.exitCode !== 0) {
    console.error(`  Failed to build ${imageTag}:`);
    console.error(result.stderr.toString() || result.stdout.toString());
    return false;
  }

  console.log(`  Built ${imageTag}`);
  return true;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const repoRoot = getRepoRoot();
  const currentNodeVersion = getNvmrcVersion(repoRoot);
  const currentDenoVersion = getDvmrcVersion(repoRoot);
  const envNodeVersion = Bun.env.COMPOSIO_E2E_NODE_VERSION;
  const envDenoVersion = Bun.env.COMPOSIO_E2E_DENO_VERSION;

  const nodeVersions = new Set<string>();
  const denoVersions = new Set<string>();

  // Determine which Node.js versions to build
  if (envNodeVersion) {
    nodeVersions.add(envNodeVersion);
    console.log(`Building Docker image for CI matrix Node.js version: ${envNodeVersion}`);
  } else if (!envDenoVersion) {
    // Build all Node.js versions only if no specific runtime was requested
    for (const version of WELL_KNOWN_NODE_VERSIONS) {
      if (version === 'current') {
        nodeVersions.add(currentNodeVersion);
      } else {
        nodeVersions.add(version);
      }
    }
    if (nodeVersions.size > 0) {
      console.log('Building Docker images for Node.js versions:');
      for (const v of nodeVersions) {
        const isCurrent = v === currentNodeVersion ? ' (current)' : '';
        console.log(`  - ${v}${isCurrent}`);
      }
    }
  }

  // Determine which Deno versions to build
  if (envDenoVersion) {
    denoVersions.add(envDenoVersion);
    console.log(`Building Docker image for CI matrix Deno version: ${envDenoVersion}`);
  } else if (!envNodeVersion) {
    // Build all Deno versions only if no specific runtime was requested
    for (const version of WELL_KNOWN_DENO_VERSIONS) {
      if (version === 'current') {
        denoVersions.add(currentDenoVersion);
      } else {
        denoVersions.add(version);
      }
    }
    if (denoVersions.size > 0) {
      console.log('Building Docker images for Deno versions:');
      for (const v of denoVersions) {
        const isCurrent = v === currentDenoVersion ? ' (current)' : '';
        console.log(`  - ${v}${isCurrent}`);
      }
    }
  }

  let failed = 0;
  let total = 0;

  // Build Node.js images
  for (const version of nodeVersions) {
    total++;
    const success = await buildNodeImage(version, repoRoot);
    if (!success) {
      failed++;
    }
  }

  // Build Deno images
  for (const version of denoVersions) {
    total++;
    const success = await buildDenoImage(version, repoRoot);
    if (!success) {
      failed++;
    }
  }

  console.log('\n---');
  console.log(`Built ${total - failed}/${total} images.`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
