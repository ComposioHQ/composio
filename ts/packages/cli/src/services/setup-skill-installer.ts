import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { installSkill, readInstalledSkillReleaseTag } from 'src/effects/install-skill';
import { APP_VERSION } from 'src/constants';
import { readInstalledReleaseTag } from 'src/services/run-companion-modules';
import { NodeOs } from './node-os';

export const resolveSetupSkillReleaseTag = (
  execPath = process.execPath,
  fallbackVersion = APP_VERSION
): string => readInstalledReleaseTag(execPath) ?? `@composio/cli@${fallbackVersion}`;

export const isClaudeSkillCurrent = (home: string, releaseTag: string): boolean => {
  const target = path.join(home, '.claude', 'skills', 'composio-cli');
  const skillDir = path.join(home, '.agents', 'skills', 'composio-cli');
  return fs.existsSync(target) && readInstalledSkillReleaseTag(skillDir) === releaseTag;
};

export class SetupSkillInstaller extends Effect.Service<SetupSkillInstaller>()(
  'services/SetupSkillInstaller',
  {
    sync: () => ({
      isClaudeSkillInstalled: Effect.gen(function* () {
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
