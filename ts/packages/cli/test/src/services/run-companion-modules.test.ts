import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BunContext } from '@effect/platform-bun';
import { afterEach, describe, expect, layer, vi } from '@effect/vitest';
import { Effect } from 'effect';
import { repairMissingInstalledRunCompanionModules } from 'src/services/run-companion-modules';

describe('run-companion-modules', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
  });
});
