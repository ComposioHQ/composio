import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BunContext } from '@effect/platform-bun';
import { afterEach, describe, expect, it, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { vi } from 'vitest';
import {
  hostRunCompanionStaticAssetRelativePaths,
  listMissingInstalledRunCompanionModules,
  repairMissingInstalledRunCompanionModules,
  resolveRunCompanionAssetPath,
  RUN_CODEX_ACP_BINARY_TARGETS,
  RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS,
  RUN_COMPANION_MODULE_FILENAMES,
  RUN_COMPANION_RELEASE_TAG_FILENAME,
  RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS,
  runCompanionStaticAssetRelativePathsFor,
} from 'src/services/run-companion-modules';
import { BaseConfigProviderLive, extendConfigProvider } from 'src/services/config';

const extractZipMock = vi.hoisted(() => vi.fn());
vi.mock('extract-zip', () => ({ default: extractZipMock }));

const TEST_RELEASE_TAG = '@composio/cli@0.3.0-test';
const TEST_BINARY_ASSET_NAMES = [
  'composio-darwin-aarch64.zip',
  'composio-darwin-x64.zip',
  'composio-linux-aarch64.zip',
  'composio-linux-x64.zip',
];
// A release archive ships every platform's codex-acp binary.
const TEST_COMPANION_RELATIVE_PATHS = [
  ...RUN_COMPANION_MODULE_FILENAMES,
  ...RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS,
].sort();

const stubRepairFetch = () => {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url.includes('/releases/tags/')
        ? new Response(
            JSON.stringify({
              tag_name: TEST_RELEASE_TAG,
              assets: TEST_BINARY_ASSET_NAMES.map(name => ({
                name,
                browser_download_url: `https://download.test/${name}`,
              })),
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        : new Response(new Uint8Array([1]), { status: 200 })
    )
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('GITHUB_TAG', TEST_RELEASE_TAG);
  return fetchMock;
};

const mockArchiveContents = (missingRelativePath?: string) => {
  extractZipMock.mockImplementation(
    async (archivePath: string, options: { readonly dir: string }) => {
      const packageDirectory = path.join(options.dir, path.parse(archivePath).name);
      for (const relativePath of TEST_COMPANION_RELATIVE_PATHS) {
        if (relativePath === missingRelativePath) continue;
        const filePath = path.join(packageDirectory, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `new:${relativePath}`);
      }
    }
  );
};

describe('run-companion-modules', () => {
  afterEach(() => {
    extractZipMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('runCompanionStaticAssetRelativePathsFor', () => {
    it('[Given] a supported host [Then] it requires only that host codex-acp binary', () => {
      for (const target of RUN_CODEX_ACP_BINARY_TARGETS) {
        expect(
          runCompanionStaticAssetRelativePathsFor({
            platform: target.platform,
            arch: target.arch,
          })
        ).toEqual([...RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS, target.relativePath]);
      }
    });

    it('[Given] an unsupported host [Then] it requires only the portable assets', () => {
      expect(runCompanionStaticAssetRelativePathsFor({ platform: 'win32', arch: 'x64' })).toEqual(
        RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS
      );
    });
  });

  layer(BunContext.layer)(it => {
    it.effect(
      "[Given] an install lacking another platform's codex-acp binary [Then] nothing needs repair",
      () =>
        Effect.gen(function* () {
          const hostStaticAssets = yield* hostRunCompanionStaticAssetRelativePaths;
          const foreignRelativePaths = RUN_CODEX_ACP_BINARY_TARGETS.map(
            target => target.relativePath
          ).filter(relativePath => !hostStaticAssets.includes(relativePath));

          expect(foreignRelativePaths.length).toBe(RUN_CODEX_ACP_BINARY_TARGETS.length - 1);

          const installDirectory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'composio-run-host-scope-')
          );
          const execPath = path.join(installDirectory, 'composio');
          for (const relativePath of [...RUN_COMPANION_MODULE_FILENAMES, ...hostStaticAssets]) {
            const filePath = path.join(installDirectory, relativePath);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, `installed:${relativePath}`);
          }
          const fetchMock = stubRepairFetch();

          return yield* Effect.gen(function* () {
            expect(yield* listMissingInstalledRunCompanionModules(execPath)).toEqual([]);
            expect(
              yield* repairMissingInstalledRunCompanionModules({
                callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
                execPath,
                appVersion: '0.0.0-test',
              })
            ).toEqual({ repaired: false });
            expect(fetchMock).not.toHaveBeenCalled();
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
            )
          );
        })
    );

    it.effect(
      '[Given] an install without ACP adapters [Then] a plain run neither reports nor repairs anything',
      () =>
        Effect.gen(function* () {
          const installDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-no-acp-'));
          const execPath = path.join(installDirectory, 'composio');
          for (const fileName of RUN_COMPANION_MODULE_FILENAMES) {
            fs.writeFileSync(path.join(installDirectory, fileName), '', 'utf8');
          }
          const fetchMock = stubRepairFetch();

          return yield* Effect.gen(function* () {
            expect(yield* listMissingInstalledRunCompanionModules(execPath)).toEqual([]);
            expect(
              yield* repairMissingInstalledRunCompanionModules({
                callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
                execPath,
                appVersion: '0.0.0-test',
              })
            ).toEqual({ repaired: false });
            // The self-repair download is what 404s on a dev build; the ACP tier
            // must never reach it.
            expect(fetchMock).not.toHaveBeenCalled();
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
            )
          );
        })
    );

    it.effect(
      '[Given] a missing companion wrapper [Then] repair still restores the ACP tier too',
      () => {
        const installDirectory = fs.mkdtempSync(
          path.join(os.tmpdir(), 'composio-run-tier-repair-')
        );
        const execPath = path.join(installDirectory, 'composio');
        stubRepairFetch();
        mockArchiveContents();

        return Effect.gen(function* () {
          const result = yield* repairMissingInstalledRunCompanionModules({
            callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
            execPath,
            appVersion: '0.0.0-test',
          });

          expect(result).toEqual({ repaired: true, releaseTag: TEST_RELEASE_TAG });
          for (const relativePath of yield* hostRunCompanionStaticAssetRelativePaths) {
            expect(fs.existsSync(path.join(installDirectory, relativePath))).toBe(true);
          }
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
          )
        );
      }
    );

    it.effect('[Given] a complete archive [Then] repair atomically replaces companions', () => {
      const installDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-repair-test-'));
      const execPath = path.join(installDirectory, 'composio');
      const companionRelativePath = TEST_COMPANION_RELATIVE_PATHS[0]!;
      const companionPath = path.join(installDirectory, companionRelativePath);
      const releaseTagPath = path.join(installDirectory, RUN_COMPANION_RELEASE_TAG_FILENAME);
      fs.mkdirSync(path.dirname(companionPath), { recursive: true });
      fs.writeFileSync(companionPath, 'old-companion');
      fs.writeFileSync(releaseTagPath, '@composio/cli@0.2.31\n');
      const originalCompanion = fs.statSync(companionPath);
      const fetchMock = stubRepairFetch();
      mockArchiveContents();

      return Effect.gen(function* () {
        const result = yield* repairMissingInstalledRunCompanionModules({
          callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
          execPath,
          appVersion: '0.0.0-test',
        });

        expect(result).toEqual({ repaired: true, releaseTag: TEST_RELEASE_TAG });
        expect(fs.readFileSync(companionPath, 'utf8')).toBe(`new:${companionRelativePath}`);
        const replacedCompanion = fs.statSync(companionPath);
        expect(replacedCompanion.dev).toBe(originalCompanion.dev);
        expect(replacedCompanion.ino).not.toBe(originalCompanion.ino);
        expect(fs.readFileSync(releaseTagPath, 'utf8')).toBe(`${TEST_RELEASE_TAG}\n`);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
        )
      );
    });

    it.effect('[Given] an incomplete archive [Then] repair preserves release metadata', () => {
      const installDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-repair-test-'));
      const execPath = path.join(installDirectory, 'composio');
      const releaseTagPath = path.join(installDirectory, RUN_COMPANION_RELEASE_TAG_FILENAME);
      const previousReleaseTag = '@composio/cli@0.2.31\n';
      const missingRelativePath = TEST_COMPANION_RELATIVE_PATHS.at(-1)!;
      fs.writeFileSync(releaseTagPath, previousReleaseTag);
      stubRepairFetch();
      mockArchiveContents(missingRelativePath);

      return Effect.gen(function* () {
        const error = yield* repairMissingInstalledRunCompanionModules({
          callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
          execPath,
          appVersion: '0.0.0-test',
        }).pipe(Effect.flip);

        expect(error.message).toContain(
          `missing ${missingRelativePath}; cannot restore the files required by 'composio run'`
        );
        expect(fs.readFileSync(releaseTagPath, 'utf8')).toBe(previousReleaseTag);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
        )
      );
    });

    it.effect(
      '[Given] malformed release metadata [Then] repair rejects it before using release assets',
      () => {
        const installDirectory = fs.mkdtempSync(
          path.join(os.tmpdir(), 'composio-run-repair-test-')
        );
        const fetchMock = vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ tag_name: 123, assets: 'invalid' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );
        vi.stubGlobal('fetch', fetchMock);

        return Effect.gen(function* () {
          const error = yield* repairMissingInstalledRunCompanionModules({
            callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
            execPath: path.join(installDirectory, 'composio'),
            appVersion: '0.0.0-test',
          }).pipe(Effect.flip);

          expect(error.message).toContain("Unable to restore the files required by 'composio run'");
          expect(fetchMock).toHaveBeenCalledOnce();
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
          )
        );
      }
    );

    it.effect(
      '[Given] unprefixed GITHUB_* env under the CLI-wide prefixed provider [Then] repair honors the unprefixed contract',
      () => {
        const installDirectory = fs.mkdtempSync(
          path.join(os.tmpdir(), 'composio-run-repair-test-')
        );
        const fetchMock = vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ tag_name: 123, assets: 'invalid' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );
        vi.stubGlobal('fetch', fetchMock);
        vi.stubEnv('GITHUB_TAG', '@composio/cli@9.9.9-test');
        vi.stubEnv('GITHUB_API_BASE_URL', 'https://github-proxy.test');
        vi.stubEnv('GITHUB_OWNER', 'fork-owner');
        vi.stubEnv('GITHUB_REPO', 'fork-repo');

        return Effect.gen(function* () {
          yield* repairMissingInstalledRunCompanionModules({
            callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
            execPath: path.join(installDirectory, 'composio'),
            appVersion: '0.0.0-test',
          }).pipe(Effect.flip);

          expect(fetchMock).toHaveBeenCalledOnce();
          const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
          expect(requestUrl).toBe(
            'https://github-proxy.test/repos/fork-owner/fork-repo/releases/tags/%40composio%2Fcli%409.9.9-test'
          );
        }).pipe(
          // Simulate the cli-main runtime, whose provider rewrites config keys
          // to their COMPOSIO_-prefixed spelling.
          Effect.withConfigProvider(extendConfigProvider(BaseConfigProviderLive)),
          Effect.ensuring(
            Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
          )
        );
      }
    );

    it.effect(
      '[Given] only COMPOSIO_-prefixed GITHUB_* env [Then] repair falls back to the prefixed spelling',
      () => {
        const installDirectory = fs.mkdtempSync(
          path.join(os.tmpdir(), 'composio-run-repair-test-')
        );
        const fetchMock = vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ tag_name: 123, assets: 'invalid' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );
        vi.stubGlobal('fetch', fetchMock);
        vi.stubEnv('GITHUB_TAG', undefined);
        vi.stubEnv('GITHUB_API_BASE_URL', undefined);
        vi.stubEnv('GITHUB_OWNER', undefined);
        vi.stubEnv('GITHUB_REPO', undefined);
        vi.stubEnv('COMPOSIO_GITHUB_TAG', '@composio/cli@8.8.8-test');
        vi.stubEnv('COMPOSIO_GITHUB_API_BASE_URL', 'https://prefixed-proxy.test');

        return Effect.gen(function* () {
          yield* repairMissingInstalledRunCompanionModules({
            callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
            execPath: path.join(installDirectory, 'composio'),
            appVersion: '0.0.0-test',
          }).pipe(Effect.flip);

          expect(fetchMock).toHaveBeenCalledOnce();
          const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
          expect(requestUrl).toBe(
            'https://prefixed-proxy.test/repos/ComposioHQ/composio/releases/tags/%40composio%2Fcli%408.8.8-test'
          );
        }).pipe(
          Effect.withConfigProvider(extendConfigProvider(BaseConfigProviderLive)),
          Effect.ensuring(
            Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
          )
        );
      }
    );
  });
});

