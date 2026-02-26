// Ported from ts/vendor/skills/src/add.ts (display helper functions only)
// Builds installation summary and result lines for display.

import { homedir } from 'os';
import { sep } from 'path';
import pc from 'picocolors';
import type { AgentType, InstallMode, InstallResult, Skill } from './types';
import { agents, isUniversalAgent } from './agents';
import { getCanonicalPath, isSkillInstalled } from './installer';
import { getSkillDisplayName } from './discovery';

/**
 * Shortens a path for display: replaces homedir with ~ and cwd with .
 */
export function shortenPath(fullPath: string, cwd: string): string {
  const home = homedir();
  if (fullPath === home || fullPath.startsWith(home + sep)) {
    return '~' + fullPath.slice(home.length);
  }
  if (fullPath === cwd || fullPath.startsWith(cwd + sep)) {
    return '.' + fullPath.slice(cwd.length);
  }
  return fullPath;
}

/**
 * Formats a list of items, truncating if too many
 */
export function formatList(items: string[], maxShow: number = 5): string {
  if (items.length <= maxShow) {
    return items.join(', ');
  }
  const shown = items.slice(0, maxShow);
  const remaining = items.length - maxShow;
  return `${shown.join(', ')} +${remaining} more`;
}

/**
 * Splits agents into universal and non-universal (symlinked) groups.
 * Returns display names for each group.
 */
export function splitAgentsByType(agentTypes: AgentType[]): {
  universal: string[];
  symlinked: string[];
} {
  const universal: string[] = [];
  const symlinked: string[] = [];

  for (const a of agentTypes) {
    if (isUniversalAgent(a)) {
      universal.push(agents[a].displayName);
    } else {
      symlinked.push(agents[a].displayName);
    }
  }

  return { universal, symlinked };
}

/**
 * Builds summary lines showing universal vs symlinked agents
 */
export function buildAgentSummaryLines(
  targetAgents: AgentType[],
  installMode: InstallMode
): string[] {
  const lines: string[] = [];
  const { universal, symlinked } = splitAgentsByType(targetAgents);

  if (installMode === 'symlink') {
    if (universal.length > 0) {
      lines.push(`  ${pc.green('universal:')} ${formatList(universal)}`);
    }
    if (symlinked.length > 0) {
      lines.push(`  ${pc.dim('symlink →')} ${formatList(symlinked)}`);
    }
  } else {
    // Copy mode - all agents get copies
    const allNames = targetAgents.map(a => agents[a].displayName);
    lines.push(`  ${pc.dim('copy →')} ${formatList(allNames)}`);
  }

  return lines;
}

/**
 * Builds result lines from installation results, splitting by universal vs symlinked
 */
