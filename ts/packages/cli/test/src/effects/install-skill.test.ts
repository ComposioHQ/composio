import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { describe, expect, it, vi } from '@effect/vitest';
import { Config, ConfigProvider, Effect, Exit, Layer } from 'effect';
import { FetchHttpClient, FileSystem, HttpClient, Path } from '@effect/platform';
import type * as PlatformError from '@effect/platform/Error';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import * as tempy from 'tempy';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';
import {
  inferSkillReleaseChannel,
  installSkill,
  resolveInstalledSkillName,
  resolveSkillReleaseTag,
  resolveTargetSkillPath,
  SKILL_RELEASE_TAG_FILENAME,
  SkillInstallError,
  type SkillReleaseChannel,
} from 'src/effects/install-skill';
import { GITHUB_CONFIG } from 'src/effects/github-config';
import { CliReleaseResolutionError } from 'src/effects/resolve-cli-release';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';

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

/**
 * Spin up a local HTTP server on an ephemeral port as a scoped resource and
 * return its base URL. Scope closure tears the server down.
 */
const startTestHttpServer = (handler: (req: IncomingMessage, res: ServerResponse) => void) =>
  Effect.map(
    Effect.acquireRelease(
      Effect.promise(
        () =>
          new Promise<Server>((resolve, reject) => {
            const server = createServer(handler);
            server.once('error', reject);
            server.listen({ port: 0, host: '127.0.0.1' }, () => {
              server.off('error', reject);
              resolve(server);
            });
          })
      ),
      server =>
        Effect.promise(
          () =>
            new Promise<void>((resolve, reject) => {
              server.close(error => (error ? reject(error) : resolve()));
            })
        )
    ),
    server => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Failed to bind test server to an ephemeral port');
      }
      return `http://127.0.0.1:${address.port}`;
    }
  );

const startSkillReleaseServer = (skillZip: Uint8Array) =>
  startTestHttpServer((req, res) => {
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
  });

/** Scoped stub of Bun.which that misses, so release resolution takes the HTTP path. */
const stubBunWhichMiss = Effect.acquireRelease(
  Effect.sync(() => vi.stubGlobal('Bun', { which: vi.fn(() => null) })),
  () =>
    Effect.sync(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    })
);

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

  it.effect('resolves the agent-specific skill path', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
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
    }).pipe(Effect.provide(Path.layer))
  );

  it.effect('prefers an explicit running release tag over channel discovery', () =>
    Effect.gen(function* () {
      const releaseTag = '@composio/cli@0.3.0-beta.123';
      const tag = yield* makeResolveEffect([], {
        channel: 'stable',
        releaseTag,
      });

      expect(tag).toBe(releaseTag);
    })
  );

  it.scoped('fails with a typed decode error for malformed GitHub release lists', () =>
    Effect.gen(function* () {
      const apiBaseUrl = yield* startTestHttpServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ tag_name: '@composio/cli@0.3.0' }));
      });

      const error = yield* Effect.flip(
        makeResolveEffect(
          [
            ['GITHUB_API_BASE_URL', apiBaseUrl],
            ['GITHUB_OWNER', 'test-owner'],
            ['GITHUB_REPO', 'test-repo'],
          ],
          { channel: 'stable' }
        )
      );

      expect(error).toBeInstanceOf(CliReleaseResolutionError);
      if (error instanceof CliReleaseResolutionError) {
        expect(error.reason).toBe('decode');
        expect(error.cause).toBeDefined();
      }
    })
  );

  it.scoped('fails with a typed decode error for malformed skill release metadata', () =>
    Effect.gen(function* () {
      const apiBaseUrl = yield* startTestHttpServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ assets: [{ name: 'composio-skill.zip' }] }));
      });

      const home = tempy.temporaryDirectory();
      const error = yield* Effect.flip(makeInstallEffect(home, apiBaseUrl));

      expect(error).toBeInstanceOf(SkillInstallError);
      if (error instanceof SkillInstallError) {
        expect(error.phase).toBe('release');
        expect(error.cause).toBeDefined();
      }
    })
  );

  it.scoped.each(TARGET_SCENARIOS)('installs over %s target', ([, prepareTarget]) =>
    Effect.gen(function* () {
      const apiBaseUrl = yield* startSkillReleaseServer(TEST_SKILL_ZIP);
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = tempy.temporaryDirectory();
      const target = path.join(home, '.claude', 'skills', 'composio-cli');
      const canonicalSkill = path.join(home, '.agents', 'skills', 'composio-cli');

      yield* prepareTarget(fs, path, home, target);

      yield* makeInstallEffect(home, apiBaseUrl);

      expect(yield* fs.readFileString(path.join(target, 'SKILL.md'))).toBe('# composio-cli\n');
      expect(yield* fs.readFileString(path.join(canonicalSkill, SKILL_RELEASE_TAG_FILENAME))).toBe(
        `${TEST_RELEASE_TAG}\n`
      );
      expect(yield* fs.readLink(target)).toBe(path.relative(path.dirname(target), canonicalSkill));
      expect(yield* fs.exists(path.join(home, '.agents', '.tmp-skill-install'))).toBe(false);
    }).pipe(Effect.provide(TestPlatform))
  );

  it.scoped('removes the temporary install directory after extraction fails', () =>
    Effect.gen(function* () {
      const apiBaseUrl = yield* startSkillReleaseServer(new TextEncoder().encode('not a zip'));
      const home = tempy.temporaryDirectory();
      const exit = yield* Effect.exit(makeInstallEffect(home, apiBaseUrl));

      expect(Exit.isFailure(exit)).toBe(true);

      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      expect(yield* fs.exists(path.join(home, '.agents', '.tmp-skill-install'))).toBe(false);
    }).pipe(Effect.provide(TestPlatform))
  );

  it.scoped('resolves the latest stable release when the stable channel is requested', () =>
    Effect.gen(function* () {
      yield* stubBunWhichMiss;
      const apiBaseUrl = yield* startTestHttpServer((_req, res) => {
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
      });

      const tag = yield* makeResolveEffect(
        [
          ['GITHUB_API_BASE_URL', apiBaseUrl],
          ['GITHUB_OWNER', 'test-owner'],
          ['GITHUB_REPO', 'test-repo'],
        ],
        { channel: 'stable' }
      );

      expect(tag).toBe('@composio/cli@0.2.19');
    })
  );

  it.scoped('resolves the latest beta release when the beta channel is requested', () =>
    Effect.gen(function* () {
      yield* stubBunWhichMiss;
      const apiBaseUrl = yield* startTestHttpServer((_req, res) => {
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
      });

      const tag = yield* makeResolveEffect(
        [
          ['GITHUB_API_BASE_URL', apiBaseUrl],
          ['GITHUB_OWNER', 'test-owner'],
          ['GITHUB_REPO', 'test-repo'],
        ],
        { channel: 'beta' }
      );

      expect(tag).toBe('@composio/cli@0.2.20-beta.3');
    })
  );
});
