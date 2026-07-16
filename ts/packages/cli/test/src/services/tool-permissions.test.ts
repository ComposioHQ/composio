import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import {
  decodeCacheFileTolerant,
  decodeToolRouterPermissionsConfig,
  gateToolExecution,
  resolveGateState,
  ToolPermissionDeniedError,
  type ConsumerPermissionSnapshot,
} from 'src/services/tool-permissions';

const snapshotFixture = (
  overrides: Partial<ConsumerPermissionSnapshot> = {}
): ConsumerPermissionSnapshot => ({
  orgId: 'org_test',
  projectId: 'project_test',
  consumerUserId: 'user_test',
  enhancedControlsEnabled: true,
  permissions: { default: 'allow_all', overrides: {} },
  connectedAccountIds: [],
  fetchedAt: Date.now(),
  ...overrides,
});

describe('tool permissions', () => {
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
        kept: { expiresAt: Date.now() + 60_000 },
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

  it('fails closed to the interactive default when the snapshot state is unknown', () => {
    expect(resolveGateState({ toolSlug: 'GMAIL_SEND_EMAIL', snapshot: 'unknown' })).toBe(
      'ask_every_call'
    );
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
    })
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
          fetchedAt: Date.now(),
        },
      }).pipe(Effect.flip);

      expect(failure).toBeInstanceOf(ToolPermissionDeniedError);
      if (failure instanceof ToolPermissionDeniedError) {
        expect(failure.deniedBy).toBe('permissions');
        expect(failure.toolSlug).toBe('GMAIL_SEND_EMAIL');
      }
    })
  );
});
