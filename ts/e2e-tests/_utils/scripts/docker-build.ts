#!/usr/bin/env bun
/**
 * Builds Docker images for Node.js e2e tests.
 *
 * In CI mode (COMPOSIO_E2E_NODE_VERSION set):
 *   Only builds the image for the specified version.
 *
 * In local mode:
 *   Builds images for all versions in WELL_KNOWN_NODE_VERSIONS.
 */

import { $ } from 'bun';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WELL_KNOWN_NODE_VERSIONS } from '../src/const';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getRepoRoot(): string {
  // From scripts/ to repo root: scripts -> _utils -> e2e-tests -> ts -> composio
  return resolve(__dirname, '../../../..');
}

function imageTagForNodeVersion(nodeVersion: string): string {
  return `composio-e2e-node:${nodeVersion}`;
}

function defaultLabels(nodeVersion: string): Record<string, string> {
  return {
    'composio.e2e': 'true',
    'composio.runtime': 'node',
    'composio.node_version': nodeVersion,
  };
}

async function buildImage(nodeVersion: string, repoRoot: string): Promise<boolean> {
  const dockerfilePath = resolve(repoRoot, 'ts/e2e-tests/_utils/Dockerfile.node');
  const imageTag = imageTagForNodeVersion(nodeVersion);
  const labels = defaultLabels(nodeVersion);
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

async function main() {
  const repoRoot = getRepoRoot();
  const currentNodeVersion = process.versions.node;
  const envVersion = Bun.env.COMPOSIO_E2E_NODE_VERSION;

  // In CI mode with COMPOSIO_E2E_NODE_VERSION set, only build that specific version
  // Otherwise, build all well-known versions (for local development)
  const versions = new Set<string>();

  if (envVersion) {
    versions.add(envVersion);
    console.log(`Building Docker image for CI matrix version: ${envVersion}`);
  } else {
    for (const version of WELL_KNOWN_NODE_VERSIONS) {
      if (version === 'current') {
        versions.add(currentNodeVersion);
      } else {
        versions.add(version);
      }
    }
    console.log('Building Docker images for Node.js versions:');
    for (const v of versions) {
      const isCurrent = v === currentNodeVersion ? ' (current)' : '';
      console.log(`  - ${v}${isCurrent}`);
    }
  }

  const versionList = Array.from(versions);

  let failed = 0;
  for (const version of versionList) {
    const success = await buildImage(version, repoRoot);
    if (!success) {
      failed++;
    }
  }

  console.log('\n---');
  console.log(`Built ${versionList.length - failed}/${versionList.length} images.`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
