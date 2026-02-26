// Ported from ts/vendor/skills/src/installer.ts
// Core installation logic: copy/symlink skills to agent directories.
// Simplified: only installSkillForAgent (no remote/well-known/mintlify variants).

import {
  mkdir,
  cp,
  access,
  readdir,
  symlink,
  lstat,
  rm,
  readlink,
  stat,
  realpath,
} from 'fs/promises';
import { join, basename, normalize, resolve, sep, relative, dirname } from 'path';
import { homedir, platform } from 'os';
import type { Skill, AgentType, InstallMode, InstallResult } from './types';
import { agents, isUniversalAgent } from './agents';
import { AGENTS_DIR, SKILLS_SUBDIR } from './constants';

/**
 * Sanitizes a filename/directory name to prevent path traversal attacks
 * and ensures it follows kebab-case convention
 */
export function sanitizeName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '');

  return sanitized.substring(0, 255) || 'unnamed-skill';
}

/**
 * Validates that a path is within an expected base directory
 */
function isPathSafe(basePath: string, targetPath: string): boolean {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedTarget = normalize(resolve(targetPath));

  return normalizedTarget.startsWith(normalizedBase + sep) || normalizedTarget === normalizedBase;
}

export function getCanonicalSkillsDir(global: boolean, cwd?: string): string {
  const baseDir = global ? homedir() : cwd || process.cwd();
  return join(baseDir, AGENTS_DIR, SKILLS_SUBDIR);
}

/**
 * Gets the base directory for an agent's skills, respecting universal agents.
 * Universal agents always use the canonical directory, which prevents
 * redundant symlinks and double-listing of skills.
 */
export function getAgentBaseDir(agentType: AgentType, global: boolean, cwd?: string): string {
  if (isUniversalAgent(agentType)) {
    return getCanonicalSkillsDir(global, cwd);
  }

  const agent = agents[agentType];
  const baseDir = global ? homedir() : cwd || process.cwd();

  if (global) {
    if (agent.globalSkillsDir === undefined) {
      return join(baseDir, agent.skillsDir);
    }
    return agent.globalSkillsDir;
  }

  return join(baseDir, agent.skillsDir);
}

function resolveSymlinkTarget(linkPath: string, linkTarget: string): string {
  return resolve(dirname(linkPath), linkTarget);
}

async function cleanAndCreateDirectory(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors - mkdir will fail if there's a real problem
  }
  await mkdir(path, { recursive: true });
}

async function resolveParentSymlinks(path: string): Promise<string> {
  const resolved = resolve(path);
  const dir = dirname(resolved);
  const base = basename(resolved);
  try {
    const realDir = await realpath(dir);
    return join(realDir, base);
  } catch {
    return resolved;
  }
}

async function createSymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    const resolvedTarget = resolve(target);
    const resolvedLinkPath = resolve(linkPath);

    const [realTarget, realLinkPath] = await Promise.all([
      realpath(resolvedTarget).catch(() => resolvedTarget),
      realpath(resolvedLinkPath).catch(() => resolvedLinkPath),
    ]);

    if (realTarget === realLinkPath) {
      return true;
    }

    const realTargetWithParents = await resolveParentSymlinks(target);
    const realLinkPathWithParents = await resolveParentSymlinks(linkPath);

    if (realTargetWithParents === realLinkPathWithParents) {
      return true;
    }

    try {
      const stats = await lstat(linkPath);
      if (stats.isSymbolicLink()) {
        const existingTarget = await readlink(linkPath);
        if (resolveSymlinkTarget(linkPath, existingTarget) === resolvedTarget) {
          return true;
        }
        await rm(linkPath);
      } else {
        await rm(linkPath, { recursive: true });
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ELOOP') {
        try {
          await rm(linkPath, { force: true });
        } catch {
          // If we can't remove it, symlink creation will fail and trigger copy fallback
        }
      }
    }

    const linkDir = dirname(linkPath);
    await mkdir(linkDir, { recursive: true });

    const realLinkDir = await resolveParentSymlinks(linkDir);
    const relativePath = relative(realLinkDir, target);
    const symlinkType = platform() === 'win32' ? 'junction' : undefined;

    await symlink(relativePath, linkPath, symlinkType);
    return true;
  } catch {
    return false;
  }
}

