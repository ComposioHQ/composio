#!/usr/bin/env bun
/**
 * Removes all Docker images used by the Node.js e2e tests.
 * Images are identified by the label `composio.e2e=true` and `composio.runtime=node`.
 */

import { $ } from 'bun';

async function main() {
  console.log('Finding e2e Node.js Docker images...');

  // Find all images with the e2e labels
  const result = await $`docker images --filter label=composio.e2e=true --filter label=composio.runtime=node --format {{.Repository}}:{{.Tag}}`
    .nothrow()
    .quiet();

  if (result.exitCode !== 0) {
    console.error('Failed to list Docker images:', result.stderr.toString());
    process.exit(1);
  }

  const images = result.stdout
    .toString()
    .trim()
    .split('\n')
    .filter((img) => img.length > 0 && !img.includes('<none>'));

  if (images.length === 0) {
    console.log('No e2e Node.js Docker images found.');
    return;
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

  if (removeFailures > 0) {
    console.error(`Failed to remove ${removeFailures} image(s).`);
    process.exit(1);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
