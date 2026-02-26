import { describe, expect, layer } from '@effect/vitest';
import { vi, afterEach } from 'vitest';
import { Effect } from 'effect';
import { ComposioUserContext } from 'src/services/user-context';
import { cli, TestLive, MockConsole } from 'test/__utils__';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a canned SessionInfoResponse JSON body for mocking `getSessionInfo`
 * and `getSessionInfoByUserApiKey`.
 */
const makeSessionInfoBody = (overrides?: {
  orgId?: string;
  orgNanoId?: string;
  orgMemberId?: string;
  orgName?: string;
  projectId?: string;
  projectNanoId?: string;
  projectName?: string;
  email?: string;
  memberName?: string;
}) => ({
  project: {
    name: overrides?.projectName ?? 'test-project',
    id: overrides?.projectId ?? 'proj_test_123',
    org_id: overrides?.orgId ?? 'org_test_456',
    nano_id: overrides?.projectNanoId ?? 'pr_nano_789',
    email: overrides?.email ?? 'test@composio.dev',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    org: {
      name: overrides?.orgName ?? 'Test Org',
      id: overrides?.orgNanoId ?? 'org_nano_456',
      plan: 'free',
    },
  },
  org_member: {
    id: overrides?.orgMemberId ?? 'org_member_uuid_456',
    email: overrides?.email ?? 'test@composio.dev',
    name: overrides?.memberName ?? 'Test User',
    role: 'admin',
  },
  api_key: {
    name: 'default',
    project_id: overrides?.projectId ?? 'proj_test_123',
    id: 'ak_test',
    org_member_id: overrides?.orgId ?? 'org_test_456',
  },
});

/**
 * Creates a mock Response object.
 */
function mockFetchResponse(body: unknown, status = 200): Response {
  const bodyStr = JSON.stringify(body);
  return new Response(bodyStr, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CLI: composio login', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('[When] not logged in', () => {
    describe('non-interactive login: session/info succeeds', () => {
      layer(TestLive())(it => {
        it.scoped('[Then] stores credentials with enriched org/project IDs', () =>
          Effect.gen(function* () {
            const ctx = yield* ComposioUserContext;
            expect(ctx.isLoggedIn()).toBe(false);

            // Mock fetch for getSessionInfo call
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
              mockFetchResponse(
                makeSessionInfoBody({
                  orgId: 'org_verified_uuid',
                  orgNanoId: 'org_verified_nano',
                  orgMemberId: 'org_member_verified_uuid',
                  projectId: 'proj_verified_uuid',
                  projectNanoId: 'proj_verified_nano',
                  email: 'verified@composio.dev',
                  projectName: 'Verified Project',
                  orgName: 'Verified Org',
                })
              )
            );

            yield* cli([
              'login',
              '--api-key',
              'uak_test_key',
              '--org-id',
              'org_initial',
              '--project-id',
              'proj_initial',
            ]);

            // Verify fetch was called with session/info endpoint and correct headers
            expect(fetchSpy).toHaveBeenCalledOnce();
            const [url, init] = fetchSpy.mock.calls[0]!;
            expect(url).toContain('/api/v3/auth/session/info');
            expect((init as RequestInit).headers).toMatchObject({
              'x-user-api-key': 'uak_test_key',
              'x-org-id': 'org_initial',
              'x-project-id': 'proj_initial',
            });

            // The mutable isLoggedIn closure reflects the login
            expect(ctx.isLoggedIn()).toBe(true);

            // Verify console output contains the enriched email and success message
            const lines = yield* MockConsole.getLines();
            const output = lines.join('\n');
            expect(output).toContain('verified@composio.dev');
            expect(output).toContain('"org_id":"org_verified_nano"');
            expect(output).toContain('"project_id":"proj_verified_nano"');
            expect(output).toContain("You're all set!");
          })
        );
      });
    });

    describe('non-interactive login: session/info returns 500', () => {
      layer(TestLive())(it => {
        it.scoped('[Then] falls back to initial IDs on server error', () =>
          Effect.gen(function* () {
            const ctx = yield* ComposioUserContext;
            expect(ctx.isLoggedIn()).toBe(false);

            // Mock fetch to return a 500 error.
            // In strict mode, only 400-499 are hard failures.
            // 500 falls through the generic catch → undefined sessionInfo → use initial IDs.
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
              mockFetchResponse(
                {
                  status: 500,
                  error: {
                    error: {
                      message: 'Internal server error',
                      suggested_fix: 'Try again later',
                      code: 500,
                    },
                  },
                },
                500
              )
            );

            yield* cli([
              'login',
              '--api-key',
              'uak_fallback_key',
              '--org-id',
              'org_fallback',
              '--project-id',
              'proj_fallback',
            ]);

            // Credentials stored with initial (uncorrected) IDs since session/info failed
            expect(ctx.isLoggedIn()).toBe(true);

            const lines = yield* MockConsole.getLines();
            const output = lines.join('\n');
            expect(output).toContain('Logged in');
          })
        );
      });
    });

    describe('non-interactive login: session/info returns 401', () => {
      layer(TestLive())(it => {
        it.scoped('[Then] rejects invalid API key', () =>
          Effect.gen(function* () {
            const ctx = yield* ComposioUserContext;
            expect(ctx.isLoggedIn()).toBe(false);

            // Mock fetch to return 401
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
              mockFetchResponse(
                {
                  status: 401,
                  error: {
                    error: {
                      message: 'Invalid API key',
                      suggested_fix: 'Check your API key',
                      code: 401,
                    },
                  },
                },
                401
              )
            );

            // Non-interactive login: strict verification fails on 401
            const result = yield* cli([
              'login',
              '--api-key',
              'uak_bad_key',
              '--org-id',
              'org_test',
              '--project-id',
              'proj_test',
            ]).pipe(Effect.either);

            // The command should fail
            expect(result._tag).toBe('Left');

            // Should NOT be logged in after a failed verification
            expect(ctx.isLoggedIn()).toBe(false);
          })
        );
      });
    });

    describe('non-interactive login: session/info network failure', () => {
      layer(TestLive())(it => {
        it.scoped('[Then] falls back to initial IDs on network error', () =>
          Effect.gen(function* () {
            const ctx = yield* ComposioUserContext;
            expect(ctx.isLoggedIn()).toBe(false);

            // Mock fetch to throw a network error
            vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));

            yield* cli([
              'login',
              '--api-key',
              'uak_network_key',
              '--org-id',
              'org_net',
              '--project-id',
              'proj_net',
            ]);

            // Network errors are non-fatal even in strict mode (only 400-499 are strict)
            // Actually: the fetch itself fails → HttpServerError with no status →
            // strict check (e.status >= 400 && < 500) doesn't match → falls through → undefined
            expect(ctx.isLoggedIn()).toBe(true);

            const lines = yield* MockConsole.getLines();
            const output = lines.join('\n');
            expect(output).toContain('Logged in');
          })
        );
      });
    });
  });
});