export async function installSkillForAgent(
  skill: Skill,
  agentType: AgentType,
  options: { global?: boolean; cwd?: string; mode?: InstallMode } = {}
): Promise<InstallResult> {
  const agent = agents[agentType];
  const isGlobal = options.global ?? false;
  const cwd = options.cwd || process.cwd();

  if (isGlobal && agent.globalSkillsDir === undefined) {
    return {
      success: false,
      path: '',
      mode: options.mode ?? 'symlink',
      error: `${agent.displayName} does not support global skill installation`,
    };
  }

  const rawSkillName = skill.name || basename(skill.path);
  const skillName = sanitizeName(rawSkillName);

  const canonicalBase = getCanonicalSkillsDir(isGlobal, cwd);
  const canonicalDir = join(canonicalBase, skillName);

  const agentBase = getAgentBaseDir(agentType, isGlobal, cwd);
  const agentDir = join(agentBase, skillName);

  const installMode = options.mode ?? 'symlink';

  if (!isPathSafe(canonicalBase, canonicalDir)) {
    return {
      success: false,
      path: agentDir,
      mode: installMode,
      error: 'Invalid skill name: potential path traversal detected',
    };
  }

  if (!isPathSafe(agentBase, agentDir)) {
    return {
      success: false,
      path: agentDir,
      mode: installMode,
      error: 'Invalid skill name: potential path traversal detected',
    };
  }

  try {
    if (installMode === 'copy') {
      await cleanAndCreateDirectory(agentDir);
      await copyDirectory(skill.path, agentDir);

      return {
        success: true,
        path: agentDir,
        mode: 'copy',
      };
    }

    // Symlink mode: copy to canonical location and symlink to agent location
    await cleanAndCreateDirectory(canonicalDir);
    await copyDirectory(skill.path, canonicalDir);

    if (isGlobal && isUniversalAgent(agentType)) {
      return {
        success: true,
        path: canonicalDir,
        canonicalPath: canonicalDir,
        mode: 'symlink',
      };
    }

    const symlinkCreated = await createSymlink(canonicalDir, agentDir);

    if (!symlinkCreated) {
      await cleanAndCreateDirectory(agentDir);
      await copyDirectory(skill.path, agentDir);

      return {
        success: true,
        path: agentDir,
        canonicalPath: canonicalDir,
        mode: 'symlink',
        symlinkFailed: true,
      };
    }

    return {
      success: true,
      path: agentDir,
      canonicalPath: canonicalDir,
      mode: 'symlink',
    };
  } catch (error) {
    return {
      success: false,
      path: agentDir,
      mode: installMode,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

const EXCLUDE_FILES = new Set(['metadata.json']);
const EXCLUDE_DIRS = new Set(['.git']);

const isExcluded = (name: string, isDirectory: boolean = false): boolean => {
  if (EXCLUDE_FILES.has(name)) return true;
  if (name.startsWith('_')) return true;
  if (isDirectory && EXCLUDE_DIRS.has(name)) return true;
  return false;
};

async function copyDirectory(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });

  const entries = await readdir(src, { withFileTypes: true });

  await Promise.all(
    entries
      .filter(entry => !isExcluded(entry.name, entry.isDirectory()))
      .map(async entry => {
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);

        if (entry.isDirectory()) {
          await copyDirectory(srcPath, destPath);
        } else {
          await cp(srcPath, destPath, {
            dereference: true,
            recursive: true,
          });
        }
      })
  );
}

export async function isSkillInstalled(
  skillName: string,
  agentType: AgentType,
  options: { global?: boolean; cwd?: string } = {}
): Promise<boolean> {
  const agent = agents[agentType];
  const sanitized = sanitizeName(skillName);

  if (options.global && agent.globalSkillsDir === undefined) {
    return false;
  }

  const targetBase = options.global
    ? agent.globalSkillsDir!
    : join(options.cwd || process.cwd(), agent.skillsDir);

  const skillDir = join(targetBase, sanitized);

  if (!isPathSafe(targetBase, skillDir)) {
    return false;
  }

  try {
    await access(skillDir);
    return true;
  } catch {
    return false;
  }
}
