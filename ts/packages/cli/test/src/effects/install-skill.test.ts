import { describe, expect, it, vi } from '@effect/vitest';
import { Config, ConfigProvider, Effect, Exit, Layer } from 'effect';
import { FetchHttpClient, FileSystem, HttpClient, Path } from '@effect/platform';
import type * as PlatformError from '@effect/platform/Error';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import * as tempy from 'tempy';
import { withHttpServer } from 'test/__utils__/http-server';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';
import {
  inferSkillReleaseChannel,
  installSkill,
  resolveInstalledSkillName,
  resolveSkillReleaseTag,
  resolveTargetSkillPath,
  SKILL_RELEASE_TAG_FILENAME,
  type SkillReleaseChannel,
} from 'src/effects/install-skill';
import { GITHUB_CONFIG } from 'src/effects/github-config';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';

const path = Effect.runSync(Effect.provide(Path.Path, Path.layer));
const TEST_RELEASE_TAG = '@composio/cli@0.3.0-test';
const TEST_SKILL_ZIP = Uint8Array.from(
  atob(
    'UEsDBAoAAAAAAEGX7lwAAAAAAAAAAAAAAAANABwAY29tcG9zaW8tY2xpL1VUCQADeU5WanlOVmp1eAsAAQT1AQAABBQAAABQSwMECgAAAAAAQZfuXMXglUQPAAAADwAAABUAHABjb21wb3Npby1jbGkvU0tJTEwubWRVVAkAA3lOVmp5TlZqdXgLAAEE9QEAAAQUAAAAIyBjb21wb3Npby1jbGkKUEsBAh4DCgAAAAAAQZfuXAAAAAAAAAAAAAAAAA0AGAAAAAAAAAAQAO1BAAAAAGNvbXBvc2lvLWNsaS9VVAUAA3lOVmp1eAsAAQT1AQAABBQAAABQSwECHgMKAAAAAABBl+5cxeCVRA8AAAAPAAAAFQAYAAAAAAABAAAApIFHAAAAY29tcG9zaW8tY2xpL1NLSUxMLm1kVVQFAAN5TlZqdXgLAAEE9QEAAAQUAAAAUEsFBgAAAAACAAIArgAAAKUAAAAAAA=='
  ),
  character => character.charCodeAt(0)
);

const TestPlatform = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

const makeInstallEffect = (home: string, apiBaseUrl: string) =>
  installSkill({ target: 'claude', releaseTag: TEST_RELEASE_TAG }).pipe(
    Effect.provide(
      Layer.mergeAll(
        TestPlatform,
        FetchHttpClient.layer,
        TerminalUITest,
        Layer.succeed(NodeOs, defaultNodeOs({ homedir: home }))
      )
    ),
    Effect.withConfigProvider(
      ConfigProvider.fromMap(
        new Map([
          ['GITHUB_API_BASE_URL', apiBaseUrl],
          ['GITHUB_OWNER', 'test-owner'],
          ['GITHUB_REPO', 'test-repo'],
        ])
      )
    ),
    Effect.scoped
  );

const withSkillRelease = (skillZip: Uint8Array, run: (apiBaseUrl: string) => Promise<void>) =>
  withHttpServer((req, res) => {
    if (req.url === '/skill.zip') {
      res.writeHead(200, { 'content-type': 'application/zip' });
      res.end(skillZip);
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        assets: [
          {
            name: 'composio-skill.zip',
            browser_download_url: `http://${req.headers.host}/skill.zip`,
          },
        ],
      })
    );
  }, run);

type TargetSetup = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  home: string,
  target: string
) => Effect.Effect<void, PlatformError.PlatformError>;

const TARGET_SCENARIOS = [
  ['a missing', (() => Effect.void) satisfies TargetSetup],
  [
    'an existing directory',
    ((fs, _path, _home, target) =>
      fs.makeDirectory(target, { recursive: true })) satisfies TargetSetup,
  ],
  [
    'an existing symlink',
    ((fs, path, home, target) =>
      Effect.gen(function* () {
        const existingTarget = path.join(home, 'existing-skill');
        yield* fs.makeDirectory(existingTarget, { recursive: true });
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.symlink(path.relative(path.dirname(target), existingTarget), target);
      })) satisfies TargetSetup,
  ],
  [
    'a broken symlink',
    ((fs, path, home, target) =>
      Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.symlink(
          path.relative(path.dirname(target), path.join(home, 'missing-skill')),
          target
        );
      })) satisfies TargetSetup,
  ],
] as const;

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
        path,
        skillName: 'composio-cli',
        target: 'claude',
      })
    ).toBe('/tmp/test-home/.claude/skills/composio-cli');
    expect(
      resolveTargetSkillPath({
        home: '/tmp/test-home',
        path,
        skillName: 'composio-cli',
        target: 'codex',
      })
    ).toBe('/tmp/test-home/.codex/skills/composio-cli');
    expect(
      resolveTargetSkillPath({
        home: '/tmp/test-home',
        path,
        skillName: 'composio-cli',
        target: 'openclaw',
      })
    ).toBe('/tmp/test-home/.openclaw/skills/composio-cli');
  });

  it('prefers an explicit running release tag over channel discovery', async () => {
    const releaseTag = '@composio/cli@0.3.0-beta.123';
    const tag = await makeResolveEffect([], {
      channel: 'stable',
      releaseTag,
    }).pipe(Effect.runPromise);

    expect(tag).toBe(releaseTag);
  });

  it.each(TARGET_SCENARIOS)('installs over %s target', async (_description, prepareTarget) => {
    await withSkillRelease(TEST_SKILL_ZIP, async apiBaseUrl => {
      const home = tempy.temporaryDirectory();
      const target = path.join(home, '.claude', 'skills', 'composio-cli');
      const canonicalSkill = path.join(home, '.agents', 'skills', 'composio-cli');

      await Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const platformPath = yield* Path.Path;
        yield* prepareTarget(fs, platformPath, home, target);
      }).pipe(Effect.provide(TestPlatform), Effect.runPromise);

      await makeInstallEffect(home, apiBaseUrl).pipe(Effect.runPromise);

      await Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const platformPath = yield* Path.Path;
        expect(yield* fs.readFileString(platformPath.join(target, 'SKILL.md'))).toBe(
          '# composio-cli\n'
        );
        expect(
          yield* fs.readFileString(platformPath.join(canonicalSkill, SKILL_RELEASE_TAG_FILENAME))
        ).toBe(`${TEST_RELEASE_TAG}\n`);
        expect(yield* fs.readLink(target)).toBe(
          platformPath.relative(platformPath.dirname(target), canonicalSkill)
        );
        expect(yield* fs.exists(platformPath.join(home, '.agents', '.tmp-skill-install'))).toBe(
          false
        );
      }).pipe(Effect.provide(TestPlatform), Effect.runPromise);
    });
  });

  it('removes the temporary install directory after extraction fails', async () => {
    await withSkillRelease(new TextEncoder().encode('not a zip'), async apiBaseUrl => {
      const home = tempy.temporaryDirectory();
      const exit = await makeInstallEffect(home, apiBaseUrl).pipe(Effect.exit, Effect.runPromise);

      expect(Exit.isFailure(exit)).toBe(true);
      expect(
        await FileSystem.FileSystem.pipe(
          Effect.flatMap(fs => fs.exists(path.join(home, '.agents', '.tmp-skill-install'))),
          Effect.provide(TestPlatform),
          Effect.runPromise
        )
      ).toBe(false);
    });
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