/**
 * Release archives fill only the codex-acp binary their own platform can execute
 * and leave the other three as empty placeholders, so that a CLI installed
 * before 2026-08-18 still passes its upgrade verification. A placeholder must
 * never be handed back as a runnable adapter.
 */
describe('resolveRunCompanionAssetPath', () => {
  layer(BunContext.layer)(it => {
    const withInstallDirectory = <A, E, R>(
      contents: number,
      use: (execPath: string) => Effect.Effect<A, E, R>
    ) =>
      Effect.gen(function* () {
        const installDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-asset-'));
        const execPath = path.join(installDirectory, 'composio');
        const assetPath = path.join(installDirectory, 'acp-adapters', 'codex', 'darwin-arm64');
        fs.mkdirSync(assetPath, { recursive: true });
        fs.writeFileSync(path.join(assetPath, 'codex-acp'), Buffer.alloc(contents));
        return yield* use(execPath);
      });

    const relativePathFromRoot = 'acp-adapters/codex/darwin-arm64/codex-acp';

    it.effect('resolves a populated binary', () =>
      withInstallDirectory(64, execPath =>
        Effect.gen(function* () {
          const resolved = yield* resolveRunCompanionAssetPath({
            callerImportMetaUrl: import.meta.url,
            execPath,
            relativePathFromRoot,
            requireNonEmpty: true,
          });

          expect(resolved).toBe(path.join(path.dirname(execPath), relativePathFromRoot));
        })
      )
    );

    it.effect('reports an empty placeholder as absent under requireNonEmpty', () =>
      withInstallDirectory(0, execPath =>
        Effect.gen(function* () {
          const resolved = yield* resolveRunCompanionAssetPath({
            callerImportMetaUrl: import.meta.url,
            execPath,
            relativePathFromRoot,
            requireNonEmpty: true,
          });

          expect(resolved).toBeNull();
        })
      )
    );

    it.effect('still resolves an empty file when only existence is required', () =>
      withInstallDirectory(0, execPath =>
        Effect.gen(function* () {
          const resolved = yield* resolveRunCompanionAssetPath({
            callerImportMetaUrl: import.meta.url,
            execPath,
            relativePathFromRoot,
          });

          expect(resolved).toBe(path.join(path.dirname(execPath), relativePathFromRoot));
        })
      )
    );
  });
});
