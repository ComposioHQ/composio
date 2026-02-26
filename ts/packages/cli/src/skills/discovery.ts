// Ported from ts/vendor/skills/src/skills.ts
// Skill discovery: walks directories to find SKILL.md files and parses frontmatter.
// Simplified: no plugin manifest handling.

import { readdir, readFile, stat } from 'fs/promises';
import { join, basename, dirname } from 'path';
import matter from 'gray-matter';
import type { Skill } from './types';

const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '__pycache__'];

async function hasSkillMd(dir: string): Promise<boolean> {
  try {
    const skillPath = join(dir, 'SKILL.md');
    const stats = await stat(skillPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

export async function parseSkillMd(skillMdPath: string): Promise<Skill | null> {
  try {
    const content = await readFile(skillMdPath, 'utf-8');
    const { data } = matter(content);

    if (!data.name || !data.description) {
      return null;
    }

    // Ensure name and description are strings (YAML can parse numbers, booleans, etc.)
    if (typeof data.name !== 'string' || typeof data.description !== 'string') {
      return null;
    }

    // Skip internal skills
    if (data.metadata?.internal === true) {
      return null;
    }

    return {
      name: data.name,
      description: data.description,
      path: dirname(skillMdPath),
      rawContent: content,
      metadata: data.metadata,
    };
  } catch {
    return null;
  }
}

async function findSkillDirs(dir: string, depth = 0, maxDepth = 5): Promise<string[]> {
  if (depth > maxDepth) return [];

  try {
    const [hasSkill, entries] = await Promise.all([
      hasSkillMd(dir),
      readdir(dir, { withFileTypes: true }).catch(() => []),
    ]);

    const currentDir = hasSkill ? [dir] : [];

    // Search subdirectories in parallel
    const subDirResults = await Promise.all(
      entries
        .filter(entry => entry.isDirectory() && !SKIP_DIRS.includes(entry.name))
        .map(entry => findSkillDirs(join(dir, entry.name), depth + 1, maxDepth))
    );

    return [...currentDir, ...subDirResults.flat()];
  } catch {
    return [];
  }
}

export async function discoverSkills(basePath: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  const seenNames = new Set<string>();
  const searchPath = basePath;

  // If pointing directly at a skill, return it immediately
  if (await hasSkillMd(searchPath)) {
    const skill = await parseSkillMd(join(searchPath, 'SKILL.md'));
    if (skill) {
      skills.push(skill);
      seenNames.add(skill.name);
      return skills;
    }
  }

  // Search common skill locations first
  const prioritySearchDirs = [
    searchPath,
    join(searchPath, 'skills'),
    join(searchPath, 'skills/.curated'),
    join(searchPath, 'skills/.experimental'),
    join(searchPath, 'skills/.system'),
    join(searchPath, '.agent/skills'),
    join(searchPath, '.agents/skills'),
    join(searchPath, '.claude/skills'),
    join(searchPath, '.cline/skills'),
    join(searchPath, '.codebuddy/skills'),
    join(searchPath, '.codex/skills'),
    join(searchPath, '.commandcode/skills'),
    join(searchPath, '.continue/skills'),
    join(searchPath, '.github/skills'),
    join(searchPath, '.goose/skills'),
    join(searchPath, '.iflow/skills'),
    join(searchPath, '.junie/skills'),
    join(searchPath, '.kilocode/skills'),
    join(searchPath, '.kiro/skills'),
    join(searchPath, '.mux/skills'),
    join(searchPath, '.neovate/skills'),
    join(searchPath, '.opencode/skills'),
    join(searchPath, '.openhands/skills'),
    join(searchPath, '.pi/skills'),
    join(searchPath, '.qoder/skills'),
    join(searchPath, '.roo/skills'),
    join(searchPath, '.trae/skills'),
    join(searchPath, '.windsurf/skills'),
    join(searchPath, '.zencoder/skills'),
  ];

  for (const dir of prioritySearchDirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = join(dir, entry.name);
          if (await hasSkillMd(skillDir)) {
            const skill = await parseSkillMd(join(skillDir, 'SKILL.md'));
            if (skill && !seenNames.has(skill.name)) {
              skills.push(skill);
              seenNames.add(skill.name);
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  // Fall back to recursive search if nothing found in priority dirs
  if (skills.length === 0) {
    const allSkillDirs = await findSkillDirs(searchPath);

    for (const skillDir of allSkillDirs) {
      const skill = await parseSkillMd(join(skillDir, 'SKILL.md'));
      if (skill && !seenNames.has(skill.name)) {
        skills.push(skill);
        seenNames.add(skill.name);
      }
    }
  }

  return skills;
}

export function getSkillDisplayName(skill: Skill): string {
  return skill.name || basename(skill.path);
}
