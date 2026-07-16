import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import {
  decodeToolRouterPermissionsConfig,
  gateToolExecution,
  ToolPermissionDeniedError,
} from 'src/services/tool-permissions';

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
