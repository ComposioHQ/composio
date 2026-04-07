import * as fs from 'node:fs';
import * as path from 'node:path';
import { Effect, Config, Option } from 'effect';
import { HttpClient } from '@effect/platform';
import { NodeOs } from 'src/services/node-os';
import { TerminalUI } from 'src/services/terminal-ui';
import { GITHUB_CONFIG } from 'src/effects/github-config';
import { APP_VERSION } from 'src/constants';
import {
  fetchLatestCliRelease,
  type GitHubRelease,
  type GitHubRepoConfig,
} from 'src/effects/resolve-cli-release';
import decompress from 'decompress';

const SKILL_NAME = 'composio-cli';
const SKILL_ASSET_NAME = 'composio-skill.zip';
export type SkillReleaseChannel = 'beta' | 'stable';

type GitHubConfig = GitHubRepoConfig & {
  TAG: Option.Option<string>;
  ACCESS_TOKEN: Option.Option<string>;
};

const hasSkillAsset = (release: GitHubRelease) =>
  release.assets.some(asset => asset.name === SKILL_ASSET_NAME);

export const inferSkillReleaseChannel = (tagOrVersion: string): SkillReleaseChannel =>
  tagOrVersion.includes('-beta.') ? 'beta' : 'stable';

export const resolveSkillReleaseTag = ({
  channel,
  githubConfig,
  httpClient,
  releaseTag,
}: {
  channel?: SkillReleaseChannel;
  githubConfig: GitHubConfig;
  httpClient: HttpClient.HttpClient;
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

    if (!channel) {
      return `@composio/cli@${APP_VERSION}`;
    }

    const latest = yield* fetchLatestCliRelease({
      assetDescription: SKILL_ASSET_NAME,
      channel,
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
 * - Extracts to ~/.agents/skills/composio-cli/
 * - Creates a symlink at ~/.claude/skills/composio-cli → ../../.agents/skills/composio-cli
 *
 * Non-fatal: wrapped version catches all errors.
 */
export const installSkill = (options?: {
  readonly releaseTag?: string;
  readonly channel?: SkillReleaseChannel;
}) =>
  Effect.gen(function* () {
    const os = yield* NodeOs;
    const ui = yield* TerminalUI;
    const httpClient = yield* HttpClient.HttpClient;
    const githubConfig = yield* Config.all(GITHUB_CONFIG);
    const home = os.homedir;

    const agentSkillDir = path.join(home, '.agents', 'skills', SKILL_NAME);
    const claudeSkillLink = path.join(home, '.claude', 'skills', SKILL_NAME);

    const tag = yield* resolveSkillReleaseTag({
      channel: options?.channel,
      githubConfig,
      httpClient,
      releaseTag: options?.releaseTag,
    });

    // Find the skill asset URL from the release
    const releaseUrl = `${githubConfig.API_BASE_URL}/repos/${githubConfig.OWNER}/${githubConfig.REPO}/releases/tags/${encodeURIComponent(tag)}`;
    const releaseResponse = yield* httpClient
      .get(releaseUrl)
      .pipe(
        Effect.catchAll(error => Effect.fail(new Error(`Failed to fetch release ${tag}: ${error}`)))
      );

    if (releaseResponse.status < 200 || releaseResponse.status >= 300) {
      return yield* Effect.fail(
        new Error(`Release ${tag} not found (HTTP ${releaseResponse.status})`)
      );
    }

    const release = (yield* releaseResponse.json.pipe(
      Effect.catchAll(() => Effect.fail(new Error('Failed to parse release JSON')))
    )) as { assets: Array<{ name: string; browser_download_url: string }> };

    const skillAsset = release.assets.find(a => a.name === SKILL_ASSET_NAME);
    if (!skillAsset) {
      return yield* Effect.fail(
        new Error(`Skill asset ${SKILL_ASSET_NAME} not found in release ${tag}`)
      );
    }

    // Download the skill zip
    const downloadResponse = yield* httpClient
      .get(skillAsset.browser_download_url)
      .pipe(Effect.catchAll(error => Effect.fail(new Error(`Failed to download skill: ${error}`))));

    if (downloadResponse.status < 200 || downloadResponse.status >= 300) {
      return yield* Effect.fail(
        new Error(`Failed to download skill (HTTP ${downloadResponse.status})`)
      );
    }

    const zipData = yield* downloadResponse.arrayBuffer.pipe(
      Effect.catchAll(() => Effect.fail(new Error('Failed to read skill zip data')))
    );

    // Extract to a temp dir, then move into place
    const tmpDir = path.join(os.homedir, '.agents', '.tmp-skill-install');
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const zipPath = path.join(tmpDir, SKILL_ASSET_NAME);
      fs.writeFileSync(zipPath, new Uint8Array(zipData));

      yield* Effect.tryPromise({
        try: () => decompress(zipPath, tmpDir),
        catch: error => new Error(`Failed to extract skill zip: ${error}`),
      });

      // The zip contains composio-cli/ directory
      const extractedDir = path.join(tmpDir, SKILL_NAME);
      if (!fs.existsSync(extractedDir)) {
        return yield* Effect.fail(new Error('Extracted skill directory not found'));
      }

      // Remove old skill dir and move new one into place
      fs.rmSync(agentSkillDir, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(agentSkillDir), { recursive: true });
      fs.cpSync(extractedDir, agentSkillDir, { recursive: true });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // Create symlink for Claude Code — always replace any existing entry
    fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true });
    try {
      const stat = fs.lstatSync(claudeSkillLink);
      // Entry exists (symlink, broken symlink, or directory) — remove it
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(claudeSkillLink);
      } else if (stat.isDirectory()) {
        fs.rmSync(claudeSkillLink, { recursive: true, force: true });
      } else {
        fs.unlinkSync(claudeSkillLink);
      }
    } catch {
      // lstatSync throws if nothing exists at the path — that's fine
    }
    const relativeTarget = path.relative(path.dirname(claudeSkillLink), agentSkillDir);
    fs.symlinkSync(relativeTarget, claudeSkillLink);

    yield* ui.log.success('Installed composio-cli skill for Claude Code');
  });

/**
 * Wrapped version that catches all errors and logs a warning instead of failing.
 */
export const installSkillSafe = (options?: {
  readonly releaseTag?: string;
  readonly channel?: SkillReleaseChannel;
}) =>
  installSkill(options).pipe(
    Effect.sandbox,
    Effect.catchAll(cause =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* Effect.logDebug('Skill install failed:', cause);
        yield* ui.log.warn('Could not install Claude Code skill (non-fatal)');
      })
    )
  );
