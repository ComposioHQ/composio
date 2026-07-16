import { afterEach, beforeEach, describe, expect, it, vi } from '@effect/vitest';
import { Effect } from 'effect';
import {
  decodeCacheFileTolerant,
  gateToolExecution,
  resolveGateState,
  type ConsumerPermissionSnapshot,
} from 'src/services/tool-permissions';

// Pinned wall clock for deterministic fixtures. The SUT reads the real
// `Date.now()` (snapshot TTL, allow-decision expiry), so every timestamp
// below is expressed relative to this instant.
const PINNED_TIME = new Date('2026-01-01T00:00:00.000Z');
const PINNED_NOW = PINNED_TIME.getTime();

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
    })
  );
});
