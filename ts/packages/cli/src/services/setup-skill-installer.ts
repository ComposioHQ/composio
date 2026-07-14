import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import {
  installSkill,
  readInstalledSkillReleaseTag,
  resolveInstalledSkillName,
  resolveTargetSkillPath,
} from 'src/effects/install-skill';
import { APP_VERSION } from 'src/constants';
import { readInstalledReleaseTag } from 'src/services/run-companion-modules';
import { NodeOs } from './node-os';

export const resolveSetupSkillReleaseTag = (
  execPath = process.execPath,
  fallbackVersion = APP_VERSION
): string => readInstalledReleaseTag(execPath) ?? `@composio/cli@${fallbackVersion}`;

export const isClaudeSkillCurrent = (home: string, releaseTag: string): boolean => {
  const skillName = resolveInstalledSkillName();
  const target = resolveTargetSkillPath({ home, skillName, target: 'claude' });
  if (readInstalledSkillReleaseTag(target) !== releaseTag) return false;
  try {
    fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8');
    return true;
  } catch {
    return false;
  }
};

export class SetupSkillInstaller extends Effect.Service<SetupSkillInstaller>()(
  'services/SetupSkillInstaller',
  {
    sync: () => ({
      isClaudeSkillReady: Effect.gen(function* () {
        const os = yield* NodeOs;
        return isClaudeSkillCurrent(os.homedir, resolveSetupSkillReleaseTag());
      }),
      ensureClaudeSkill: Effect.gen(function* () {
        const os = yield* NodeOs;
        const releaseTag = resolveSetupSkillReleaseTag();
        if (isClaudeSkillCurrent(os.homedir, releaseTag)) return false;

        yield* installSkill({
          target: 'claude',
          releaseTag,
        });
        return true;
      }),
    }),
    dependencies: [],
  }
) {}
