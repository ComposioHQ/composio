import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BunContext } from '@effect/platform-bun';
import { afterEach, describe, expect, layer, vi } from '@effect/vitest';
import { Effect } from 'effect';
import { repairMissingInstalledRunCompanionModules } from 'src/services/run-companion-modules';
import { BaseConfigProviderLive, extendConfigProvider } from 'src/services/config';

describe('run-companion-modules', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  layer(BunContext.layer)(it => {
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
