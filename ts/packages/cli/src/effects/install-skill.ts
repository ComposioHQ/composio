import { Config, Data, Effect, Option } from 'effect';
import { FileSystem, HttpClient, Path } from '@effect/platform';
import { NodeOs } from 'src/services/node-os';
import { TerminalUI } from 'src/services/terminal-ui';
import { GITHUB_CONFIG } from 'src/effects/github-config';
import { APP_VERSION, type CliReleaseChannel } from 'src/constants';
import { resolveRunningCliReleaseTag } from 'src/services/run-companion-modules';
import {
  fetchLatestCliRelease,
  fetchCliReleaseByTag,
  type GitHubRelease,
  type GitHubRepoConfig,
} from 'src/effects/resolve-cli-release';
import { extractZipSafely } from 'src/utils/extract-zip-safely';

const SKILL_NAME = 'composio-cli';
const SKILL_ASSET_NAME = 'composio-skill.zip';
export const SKILL_RELEASE_TAG_FILENAME = '.composio-release-tag';
export type SkillReleaseChannel = CliReleaseChannel;
export type SkillInstallTarget = 'claude' | 'codex' | 'openclaw';

const SKILL_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

const SKILL_TARGET_LABELS: Record<SkillInstallTarget, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  openclaw: 'OpenClaw',
};

const SKILL_TARGET_DIRECTORIES: Record<SkillInstallTarget, ReadonlyArray<string>> = {
  claude: ['.claude', 'skills'],
  codex: ['.codex', 'skills'],
  openclaw: ['.openclaw', 'skills'],
};

type GitHubConfig = GitHubRepoConfig & {
  TAG: Option.Option<string>;
  ACCESS_TOKEN: Option.Option<string>;
};

export class SkillInstallError extends Data.TaggedError('effects/SkillInstallError')<{
  readonly cause?: unknown;
  readonly message: string;
  readonly phase: 'release' | 'download' | 'extract';
  readonly status?: number;
}> {}

const hasSkillAsset = (release: GitHubRelease) =>
  release.assets.some(asset => asset.name === SKILL_ASSET_NAME);

export const resolveInstalledSkillName = (skillName?: string): string => {
  const normalized = skillName?.trim();
  if (!normalized) {
    return SKILL_NAME;
  }
  if (normalized === '.' || normalized === '..' || !SKILL_NAME_PATTERN.test(normalized)) {
    throw new Error(
      'Invalid skill name. Use letters, numbers, dots, underscores, or hyphens only.'
    );
  }
  return normalized;
};

export const resolveTargetSkillPath = ({
  home,
  path,
  skillName,
  target,
}: {
  home: string;
  path: Path.Path;
  skillName: string;
  target: SkillInstallTarget;
}): string => path.join(home, ...SKILL_TARGET_DIRECTORIES[target], skillName);

const resolveTargetLabel = (target: SkillInstallTarget): string => SKILL_TARGET_LABELS[target];

export const inferSkillReleaseChannel = (tagOrVersion: string): SkillReleaseChannel =>
  tagOrVersion.includes('-beta.') ? 'beta' : 'stable';

export const resolveSkillReleaseTag = ({
  channel,
  githubConfig,
  httpClient,
  installedReleaseTag,
  releaseTag,
}: {
  channel?: SkillReleaseChannel;
  githubConfig: GitHubConfig;
  httpClient: HttpClient.HttpClient;
  installedReleaseTag?: string;
  releaseTag?: string;
}) =>
  Effect.gen(function* () {
    if (releaseTag) {
      return releaseTag;
    }

    const configTag = Option.getOrUndefined(githubConfig.TAG);
    if (configTag) {
      return configTag;
    }

    if (installedReleaseTag) {
      return installedReleaseTag;
    }

    const latest = yield* fetchLatestCliRelease({
      assetDescription: SKILL_ASSET_NAME,
      channel: channel ?? inferSkillReleaseChannel(APP_VERSION),
      githubConfig,
      hasRequiredAsset: hasSkillAsset,
      httpClient,
    });

    return latest.tag_name;
  });

/**
 * Install the composio-cli skill into the user's global agent skills directory.
 *
 * - Downloads composio-skill.zip from the matching CLI GitHub release
 * - Extracts to ~/.agents/skills/<skill-name>/
 * - Creates a symlink in the selected agent's skills directory
 *
 * Non-fatal: wrapped version catches all errors.
 */
