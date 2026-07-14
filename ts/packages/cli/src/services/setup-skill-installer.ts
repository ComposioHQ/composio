import { FileSystem, Path } from '@effect/platform';
import { Effect } from 'effect';
import {
  installSkill,
  resolveInstalledSkillName,
  resolveTargetSkillPath,
  SKILL_RELEASE_TAG_FILENAME,
} from 'src/effects/install-skill';
import { APP_VERSION } from 'src/constants';
import { readInstalledReleaseTag } from 'src/services/run-companion-modules';
import { NodeOs } from './node-os';

export const resolveSetupSkillReleaseTag = (
  execPath = process.execPath,
  fallbackVersion = APP_VERSION
): string => readInstalledReleaseTag(execPath) ?? `@composio/cli@${fallbackVersion}`;

const checkClaudeSkillCurrent = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  home: string,
  releaseTag: string
) =>
  Effect.gen(function* () {
    const skillName = resolveInstalledSkillName();
    const target = resolveTargetSkillPath({ home, path, skillName, target: 'claude' });
    const installedReleaseTag = yield* fs
      .readFileString(path.join(target, SKILL_RELEASE_TAG_FILENAME), 'utf8')
      .pipe(
        Effect.map(value => value.trim()),
        Effect.catchAll(() => Effect.succeed(undefined))
      );
    if (installedReleaseTag !== releaseTag) return false;
    return yield* fs.readFileString(path.join(target, 'SKILL.md'), 'utf8').pipe(
      Effect.as(true),
      Effect.catchAll(() => Effect.succeed(false))
    );
  });

export const isClaudeSkillCurrent = (home: string, releaseTag: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* checkClaudeSkillCurrent(fs, path, home, releaseTag);
  });

export class SetupSkillInstaller extends Effect.Service<SetupSkillInstaller>()(
  'services/SetupSkillInstaller',
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const os = yield* NodeOs;
      const isCurrent = (releaseTag: string) =>
        checkClaudeSkillCurrent(fs, path, os.homedir, releaseTag);

      return {
        isClaudeSkillReady: isCurrent(resolveSetupSkillReleaseTag()),
        ensureClaudeSkill: Effect.gen(function* () {
          const releaseTag = resolveSetupSkillReleaseTag();
          if (yield* isCurrent(releaseTag)) return false;

          yield* installSkill({
            target: 'claude',
            releaseTag,
          });
          return true;
        }),
      };
    }),
    dependencies: [],
  }
) {}
