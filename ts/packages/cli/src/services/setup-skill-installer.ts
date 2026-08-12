import { FileSystem, HttpClient, Path } from '@effect/platform';
import { Config, Effect } from 'effect';
import {
  inferSkillReleaseChannel,
  installSkill,
  resolveInstalledSkillName,
  resolveSkillReleaseTag,
  resolveTargetSkillPath,
  SKILL_RELEASE_TAG_FILENAME,
} from 'src/effects/install-skill';
import { GITHUB_CONFIG } from 'src/effects/github-config';
import { APP_VERSION } from 'src/constants';
import { resolveRunningCliReleaseTag } from 'src/services/run-companion-modules';
import { NodeOs } from './node-os';

export const resolveSetupSkillReleaseTag = (
  execPath = process.execPath,
  fallbackVersion = APP_VERSION
) =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const githubConfig = yield* Config.all(GITHUB_CONFIG);
    const installedReleaseTag = yield* resolveRunningCliReleaseTag(execPath, fallbackVersion);

    return yield* resolveSkillReleaseTag({
      channel: inferSkillReleaseChannel(fallbackVersion),
      githubConfig,
      httpClient,
      installedReleaseTag,
    });
  });

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

const isLinkedTo = (fs: FileSystem.FileSystem, path: Path.Path, source: string, target: string) =>
  fs.readLink(source).pipe(
    Effect.map(link => path.resolve(path.dirname(source), link) === target),
    Effect.catchAll(() => Effect.succeed(false))
  );

export const hasManagedClaudeSkill = (home: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const skillName = resolveInstalledSkillName();
    const canonicalSkill = path.join(home, '.agents', 'skills', skillName);
    const claudeSkill = resolveTargetSkillPath({ home, path, skillName, target: 'claude' });

    if (yield* isLinkedTo(fs, path, claudeSkill, canonicalSkill)) return true;
    const isManaged = yield* fs.exists(path.join(canonicalSkill, SKILL_RELEASE_TAG_FILENAME));
    if (!isManaged) return false;

    const otherTargets = (['codex', 'openclaw'] as const).map(target =>
      resolveTargetSkillPath({ home, path, skillName, target })
    );
    const references = yield* Effect.all(
      otherTargets.map(target => isLinkedTo(fs, path, target, canonicalSkill))
    );
    return !references.some(Boolean);
  });

export const removeManagedClaudeSkill = (home: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const skillName = resolveInstalledSkillName();
    const canonicalSkill = path.join(home, '.agents', 'skills', skillName);
    const claudeSkill = resolveTargetSkillPath({ home, path, skillName, target: 'claude' });

    let changed = false;
    if (yield* isLinkedTo(fs, path, claudeSkill, canonicalSkill)) {
      yield* fs.remove(claudeSkill, { recursive: true, force: true });
      changed = true;
    }

    const isManaged = yield* fs.exists(path.join(canonicalSkill, SKILL_RELEASE_TAG_FILENAME));
    if (!isManaged) return changed;

    const otherTargets = (['codex', 'openclaw'] as const).map(target =>
      resolveTargetSkillPath({ home, path, skillName, target })
    );
    const references = yield* Effect.all(
      otherTargets.map(target => isLinkedTo(fs, path, target, canonicalSkill))
    );
    const stillReferenced = references.some(Boolean);
    if (!stillReferenced) {
      yield* fs.remove(canonicalSkill, { recursive: true, force: true });
      changed = true;
    }
    return changed;
  }).pipe(Effect.uninterruptible);

export class SetupSkillInstaller extends Effect.Service<SetupSkillInstaller>()(
  'services/SetupSkillInstaller',
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const os = yield* NodeOs;
      const isCurrent = (releaseTag: string) =>
        checkClaudeSkillCurrent(fs, path, os.homedir, releaseTag);
      const releaseTag = yield* Effect.cached(
        resolveSetupSkillReleaseTag().pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path)
        )
      );

      return {
        isClaudeSkillReady: Effect.flatMap(releaseTag, isCurrent),
        hasManagedClaudeSkill: hasManagedClaudeSkill(os.homedir),
        ensureClaudeSkill: Effect.gen(function* () {
          const targetReleaseTag = yield* releaseTag;
          if (yield* isCurrent(targetReleaseTag)) return false;

          yield* installSkill({
            target: 'claude',
            releaseTag: targetReleaseTag,
            silent: true,
          });
          return true;
        }),
        removeClaudeSkill: removeManagedClaudeSkill(os.homedir),
      };
    }),
    dependencies: [],
  }
) {}