export const installSkill = (options?: {
  readonly releaseTag?: string;
  readonly channel?: SkillReleaseChannel;
  readonly target?: SkillInstallTarget;
  readonly skillName?: string;
  readonly silent?: boolean;
}) =>
  Effect.gen(function* () {
    const os = yield* NodeOs;
    const ui = yield* TerminalUI;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const httpClient = yield* HttpClient.HttpClient;
    const githubConfig = yield* Config.all(GITHUB_CONFIG);
    const home = os.homedir;
    const target = options?.target ?? 'claude';
    const skillName = resolveInstalledSkillName(options?.skillName);

    const agentSkillDir = path.join(home, '.agents', 'skills', skillName);
    const targetSkillPath = resolveTargetSkillPath({ home, path, skillName, target });

    const tag = yield* resolveSkillReleaseTag({
      channel: options?.channel,
      githubConfig,
      httpClient,
      installedReleaseTag: yield* resolveRunningCliReleaseTag(process.execPath, APP_VERSION),
      releaseTag: options?.releaseTag,
    });

    const release = yield* fetchCliReleaseByTag({ githubConfig, httpClient, tag }).pipe(
      Effect.mapError(
        error =>
          new SkillInstallError({
            cause: error,
            message: error.message,
            phase: 'release',
            status: error.status,
          })
      )
    );

    const skillAsset = release.assets.find(a => a.name === SKILL_ASSET_NAME);
    if (!skillAsset) {
      return yield* Effect.fail(
        new SkillInstallError({
          message: `Skill asset ${SKILL_ASSET_NAME} not found in release ${tag}`,
          phase: 'release',
        })
      );
    }

    // Download the skill zip
    const downloadResponse = yield* httpClient.get(skillAsset.browser_download_url).pipe(
      Effect.mapError(
        cause =>
          new SkillInstallError({
            cause,
            message: 'Failed to download skill',
            phase: 'download',
          })
      )
    );

    if (downloadResponse.status < 200 || downloadResponse.status >= 300) {
      return yield* Effect.fail(
        new SkillInstallError({
          message: `Failed to download skill (HTTP ${downloadResponse.status})`,
          phase: 'download',
          status: downloadResponse.status,
        })
      );
    }

    const zipData = yield* downloadResponse.arrayBuffer.pipe(
      Effect.mapError(
        cause =>
          new SkillInstallError({
            cause,
            message: 'Failed to read skill zip data',
            phase: 'download',
          })
      )
    );

    // Extract to a temp dir, then move into place
    const tmpDir = path.join(os.homedir, '.agents', '.tmp-skill-install');

    yield* Effect.gen(function* () {
      yield* fs.makeDirectory(tmpDir, { recursive: true });
      const zipPath = path.join(tmpDir, SKILL_ASSET_NAME);
      yield* fs.writeFile(zipPath, new Uint8Array(zipData));

      yield* Effect.tryPromise({
        try: () => extractZipSafely(zipPath, tmpDir),
        catch: cause =>
          new SkillInstallError({
            cause,
            message: 'Failed to extract skill zip',
            phase: 'extract',
          }),
      });

      // The zip contains composio-cli/ directory
      const extractedDir = path.join(tmpDir, SKILL_NAME);
      if (!(yield* fs.exists(extractedDir))) {
        return yield* Effect.fail(
          new SkillInstallError({
            message: 'Extracted skill directory not found',
            phase: 'extract',
          })
        );
      }

      yield* Effect.gen(function* () {
        // Replace the canonical skill and agent target without interruption leaving either absent.
        yield* fs.remove(agentSkillDir, { recursive: true, force: true });
        yield* fs.makeDirectory(path.dirname(agentSkillDir), { recursive: true });
        yield* fs.copy(extractedDir, agentSkillDir, { overwrite: true });
        yield* fs.writeFileString(path.join(agentSkillDir, SKILL_RELEASE_TAG_FILENAME), `${tag}\n`);

        yield* fs.makeDirectory(path.dirname(targetSkillPath), { recursive: true });
        yield* fs.remove(targetSkillPath, { recursive: true, force: true });
        const relativeTarget = path.relative(path.dirname(targetSkillPath), agentSkillDir);
        yield* fs.symlink(relativeTarget, targetSkillPath);
      }).pipe(Effect.uninterruptible);
    }).pipe(
      Effect.ensuring(fs.remove(tmpDir, { recursive: true, force: true }).pipe(Effect.orDie))
    );

    if (!options?.silent) {
      yield* ui.log.success(`Installed ${skillName} skill for ${resolveTargetLabel(target)}`);
    }
  });

/**
 * Wrapped version that catches all errors and logs a warning instead of failing.
 */
export const installSkillSafe = (options?: {
  readonly releaseTag?: string;
  readonly channel?: SkillReleaseChannel;
  readonly target?: SkillInstallTarget;
  readonly skillName?: string;
  readonly silent?: boolean;
}) =>
  installSkill(options).pipe(
    Effect.sandbox,
    Effect.catchAll(cause =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* Effect.logDebug('Skill install failed:', cause);
        const targetLabel = resolveTargetLabel(options?.target ?? 'claude');
        yield* ui.log.warn(`Could not install ${targetLabel} skill (non-fatal)`);
      })
    )
  );
