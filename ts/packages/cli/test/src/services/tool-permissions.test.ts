import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import {
  gateToolExecution,
  resolveGateState,
  type ConsumerPermissionSnapshot,
} from 'src/services/tool-permissions';

const PINNED_NOW = 1750000000000;

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
});
