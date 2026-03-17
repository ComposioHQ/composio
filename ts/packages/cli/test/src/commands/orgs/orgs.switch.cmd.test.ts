import path from 'node:path';
import { ConfigProvider, Effect } from 'effect';
import { describe, expect, layer } from '@effect/vitest';
import { afterEach, vi } from 'vitest';
import { FileSystem } from '@effect/platform';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import * as constants from 'src/constants';
import { setupCacheDir } from 'src/effects/setup-cache-dir';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([
    ['COMPOSIO_USER_API_KEY', 'uak_test_key'],
    ['USER_API_KEY', 'uak_test_key'],
  ])
);

const mockFetchResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('CLI: composio manage orgs switch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(it => {
    it.scoped('[When] no --org-id is provided [Then] lists orgs and projects with limit=50', () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce(
            mockFetchResponse({
              organizations: [{ id: 'org_1', name: 'Org One' }],
            })
          )
          .mockResolvedValueOnce(
            mockFetchResponse({
              data: [{ id: 'project_1', name: 'Project One' }],
            })
          );

        yield* cli(['manage', 'orgs', 'switch']);

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        const [orgUrl, orgRequest] = fetchSpy.mock.calls[0]!;
        expect(orgUrl).toContain('/api/v3/org/list?limit=50');
        expect((orgRequest as RequestInit).headers).toMatchObject({
          'x-user-api-key': 'uak_test_key',
        });

        const [projectUrl, projectRequest] = fetchSpy.mock.calls[1]!;
        expect(projectUrl).toContain('/api/v3/org/project/list?limit=50');
        expect((projectRequest as RequestInit).headers).toMatchObject({
          'x-user-api-key': 'uak_test_key',
          'x-org-id': 'org_1',
        });

        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        const userConfigPath = path.join(cacheDir, constants.USER_CONFIG_FILE_NAME);
        const rawUserConfig = yield* fs.readFileString(userConfigPath, 'utf8');
        const userConfig = JSON.parse(rawUserConfig) as Record<string, unknown>;
        expect(userConfig.org_id).toBe('org_1');
        expect(userConfig.project_id).toBe('project_1');

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Updated global defaults');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(it => {
    it.scoped('[When] --org-id is provided [Then] skips org list and selects project', () =>
      Effect.gen(function* () {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          mockFetchResponse({
            data: [
              { id: 'project_1', name: 'Project One' },
              { id: 'project_2', name: 'Project Two' },
            ],
          })
        );

        yield* cli(['manage', 'orgs', 'switch', '--org-id', 'org_manual']);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [projectUrl, projectRequest] = fetchSpy.mock.calls[0]!;
        expect(projectUrl).toContain('/api/v3/org/project/list?limit=50');
        expect((projectRequest as RequestInit).headers).toMatchObject({
          'x-user-api-key': 'uak_test_key',
          'x-org-id': 'org_manual',
        });

        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        const userConfigPath = path.join(cacheDir, constants.USER_CONFIG_FILE_NAME);
        const rawUserConfig = yield* fs.readFileString(userConfigPath, 'utf8');
        const userConfig = JSON.parse(rawUserConfig) as Record<string, unknown>;
        expect(userConfig.org_id).toBe('org_manual');
        expect(userConfig.project_id).toBe('project_1');
      })
    );
  });
});
