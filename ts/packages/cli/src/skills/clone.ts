// Git clone and temp directory management for skills installation.

import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

export const SKILLS_REPO_URL = 'https://github.com/composiohq/skills.git';
export const SKILLS_MANUAL_COMMAND = 'npx skills add composiohq/skills';

/**
 * Clones the composiohq/skills repo to a temp directory.
 * Returns the path to the temp directory.
 */
export async function cloneSkillsRepo(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'composio-skills-'));
  execSync(`git clone --depth 1 ${SKILLS_REPO_URL} "${tempDir}"`, {
    stdio: 'pipe',
    timeout: 60_000,
  });
  return tempDir;
}

export async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}
