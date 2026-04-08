import { describe, expect, it, vi } from '@effect/vitest';
import { Config, ConfigProvider, Effect } from 'effect';
import { FetchHttpClient, HttpClient } from '@effect/platform';
import { withHttpServer } from 'test/__utils__/http-server';
import {
  inferSkillReleaseChannel,
  resolveInstalledSkillName,
  resolveSkillReleaseTag,
  resolveTargetSkillPath,
  type SkillReleaseChannel,
} from 'src/effects/install-skill';
import { GITHUB_CONFIG } from 'src/effects/github-config';

const makeResolveEffect = (
  configEntries: ReadonlyArray<[string, string]>,
  options: {
    channel?: SkillReleaseChannel;
    releaseTag?: string;
  } = {}
) =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const githubConfig = yield* Config.all(GITHUB_CONFIG);

    return yield* resolveSkillReleaseTag({
      channel: options.channel,
      githubConfig,
      httpClient,
      releaseTag: options.releaseTag,
    });
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.withConfigProvider(ConfigProvider.fromMap(new Map(configEntries))),
    Effect.scoped
  );

describe('install-skill', () => {
  it('infers the stable channel from stable versions', () => {
    expect(inferSkillReleaseChannel('0.2.19')).toBe('stable');
    expect(inferSkillReleaseChannel('@composio/cli@0.2.19')).toBe('stable');
  });

  it('infers the beta channel from beta versions', () => {
    expect(inferSkillReleaseChannel('0.2.20-beta.4')).toBe('beta');
    expect(inferSkillReleaseChannel('@composio/cli@0.2.20-beta.4')).toBe('beta');
  });

  it('defaults the installed skill name to composio-cli', () => {
    expect(resolveInstalledSkillName()).toBe('composio-cli');
    expect(resolveInstalledSkillName('   ')).toBe('composio-cli');
  });

  it('rejects unsafe installed skill names', () => {
    expect(() => resolveInstalledSkillName('../bad')).toThrow(/Invalid skill name/);
    expect(() => resolveInstalledSkillName('.')).toThrow(/Invalid skill name/);
    expect(() => resolveInstalledSkillName('..')).toThrow(/Invalid skill name/);
  });

  it('resolves the agent-specific skill path', () => {
    expect(
      resolveTargetSkillPath({
        home: '/tmp/test-home',
        skillName: 'composio-cli',
        target: 'claude',
      })
    ).toBe('/tmp/test-home/.claude/skills/composio-cli');
    expect(
      resolveTargetSkillPath({
        home: '/tmp/test-home',
        skillName: 'composio-cli',
        target: 'codex',
      })
    ).toBe('/tmp/test-home/.codex/skills/composio-cli');
    expect(
      resolveTargetSkillPath({
        home: '/tmp/test-home',
        skillName: 'composio-cli',
        target: 'openclaw',
      })
    ).toBe('/tmp/test-home/.openclaw/skills/composio-cli');
  });

  it('resolves the latest stable release when the stable channel is requested', async () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    try {
      await withHttpServer(
        (_req, res) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify([
              {
                tag_name: '@composio/cli@0.2.20-beta.2',
                draft: false,
                prerelease: true,
                assets: [
                  {
                    name: 'composio-skill.zip',
                    browser_download_url: 'http://127.0.0.1/beta-skill.zip',
                  },
                ],
              },
              {
                tag_name: '@composio/cli@0.2.19',
                draft: false,
                prerelease: false,
                assets: [
                  {
                    name: 'composio-skill.zip',
                    browser_download_url: 'http://127.0.0.1/stable-skill.zip',
                  },
                ],
              },
              {
                tag_name: '@composio/cli@0.2.20',
                draft: false,
                prerelease: false,
                assets: [
                  {
                    name: 'composio-linux-x64.zip',
                    browser_download_url: 'http://127.0.0.1/no-skill.zip',
                  },
                ],
              },
            ])
          );
        },
        async apiBaseUrl => {
          const tag = await makeResolveEffect(
            [
              ['GITHUB_API_BASE_URL', apiBaseUrl],
              ['GITHUB_OWNER', 'test-owner'],
              ['GITHUB_REPO', 'test-repo'],
            ],
            { channel: 'stable' }
          ).pipe(Effect.runPromise);

          expect(tag).toBe('@composio/cli@0.2.19');
        }
      );
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('resolves the latest beta release when the beta channel is requested', async () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    try {
      await withHttpServer(
        (_req, res) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify([
              {
                tag_name: '@composio/cli@0.2.20-beta.1',
                draft: false,
                prerelease: true,
                assets: [
                  {
                    name: 'composio-skill.zip',
                    browser_download_url: 'http://127.0.0.1/beta-1-skill.zip',
                  },
                ],
              },
              {
                tag_name: '@composio/cli@0.2.20-beta.3',
                draft: false,
                prerelease: true,
                assets: [
                  {
                    name: 'composio-skill.zip',
                    browser_download_url: 'http://127.0.0.1/beta-3-skill.zip',
                  },
                ],
              },
              {
                tag_name: '@composio/cli@0.2.20',
                draft: false,
                prerelease: false,
                assets: [
                  {
                    name: 'composio-skill.zip',
                    browser_download_url: 'http://127.0.0.1/stable-skill.zip',
                  },
                ],
              },
            ])
          );
        },
        async apiBaseUrl => {
          const tag = await makeResolveEffect(
            [
              ['GITHUB_API_BASE_URL', apiBaseUrl],
              ['GITHUB_OWNER', 'test-owner'],
              ['GITHUB_REPO', 'test-repo'],
            ],
            { channel: 'beta' }
          ).pipe(Effect.runPromise);

          expect(tag).toBe('@composio/cli@0.2.20-beta.3');
        }
      );
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
});
