import { describe, expect, layer } from '@effect/vitest';
import { vi, afterEach } from 'vitest';
import { Effect, Option } from 'effect';
import path from 'node:path';
import { FileSystem } from '@effect/platform';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import * as constants from 'src/constants';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { ComposioUserContext } from 'src/services/user-context';

const mockFetchResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const setTtyState = (state: { stdin: boolean; stdout: boolean; stderr: boolean }) => {
  const descriptors = {
    stdin: Object.getOwnPropertyDescriptor(process.stdin, 'isTTY'),
    stdout: Object.getOwnPropertyDescriptor(process.stdout, 'isTTY'),
    stderr: Object.getOwnPropertyDescriptor(process.stderr, 'isTTY'),
  };
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: state.stdin });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: state.stdout });
  Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: state.stderr });
  return () => {
    if (descriptors.stdin) Object.defineProperty(process.stdin, 'isTTY', descriptors.stdin);
    else delete (process.stdin as { isTTY?: boolean }).isTTY;
    if (descriptors.stdout) Object.defineProperty(process.stdout, 'isTTY', descriptors.stdout);
    else delete (process.stdout as { isTTY?: boolean }).isTTY;
    if (descriptors.stderr) Object.defineProperty(process.stderr, 'isTTY', descriptors.stderr);
    else delete (process.stderr as { isTTY?: boolean }).isTTY;
  };
};

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
          expect(output).toContain('--poll');
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
    it.scoped('[When] stdin is non-interactive [Then] login prints agent instructions', () =>
      Effect.gen(function* () {
        const restoreTty = setTtyState({ stdin: false, stdout: true, stderr: true });
        try {
          yield* cli(['login']);
        } finally {
          restoreTty();
        }

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Open this URL in your browser to log in:');
        expect(output).toContain(
          'https://dashboard.composio.dev/?cliKey=te00st11-d0c4-4efa-8117-c638886063e0'
        );
        expect(output).toContain('Then run this command to complete login:');
        expect(output).toContain('composio login --poll');
        expect(output).toContain('hint: For agents:');
        expect(output).toContain('cached login key');
        expect(output).toContain('polls for up to 10 minutes');
        expect(output).not.toContain('Expires at:');
        expect(output).toContain('Do not ask the user whether to poll');

        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        const pendingLoginRaw = yield* fs.readFileString(
          path.join(cacheDir, 'pending-login-session.json'),
          'utf8'
        );
        const pendingLogin = JSON.parse(pendingLoginRaw) as Record<string, unknown>;
        expect(pendingLogin.key).toBe('te00st11-d0c4-4efa-8117-c638886063e0');

        expect(output).not.toContain('-- composio login --');
        expect(output).not.toContain('Please login using the following URL');
        expect(output).not.toContain('Login URL');
        expect(output).not.toContain('Login instructions');
        expect(output).not.toContain('Installed composio-cli skill');
      })
    );
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
                  org: { id: 'org_default', name: 'Example Org', plan: 'enterprise' },
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
                  { id: 'org_default', name: 'Example Org' },
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
        // Default `security: "auto"` keeps the API key in plaintext
        // `user_data.json` for backwards compatibility — same as
        // every prior CLI release. Users opt into keyring storage
        // by setting `security: "keychain-subprocess"` (or
        // `"keychain"` for the experimental FFI path) in
        // `~/.composio/config.json`.
        expect(userConfig.api_key).toBe('uak_direct_key');
        expect(userConfig.org_id).toBe('org_selected');

        // ComposioUserContext also exposes the resolved key in-memory
        // for subsequent API calls in this process.
        const ctx = yield* ComposioUserContext;
        expect(Option.getOrUndefined(ctx.data.apiKey)).toBe('uak_direct_key');

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Logged in as cli@example.com in "Selected Org"');
      })
    );
  });
});
