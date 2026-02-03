import { $ } from 'bun';

/**
 * Generates a unique volume name for e2e tests.
 * Format: e2e-{suiteName}-{nodeVersion}-{timestamp}
 *
 * @param suiteName - Test suite name
 * @param nodeVersion - Node.js version being tested
 * @returns Unique volume name
 */
export function generateVolumeName(suiteName: string, nodeVersion: string): string {
  const sanitizedSuite = suiteName.replace(/[^a-zA-Z0-9-]/g, '-');
  const sanitizedVersion = nodeVersion.replace(/\./g, '-');
  return `e2e-${sanitizedSuite}-${sanitizedVersion}-${Date.now()}`;
}

/**
 * Creates a Docker named volume for sharing state between container runs.
 *
 * @param name - Unique volume name
 * @returns The volume name (for use in mounts)
 * @throws If volume creation fails
 */
export async function createVolume(name: string): Promise<string> {
  const result = await $`docker volume create ${name}`.nothrow().quiet();

  if (result.exitCode !== 0) {
    const err = new Error(`Failed to create Docker volume: ${name}`);
    (err as Error & { cause: Error }).cause = new Error(result.stderr.toString() || result.stdout.toString());
    throw err;
  }

  return name;
}

/**
 * Removes a Docker named volume.
 * Logs errors but doesn't throw (cleanup should be best-effort).
 *
 * @param name - Volume name to remove
 */
export async function removeVolume(name: string): Promise<void> {
  const result = await $`docker volume rm ${name}`.nothrow().quiet();

  if (result.exitCode !== 0) {
    // Log but don't throw - cleanup should be best-effort
    console.warn(`[e2e] Warning: Failed to remove Docker volume ${name}: ${result.stderr.toString()}`);
  }
}

/**
 * Initializes a Docker volume with correct ownership for the container user.
 * This is necessary because Docker volumes are created with root ownership by default.
 *
 * @param volumeName - Name of the volume to initialize
 * @param imageTag - Docker image to use for the initialization container
 * @param runtime - Runtime type ('node' or 'deno') to determine the correct user/group
 */
export async function initializeVolumeOwnership(
  volumeName: string,
  imageTag: string,
  runtime: 'node' | 'deno'
): Promise<void> {
  // Node images use node:node, Deno images use deno:deno
  const user = runtime === 'node' ? 'node:node' : 'deno:deno';

  // Run a quick container as root to chown the volume contents
  const result = await $`docker run --rm --user root -v ${volumeName}:/mnt/vol ${imageTag} chown -R ${user} /mnt/vol`.nothrow().quiet();

  if (result.exitCode !== 0) {
    const err = new Error(`Failed to initialize volume ownership for: ${volumeName}`);
    (err as Error & { cause: Error }).cause = new Error(result.stderr.toString() || result.stdout.toString());
    throw err;
  }
}
