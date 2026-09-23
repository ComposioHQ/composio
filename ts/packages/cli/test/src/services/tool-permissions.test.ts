import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import { vi } from 'vitest';
import { Config, ConfigProvider, Effect, Layer, Option } from 'effect';
import { Composio as RawComposioClient } from '@composio/client';

// Enhanced controls are disabled on darwin-x64, so pin the platform: these
// scenarios are about the transport, not about where the CLI runs.
vi.mock('@composio/cli-local-tools', async importOriginal => ({
  ...(await importOriginal<typeof import('@composio/cli-local-tools')>()),
  detectCliPlatform: () => 'linux-x64',
}));
import {
  decodeCacheFileTolerant,
  decodeToolRouterPermissionsConfig,
  gateToolExecution,
  refreshConsumerPermissionSnapshot,
  resolveGateState,
  ToolPermissionDeniedError,
  type ConsumerPermissionSnapshot,
} from 'src/services/tool-permissions';
import { extendConfigProvider } from 'src/services/config';
import { NodeOs } from 'src/services/node-os';
import {
  ComposioClientConfigurationError,
  ComposioClientSingleton,
} from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';

// Pinned wall clock for deterministic fixtures. The SUT reads the real
// `Date.now()` (snapshot TTL, allow-decision expiry), so every timestamp
// below is expressed relative to this instant.
const PINNED_TIME = new Date('2026-01-01T00:00:00.000Z');
const PINNED_NOW = PINNED_TIME.getTime();

const ToolPermissionsTest = Layer.mergeAll(
  BunFileSystem.layer,
  BunPath.layer,
  NodeOs.Default,
  // fromEnv() snapshots the environment when built; build it per provide so the
  // per-test COMPOSIO_CACHE_DIR stub is observed.
  ConfigProvider.layer(Effect.sync(() => extendConfigProvider(ConfigProvider.fromEnv())))
);

const snapshotFixture = (
  overrides: Partial<ConsumerPermissionSnapshot> = {}
): ConsumerPermissionSnapshot => ({
  orgId: 'org_test',
  projectId: 'project_test',
  consumerUserId: 'user_test',
  enhancedControlsEnabled: true,
  permissions: { default: 'allow_all', overrides: {} },
  connectedAccountIds: [],
  fetchedAt: PINNED_NOW,
  ...overrides,
});

/**
 * The consumer endpoints the permission snapshot reads. Both are absent from
 * the v3.1 spec, so production calls them through the client's generic
 * `get`/`post`; the double answers at that same boundary.
 */
const permissionsClientLayer = (responses: {
  readonly config?: unknown;
  readonly permissions?: unknown;
  readonly clientUnavailable?: boolean;
}) => {
  const paths: string[] = [];
  const client = {
    get: async (path: string) => {
      paths.push(`GET ${path}`);
      if (responses.config === undefined) throw new Error(`no stub for GET ${path}`);
      return responses.config;
    },
    post: async (path: string) => {
      paths.push(`POST ${path}`);
      if (responses.permissions === undefined) throw new Error(`no stub for POST ${path}`);
      return responses.permissions;
    },
  } as unknown as RawComposioClient;

  const layer = Layer.mergeAll(
    Layer.succeed(
      ComposioClientSingleton,
      ComposioClientSingleton.of({
        get: () => Effect.succeed(client),
        getFor: () =>
          responses.clientUnavailable === true
            ? Effect.fail(
                new ComposioClientConfigurationError({
                  message: 'invalid base URL',
                  cause: null,
                })
              )
            : Effect.succeed(client),
        getMetrics: () => Effect.succeed({ byteSize: 0, requests: 0 }),
      })
    ),
    Layer.succeed(
      ComposioUserContext,
      ComposioUserContext.of({
        data: {
          apiKey: Option.some('uak_permissions_test'),
          baseURL: 'https://backend.composio.dev',
          webURL: 'https://app.composio.dev',
          orgId: Option.some('org_test'),
          projectId: Option.none(),
          testUserId: Option.none(),
        },
        isLoggedIn: () => true,
        logout: Effect.void,
        login: () => Effect.void,
        update: () => Effect.void,
      })
    )
  );

  return { layer, paths };
};

const refreshParams = {
  orgId: 'org_test',
  projectId: 'project_test',
  consumerUserId: 'user_test',
  connectedAccountIds: ['ca_one'],
};

