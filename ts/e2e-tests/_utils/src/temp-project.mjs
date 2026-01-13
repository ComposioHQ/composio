/**
 * Utility for creating temporary test projects in e2e tests.
 * 
 * Usage:
 *   import { createTempProject } from '../../_utils/temp-project.mjs';
 *   
 *   const { tempDir, cleanup } = await createTempProject('my-test', '/path/to/fixtures');
 *   try {
 *     // Run tests in tempDir
 *   } finally {
 *     await cleanup();
 *   }
 */

import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Creates a temporary project directory by copying fixture files.
 * 
 * @param {string} name - Name prefix for the temp directory
 * @param {string} fixturesDir - Path to the fixtures directory to copy
 * @returns {Promise<{ tempDir: string, cleanup: () => Promise<void> }>}
 */
export async function createTempProject(name, fixturesDir) {
  const tempDir = await mkdtemp(join(tmpdir(), `${name}-`));
  
  // Copy fixtures to temp directory
  await cp(fixturesDir, tempDir, { recursive: true });
  
  const cleanup = async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };
  
  return { tempDir, cleanup };
}
