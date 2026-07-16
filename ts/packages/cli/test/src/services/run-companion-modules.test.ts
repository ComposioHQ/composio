import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repairMissingInstalledRunCompanionModules } from 'src/services/run-companion-modules';

describe('run-companion-modules', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('[Given] malformed release metadata [Then] repair rejects it before using release assets', async () => {
    const installDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-repair-test-'));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ tag_name: 123, assets: 'invalid' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(
        repairMissingInstalledRunCompanionModules({
          callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
          execPath: path.join(installDirectory, 'composio'),
          appVersion: '0.0.0-test',
        })
      ).rejects.toThrow("Unable to restore the files required by 'composio run'");
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      fs.rmSync(installDirectory, { recursive: true, force: true });
    }
  });
});