describe('tool permissions', () => {
  beforeEach(() => {
    // Fake ONLY `Date`: the SUT's cache reads/writes run on the live Effect
    // runtime, so real timers and microtasks must keep running.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(PINNED_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps forward-version permission modes to interactive safe defaults', () => {
    const decoded = decodeToolRouterPermissionsConfig({
      default: 'future_default_mode',
      overrides: {
        'GMAIL_SEND_EMAIL:__none__': 'future_override_mode',
      },
    });

    expect(Option.isSome(decoded)).toBe(true);
    if (Option.isSome(decoded)) {
      expect(decoded.value).toStrictEqual({
        default: 'ask_every_call',
        overrides: {
          'GMAIL_SEND_EMAIL:__none__': 'ask_always',
        },
      });
    }
  });

  it('drops only corrupt cache entries, keeping valid snapshots and allow decisions', () => {
    const good = snapshotFixture();
    const raw = JSON.stringify({
      entries: {
        good: good,
        skewed: { ...good, fetchedAt: 'not-a-number' },
      },
      allowEntries: {
        kept: { expiresAt: PINNED_NOW + 60_000 },
        broken: { expiresAt: 'soon' },
      },
    });

    const decoded = decodeCacheFileTolerant(raw);

    expect(Object.keys(decoded.entries)).toStrictEqual(['good']);
    expect(Object.keys(decoded.allowEntries ?? {})).toStrictEqual(['kept']);
  });

  it('returns an empty cache for unparseable cache files', () => {
    expect(decodeCacheFileTolerant('not json')).toStrictEqual({ entries: {} });
  });

  it('skips gating when no snapshot applies (developer mode)', () => {
    expect(resolveGateState({ toolSlug: 'GMAIL_SEND_EMAIL' })).toBe('skip');
  });

  it('skips gating when enhanced controls are known disabled', () => {
    expect(
      resolveGateState({
        toolSlug: 'GMAIL_SEND_EMAIL',
        snapshot: snapshotFixture({ enhancedControlsEnabled: false }),
      })
    ).toBe('skip');
    expect(
      resolveGateState({
        toolSlug: 'GMAIL_SEND_EMAIL',
        snapshot: snapshotFixture({ permissions: undefined }),
      })
    ).toBe('skip');
  });

  it('fails closed via the synthesized ask-every-call snapshot when policy resolution failed', () => {
    // Shape produced by refreshConsumerPermissionSnapshot when the org
    // reports enhanced controls enabled but the permissions resolve fails.
    expect(
      resolveGateState({
        toolSlug: 'GMAIL_SEND_EMAIL',
        snapshot: snapshotFixture({ permissions: { default: 'ask_every_call' } }),
      })
    ).toBe('ask_every_call');
  });

  it('resolves overrides ahead of the default mode', () => {
    expect(
      resolveGateState({
        toolSlug: 'GMAIL_SEND_EMAIL',
        snapshot: snapshotFixture({
          permissions: {
            default: 'allow_all',
            overrides: { 'GMAIL_SEND_EMAIL:__none__': 'always_deny' },
          },
        }),
      })
    ).toBe('always_deny');
  });

  it.effect('lets execution proceed ungated without a snapshot', () =>
    Effect.gen(function* () {
      const result = yield* gateToolExecution({ toolSlug: 'GMAIL_SEND_EMAIL' });

      expect(result).toBeUndefined();
    }).pipe(Effect.provide(ToolPermissionsTest))
  );

  it.effect('preserves permission-policy denial identity', () =>
    Effect.gen(function* () {
      const failure = yield* gateToolExecution({
        toolSlug: 'GMAIL_SEND_EMAIL',
        snapshot: {
          orgId: 'org_test',
          projectId: 'project_test',
          consumerUserId: 'user_test',
          enhancedControlsEnabled: true,
          permissions: {
            default: 'allow_all',
            overrides: {
              'GMAIL_SEND_EMAIL:__none__': 'always_deny',
            },
          },
          connectedAccountIds: [],
          fetchedAt: PINNED_NOW,
        },
      }).pipe(Effect.flip);

      expect(failure).toBeInstanceOf(ToolPermissionDeniedError);
      if (failure instanceof ToolPermissionDeniedError) {
        expect(failure.deniedBy).toBe('permissions');
        expect(failure.toolSlug).toBe('GMAIL_SEND_EMAIL');
      }
    }).pipe(Effect.provide(ToolPermissionsTest))
  );

  it.effect('fails closed when interactive approval is needed but permission UI is disabled', () =>
    Effect.gen(function* () {
      vi.stubEnv('COMPOSIO_DISABLE_PERMISSION_UI', '1');

      const failure = yield* gateToolExecution({
        toolSlug: 'GMAIL_SEND_EMAIL',
        snapshot: snapshotFixture({ permissions: { default: 'ask_every_call' } }),
      }).pipe(Effect.flip);

      expect(failure).toBeInstanceOf(ToolPermissionDeniedError);
      if (failure instanceof ToolPermissionDeniedError) {
        expect(failure.deniedBy).toBe('permissions');
        expect(failure.message).toContain('permission prompts are disabled');
      }
    }).pipe(Effect.provide(ToolPermissionsTest))
  );

  it.effect('honors cached allow decisions even when permission UI is disabled', () =>
    Effect.gen(function* () {
      vi.stubEnv('COMPOSIO_DISABLE_PERMISSION_UI', '1');

      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // The shared vitest setup pins COMPOSIO_CACHE_DIR to a fresh temp directory.
      const cacheDir = yield* Config.String('COMPOSIO_CACHE_DIR').parse(ConfigProvider.fromEnv());
      // Key shape: `${orgId}:${projectId}:${consumerUserId}:${toolSlug}:${accountId}`.
      const allowKey = 'org_cached_allow:project_test:user_test:GMAIL_SEND_EMAIL:__none__';
      yield* fs.writeFileString(
        path.join(cacheDir, 'tool-permissions-cache.json'),
        JSON.stringify({
          entries: {},
          // Unexpired relative to the pinned clock the SUT's expiry check reads.
          allowEntries: { [allowKey]: { expiresAt: PINNED_NOW + 60_000 } },
        })
      );

      const result = yield* gateToolExecution({
        toolSlug: 'GMAIL_SEND_EMAIL',
        snapshot: snapshotFixture({
          orgId: 'org_cached_allow',
          permissions: { default: 'ask_every_call' },
        }),
      });

      expect(result).toStrictEqual({ approvalStatus: 'cached_approved' });
    }).pipe(Effect.provide(ToolPermissionsTest))
  );

  describe('consumer permission snapshot over the owned client', () => {
    it.effect('reads the policy through the client and keeps it in the snapshot', () =>
      Effect.gen(function* () {
        const stub = permissionsClientLayer({
          config: { enhanced_controls: true },
          permissions: { experimental: { permissions: { default: 'allow_all', overrides: {} } } },
        });

        const snapshot = yield* refreshConsumerPermissionSnapshot(refreshParams).pipe(
          Effect.provide(stub.layer)
        );

        expect(stub.paths).toEqual([
          'GET /api/v3.1/org/consumer/config',
          'POST /api/v3.1/consumer/permissions/resolve',
        ]);
        expect(snapshot?.enhancedControlsEnabled).toBe(true);
        expect(snapshot?.permissions).toEqual({ default: 'allow_all', overrides: {} });
      }).pipe(Effect.provide(ToolPermissionsTest))
    );

    it.effect('fails closed to ask_every_call when the policy call fails', () =>
      Effect.gen(function* () {
        const stub = permissionsClientLayer({ config: { enhanced_controls: true } });

        const snapshot = yield* refreshConsumerPermissionSnapshot(refreshParams).pipe(
          Effect.provide(stub.layer)
        );

        expect(snapshot?.enhancedControlsEnabled).toBe(true);
        expect(snapshot?.permissions).toEqual({ default: 'ask_every_call' });
        expect(resolveGateState({ snapshot, toolSlug: 'GMAIL_SEND_EMAIL' })).toBe('ask_every_call');
      }).pipe(Effect.provide(ToolPermissionsTest))
    );

    it.effect('returns no snapshot when a client cannot be built', () =>
      Effect.gen(function* () {
        const stub = permissionsClientLayer({ clientUnavailable: true });

        const snapshot = yield* refreshConsumerPermissionSnapshot(refreshParams).pipe(
          Effect.provide(stub.layer)
        );

        expect(snapshot).toBeUndefined();
        expect(stub.paths).toEqual([]);
      }).pipe(Effect.provide(ToolPermissionsTest))
    );
  });
});
