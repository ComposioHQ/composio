#!/usr/bin/env bun
/**
 * Removes all Docker images used by Node.js and Deno e2e tests.
 * Images are identified by the label `composio.e2e=true`.
 */

import { $ } from 'bun';

async function cleanImages(runtime: 'node' | 'deno'): Promise<number> {
  console.log(`Finding e2e ${runtime === 'node' ? 'Node.js' : 'Deno'} Docker images...`);

  // Find all images with the e2e labels
  const result = await $`docker images --filter label=composio.e2e=true --filter label=composio.runtime=${runtime} --format {{.Repository}}:{{.Tag}}`
    .nothrow()
    .quiet();

  if (result.exitCode !== 0) {
    console.error(`Failed to list Docker images:`, result.stderr.toString());
    return 1;
  }

  const images = result.stdout
    .toString()
    .trim()
    .split('\n')
    .filter((img) => img.length > 0 && !img.includes('<none>'));

  if (images.length === 0) {
    console.log(`No e2e ${runtime === 'node' ? 'Node.js' : 'Deno'} Docker images found.`);
    return 0;
  }

  console.log(`Found ${images.length} image(s) to remove:`);
  for (const img of images) {
    console.log(`  - ${img}`);
  }

  console.log('\nRemoving images...');

  // Remove images one by one to safely handle each image name
  let removeFailures = 0;
  for (const img of images) {
    const removeResult = await $`docker rmi ${img}`.nothrow().quiet();
    if (removeResult.exitCode !== 0) {
      console.error(`  Failed to remove ${img}:`, removeResult.stderr.toString());
      removeFailures++;
    }
  }

  return removeFailures;
}

async function main() {
  let totalFailures = 0;

  // Clean Node.js images
  totalFailures += await cleanImages('node');

  // Clean Deno images
  totalFailures += await cleanImages('deno');

  if (totalFailures > 0) {
    console.error(`\nFailed to remove ${totalFailures} image(s).`);
    process.exit(1);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
