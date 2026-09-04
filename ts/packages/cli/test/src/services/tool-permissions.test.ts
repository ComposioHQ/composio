import { FileSystem, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { afterEach, beforeEach, describe, expect, it, vi } from '@effect/vitest';
import { Config, ConfigProvider, Effect, Layer, Option } from 'effect';
import {
  decodeCacheFileTolerant,
  decodeToolRouterPermissionsConfig,
  gateToolExecution,
  resolveGateState,
  ToolPermissionDeniedError,
  type ConsumerPermissionSnapshot,
} from 'src/services/tool-permissions';
import { extendConfigProvider } from 'src/services/config';
import { NodeOs } from 'src/services/node-os';

// Pinned wall clock for deterministic fixtures. The SUT reads the real
// `Date.now()` (snapshot TTL, allow-decision expiry), so every timestamp
// below is expressed relative to this instant.
const PINNED_TIME = new Date('2026-01-01T00:00:00.000Z');
const PINNED_NOW = PINNED_TIME.getTime();

const ToolPermissionsTest = Layer.mergeAll(
  BunFileSystem.layer,
  BunPath.layer,
  NodeOs.Default,
  Layer.setConfigProvider(extendConfigProvider(ConfigProvider.fromEnv()))
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
      const cacheDir = yield* ConfigProvider.fromEnv().load(Config.string('COMPOSIO_CACHE_DIR'));
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
});
