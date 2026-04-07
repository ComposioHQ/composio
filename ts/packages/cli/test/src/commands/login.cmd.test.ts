import { describe, expect, layer } from '@effect/vitest';
import { vi, afterEach } from 'vitest';
import { Effect } from 'effect';
import path from 'node:path';
import { FileSystem } from '@effect/platform';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import * as constants from 'src/constants';
import { setupCacheDir } from 'src/effects/setup-cache-dir';

const mockFetchResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CLI: composio login', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login --help', () => {
    layer(TestLive())(it => {
      it.scoped('[Then] shows browser, session, direct-login flags and no legacy --api-key', () =>
        Effect.gen(function* () {
          yield* cli(['login', '--help']);
          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('--no-browser');
          expect(output).toContain('--no-wait');
          expect(output).toContain('--key');
          expect(output).toContain('--user-api-key');
          expect(output).toContain('--org');
          expect(output).toContain('--yes');
          expect(output).toContain('-y');
          expect(output).not.toMatch(/(^|\s)--api-key(?:\s|$)/);
        })
      );
    });
  });

  layer(TestLive())(it => {
    it.scoped('[When] logging in with --user-api-key --org [Then] stores the chosen org', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockImplementation(
          async (requestInput: RequestInfo | URL, init?: RequestInit) => {
            const url =
              typeof requestInput === 'string'
                ? requestInput
                : requestInput instanceof URL
                  ? requestInput.toString()
                  : requestInput.url;

            if (url.includes('/api/v3/auth/session/info')) {
              return mockFetchResponse({
                project: {
                  name: 'Default Project',
                  id: 'project_id_default',
                  org_id: 'org_default',
                  nano_id: 'project_default',
                  email: 'project@example.com',
                  created_at: '2026-01-01T00:00:00.000Z',
                  updated_at: '2026-01-01T00:00:00.000Z',
                  org: { id: 'org_default', name: 'Default Org', plan: 'enterprise' },
                },
                org_member: {
                  id: 'member_123',
                  user_id: 'user_123',
                  email: 'cli@example.com',
                  name: 'CLI User',
                  role: 'admin',
                },
                api_key: null,
              });
            }

            if (url.includes('/api/v3/org/list?limit=50')) {
              expect(new Headers(init?.headers).get('x-user-api-key')).toBe('uak_direct_key');
              return mockFetchResponse({
                organizations: [
                  { id: 'org_default', name: 'Default Org' },
                  { id: 'org_selected', name: 'Selected Org' },
                ],
              });
            }

            return mockFetchResponse({});
          }
        );

        yield* cli([
          'login',
          '--user-api-key',
          'uak_direct_key',
          '--org',
          'org_selected',
          '--no-skill-install',
        ]);

        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        const userConfigPath = path.join(cacheDir, constants.USER_CONFIG_FILE_NAME);
        const rawUserConfig = yield* fs.readFileString(userConfigPath, 'utf8');
        const userConfig = JSON.parse(rawUserConfig) as Record<string, unknown>;
        expect(userConfig.api_key).toBe('uak_direct_key');
        expect(userConfig.org_id).toBe('org_selected');

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Logged in as cli@example.com in "Selected Org"');
      })
    );
  });
});
