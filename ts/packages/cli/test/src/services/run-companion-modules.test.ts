import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as BunServices from '@effect/platform-bun/BunServices';
import { afterEach, describe, expect, it, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { vi } from 'vitest';
import {
  listMissingInstalledRunCompanionModules,
  loadInstalledCompanionModule,
  repairMissingInstalledRunCompanionModules,
  RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS,
  RUN_COMPANION_MODULE_BASENAMES,
  RUN_COMPANION_MODULE_FILENAMES,
  RUN_COMPANION_RELEASE_TAG_FILENAME,
} from 'src/services/run-companion-modules';
import { getBaseConfigProvider, extendConfigProvider } from 'src/services/config';

const extractZipMock = vi.hoisted(() => vi.fn());
vi.mock('extract-zip', () => ({ default: extractZipMock }));

const TEST_RELEASE_TAG = '@composio/cli@0.3.0-test';
const TEST_BINARY_ASSET_NAMES = [
  'composio-darwin-aarch64.zip',
  'composio-darwin-x64.zip',
  'composio-linux-aarch64.zip',
  'composio-linux-x64.zip',
];
// A release archive ships the live companions plus the legacy placeholders.
const TEST_ARCHIVE_RELATIVE_PATHS = [
  ...RUN_COMPANION_MODULE_FILENAMES,
  ...RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS,
];

// What a complete install holds next to the executable.
const writeLiveCompanions = (installDirectory: string) => {
  fs.mkdirSync(path.join(installDirectory, 'services'));
  for (const fileName of RUN_COMPANION_MODULE_FILENAMES) {
    fs.writeFileSync(
      path.join(installDirectory, fileName),
      `export * from "./services/${fileName}";\n`
    );
    fs.writeFileSync(path.join(installDirectory, 'services', fileName), 'export {};\n');
  }
};

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
      for (const relativePath of TEST_ARCHIVE_RELATIVE_PATHS) {
        if (relativePath === missingRelativePath) continue;
        const filePath = path.join(packageDirectory, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(
          filePath,
          RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS.includes(relativePath)
            ? ''
            : `new:${relativePath}`
        );
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

  it('pins the legacy placeholder list to the ten paths released clients require', () => {
    expect(RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS).toEqual([
      'run-subagent-shared.mjs',
      'run-subagent-acp.mjs',
      'run-subagent-legacy.mjs',
      'run-subagent-output-mcp.mjs',
      'acp-adapters/claude-code-acp.mjs',
      'acp-adapters/cli.js',
      'acp-adapters/codex/darwin-arm64/codex-acp',
      'acp-adapters/codex/darwin-x64/codex-acp',
      'acp-adapters/codex/linux-arm64/codex-acp',
      'acp-adapters/codex/linux-x64/codex-acp',
    ]);
  });

  it('keeps the legacy placeholders out of the live companion list', () => {
    expect(
      RUN_COMPANION_MODULE_FILENAMES.filter(fileName =>
        RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS.includes(fileName)
      )
    ).toEqual([]);
  });

  layer(BunServices.layer)(it => {
    it.effect(
      '[Given] an install with only the live companions and their bundles [Then] nothing needs repair',
      () =>
        Effect.gen(function* () {
          const installDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-live-'));
          const execPath = path.join(installDirectory, 'composio');
          writeLiveCompanions(installDirectory);
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
      '[Given] an install holding empty legacy placeholders [Then] it is not damaged and nothing is repaired',
      () =>
        Effect.gen(function* () {
          const installDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-legacy-'));
          const execPath = path.join(installDirectory, 'composio');
          writeLiveCompanions(installDirectory);
          for (const relativePath of RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS) {
            const filePath = path.join(installDirectory, relativePath);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, '');
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

    it.effect('[Given] a missing run-helpers-runtime.mjs [Then] it is reported as missing', () =>
      Effect.gen(function* () {
        const installDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-missing-'));
        const execPath = path.join(installDirectory, 'composio');
        writeLiveCompanions(installDirectory);
        fs.rmSync(path.join(installDirectory, 'run-helpers-runtime.mjs'));

        return yield* Effect.gen(function* () {
          expect(yield* listMissingInstalledRunCompanionModules(execPath)).toEqual([
            'run-helpers-runtime.mjs',
          ]);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
          )
        );
      })
    );

    it.effect(
      '[Given] a missing companion wrapper [Then] repair restores the companions and leaves the archive placeholders behind',
      () => {
        const installDirectory = fs.mkdtempSync(
          path.join(os.tmpdir(), 'composio-run-repair-scope-')
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
          expect(fs.readdirSync(installDirectory).sort()).toEqual(
            [...RUN_COMPANION_MODULE_FILENAMES, RUN_COMPANION_RELEASE_TAG_FILENAME].sort()
          );
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
          )
        );
      }
    );

    it.effect(
      '[Given] only an unrelated companion is missing [Then] a scoped repair does nothing',
      () => {
        const installDirectory = fs.mkdtempSync(
          path.join(os.tmpdir(), 'composio-run-scoped-repair-')
        );
        const execPath = path.join(installDirectory, 'composio');
        fs.mkdirSync(path.join(installDirectory, 'services'));
        fs.writeFileSync(
          path.join(installDirectory, 'generation-runtime.mjs'),
          'export * from "./services/generation-runtime.mjs";\n'
        );
        fs.writeFileSync(path.join(installDirectory, 'services', 'generation-runtime.mjs'), '');
        const fetchMock = stubRepairFetch();

        return Effect.gen(function* () {
          expect(yield* listMissingInstalledRunCompanionModules(execPath)).not.toEqual([]);
          expect(
            yield* repairMissingInstalledRunCompanionModules({
              callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
              execPath,
              appVersion: '0.0.0-test',
              companionBaseName: 'generation-runtime',
            })
          ).toEqual({ repaired: false });
          expect(fetchMock).not.toHaveBeenCalled();
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
          )
        );
      }
    );

    it.effect(
      '[Given] a companion wrapper whose bundle is missing [Then] a scoped repair restores it',
      () => {
        const installDirectory = fs.mkdtempSync(
          path.join(os.tmpdir(), 'composio-run-scoped-repair-')
        );
        const execPath = path.join(installDirectory, 'composio');
        fs.writeFileSync(
          path.join(installDirectory, 'generation-runtime.mjs'),
          'export * from "./services/generation-runtime.mjs";\n'
        );
        stubRepairFetch();
        mockArchiveContents();

        return Effect.gen(function* () {
          const result = yield* repairMissingInstalledRunCompanionModules({
            callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
            execPath,
            appVersion: '0.0.0-test',
            companionBaseName: 'generation-runtime',
          });

          expect(result).toEqual({ repaired: true, releaseTag: TEST_RELEASE_TAG });
          expect(fs.existsSync(path.join(installDirectory, 'generation-runtime.mjs'))).toBe(true);
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
      const companionRelativePath = RUN_COMPANION_MODULE_FILENAMES[0]!;
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
      const missingRelativePath = RUN_COMPANION_MODULE_FILENAMES.at(-1)!;
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
          `missing ${missingRelativePath}; cannot restore the CLI's bundled support files`
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

          expect(error.message).toContain("Unable to restore the CLI's bundled support files");
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
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            extendConfigProvider(getBaseConfigProvider())
          ),
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
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            extendConfigProvider(getBaseConfigProvider())
          ),
          Effect.ensuring(
            Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
          )
        );
      }
    );
  });
});

describe('loadInstalledCompanionModule', () => {
  layer(BunServices.layer)(it => {
    it('registers the in-process companion alongside the run preload set', () => {
      expect(RUN_COMPANION_MODULE_BASENAMES).toEqual(
        expect.arrayContaining(['generation-runtime'])
      );
    });

    // From a checkout there is no `.mjs` next to an executable, so the loader
    // has to fall through to the `.ts` source next to `run-companion-modules.ts`.
    // The compiled-binary path (`dist/<name>.mjs` next to `process.execPath`)
    // is covered by the Docker E2E suite, which runs the real binary.
    it.effect('[Given] a source checkout [Then] it loads the module from its .ts source', () =>
      Effect.gen(function* () {
        const generation = yield* loadInstalledCompanionModule<
          typeof import('src/services/generation-runtime')
        >('generation-runtime', ['wrapInlineCodeForRun']);

        expect(generation.wrapInlineCodeForRun('1 + 1')).toBe('return (1 + 1);');
      })
    );

    it.effect('[Given] a module that cannot be loaded [Then] it fails with a typed error', () =>
      Effect.gen(function* () {
        const error = yield* loadInstalledCompanionModule('missing-companion-module', []).pipe(
          Effect.flip
        );

        expect(error._tag).toBe('services/RunCompanionRepairError');
        expect(error.message).toContain('missing-companion-module.mjs');
      })
    );

    it.effect(
      '[Given] a module from another release [Then] it fails with a typed error naming the missing export',
      () =>
        Effect.gen(function* () {
          const error = yield* loadInstalledCompanionModule<{
            readonly wrapInlineCodeForRun: unknown;
            readonly retiredExport: unknown;
          }>('generation-runtime', ['wrapInlineCodeForRun', 'retiredExport']).pipe(Effect.flip);

          expect(error._tag).toBe('services/RunCompanionRepairError');
          expect(error.message).toContain('generation-runtime');
          expect(error.message).toContain('missing retiredExport');
        })
    );

    it.effect('[Given] the generation companion [Then] its API is promise-shaped', () =>
      Effect.gen(function* () {
        const generation = yield* loadInstalledCompanionModule<
          typeof import('src/services/generation-runtime')
        >('generation-runtime', ['wrapInlineCodeForRun', 'generatePythonSourceFiles']);

        expect(generation.wrapInlineCodeForRun('1 + 1')).toBe('return (1 + 1);');
        const outcome = yield* Effect.promise(() =>
          generation.generatePythonSourceFiles({ banner: 'b', outputDir: '/tmp/out' }, {})
        );
        expect(outcome).toEqual({ _tag: 'Success', value: [] });
      })
    );
  });
});