export function buildResultLines(
  results: Array<{
    agent: string;
    symlinkFailed?: boolean;
  }>,
  targetAgents: AgentType[]
): string[] {
  const lines: string[] = [];

  const { universal, symlinked: symlinkAgents } = splitAgentsByType(targetAgents);

  const successfulSymlinks = results
    .filter(r => !r.symlinkFailed && !universal.includes(r.agent))
    .map(r => r.agent);
  const failedSymlinks = results.filter(r => r.symlinkFailed).map(r => r.agent);

  if (universal.length > 0) {
    lines.push(`  ${pc.green('universal:')} ${formatList(universal)}`);
  }
  if (successfulSymlinks.length > 0) {
    lines.push(`  ${pc.dim('symlinked:')} ${formatList(successfulSymlinks)}`);
  }
  if (failedSymlinks.length > 0) {
    lines.push(`  ${pc.yellow('copied:')} ${formatList(failedSymlinks)}`);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Installation summary (pre-install) and result display (post-install)
// ---------------------------------------------------------------------------

export interface SkillInstallEntry {
  skill: string;
  agent: string;
  success: boolean;
  path: string;
  canonicalPath?: string;
  mode: InstallMode;
  symlinkFailed?: boolean;
  error?: string;
  pluginName?: string;
}

/**
 * Checks which skills would overwrite existing installations.
 * Returns a map of skillName -> agentType -> isInstalled.
 */
export async function checkOverwrites(
  skills: Skill[],
  targetAgents: AgentType[],
  options: { global: boolean }
): Promise<Map<string, Map<string, boolean>>> {
  const checks = await Promise.all(
    skills.flatMap(skill =>
      targetAgents.map(async agent => ({
        skillName: skill.name,
        agent,
        installed: await isSkillInstalled(skill.name, agent, { global: options.global }),
      }))
    )
  );
  const status = new Map<string, Map<string, boolean>>();
  for (const { skillName, agent, installed } of checks) {
    if (!status.has(skillName)) {
      status.set(skillName, new Map());
    }
    status.get(skillName)!.set(agent, installed);
  }
  return status;
}

/**
 * Builds the pre-installation summary lines (skills, agents, overwrites).
 */
export function buildInstallationSummary(
  skills: Skill[],
  targetAgents: AgentType[],
  installMode: InstallMode,
  installGlobally: boolean,
  cwd: string,
  overwriteStatus: Map<string, Map<string, boolean>>
): string[] {
  const summaryLines: string[] = [];
  for (const skill of skills) {
    if (summaryLines.length > 0) summaryLines.push('');

    const canonicalPath = getCanonicalPath(skill.name, { global: installGlobally, cwd });
    const shortCanonical = shortenPath(canonicalPath, cwd);
    summaryLines.push(shortCanonical);
    summaryLines.push(...buildAgentSummaryLines(targetAgents, installMode));

    const skillOverwrites = overwriteStatus.get(skill.name);
    const overwriteAgents = targetAgents
      .filter(a => skillOverwrites?.get(a))
      .map(a => agents[a].displayName);

    if (overwriteAgents.length > 0) {
      summaryLines.push(`  ${pc.yellow('overwrites:')} ${formatList(overwriteAgents)}`);
    }
  }
  return summaryLines;
}

/**
 * Installs all skills to all target agents.
 * Returns an array of per-skill-per-agent results.
 */
export async function installAllSkills(
  skills: Skill[],
  targetAgents: AgentType[],
  options: { global: boolean; mode: InstallMode; cwd: string }
): Promise<SkillInstallEntry[]> {
  const { installSkillForAgent } = await import('./installer');

  const allResults: SkillInstallEntry[] = [];
  for (const skill of skills) {
    for (const agent of targetAgents) {
      const result = await installSkillForAgent(skill, agent, {
        global: options.global,
        mode: options.mode,
        cwd: options.cwd,
      });
      allResults.push({
        skill: getSkillDisplayName(skill),
        agent: agents[agent].displayName,
        pluginName: skill.pluginName,
        ...result,
      });
    }
  }
  return allResults;
}

/**
 * Builds the post-installation result display lines.
 */
export function buildInstallationResultDisplay(
  results: SkillInstallEntry[],
  targetAgents: AgentType[],
  cwd: string
): {
  resultNoteLines: string[];
  resultNoteTitle: string;
  symlinkWarning: { agents: string[] } | null;
  failedLines: string[];
} {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  const resultNoteLines: string[] = [];
  let resultNoteTitle = '';
  let symlinkWarning: { agents: string[] } | null = null;

  if (successful.length > 0) {
    const bySkill = new Map<string, SkillInstallEntry[]>();
    for (const r of successful) {
      const skillResults = bySkill.get(r.skill) || [];
      skillResults.push(r);
      bySkill.set(r.skill, skillResults);
    }

    const skillCount = bySkill.size;

    for (const [skillName, skillResults] of bySkill) {
      const firstResult = skillResults[0]!;

      if (firstResult.mode === 'copy') {
        resultNoteLines.push(`${pc.green('✓')} ${skillName} ${pc.dim('(copied)')}`);
        for (const r of skillResults) {
          const shortPath = shortenPath(r.path, cwd);
          resultNoteLines.push(`  ${pc.dim('→')} ${shortPath}`);
        }
      } else {
        if (firstResult.canonicalPath) {
          const shortPath = shortenPath(firstResult.canonicalPath, cwd);
          resultNoteLines.push(`${pc.green('✓')} ${shortPath}`);
        } else {
          resultNoteLines.push(`${pc.green('✓')} ${skillName}`);
        }
        resultNoteLines.push(...buildResultLines(skillResults, targetAgents));
      }
    }

    resultNoteTitle = pc.green(`Installed ${skillCount} skill${skillCount !== 1 ? 's' : ''}`);

    const symlinkFailures = successful.filter(r => r.mode === 'symlink' && r.symlinkFailed);
    if (symlinkFailures.length > 0) {
      symlinkWarning = { agents: symlinkFailures.map(r => r.agent) };
    }
  }

  const failedLines: string[] = [];
  if (failed.length > 0) {
    failedLines.push(`Failed to install ${failed.length}`);
    for (const r of failed) {
      failedLines.push(
        `  ${pc.red('✗')} ${r.skill} → ${r.agent}: ${pc.dim(r.error ?? 'Unknown error')}`
      );
    }
  }

  return { resultNoteLines, resultNoteTitle, symlinkWarning, failedLines };
}
