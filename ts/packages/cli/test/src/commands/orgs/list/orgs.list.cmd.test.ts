import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import type { MockAccountRequest } from 'test/__utils__/services/test-layer';

// The fixture stores a login whose current org is `org_1`.
const LOGGED_IN_FIXTURE = 'user-config-with-global-context';

const ORGANIZATIONS = [
  { id: 'org_0', name: 'Other Org' },
  { id: 'org_1', name: 'Current Org' },
];

/** The `limit` of every `org.list` request the mock client served. */
const recordLimits = () => {
  const limits: Array<unknown> = [];
  const onRequest = (request: MockAccountRequest) => {
    if (request.operation === 'org.list') {
      limits.push((request.params as { readonly limit?: number } | undefined)?.limit);
    }
  };
  return { limits, onRequest };
};

describe('CLI: composio orgs list', () => {
  layer(TestLive())('[Given] no API key', it => {
    it.effect('[Then] fails with NotLoggedInError', () =>
      Effect.gen(function* () {
        const error = yield* cli(['orgs', 'list']).pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });

  const defaultLimit = recordLimits();
  layer(
    TestLive({
      fixture: LOGGED_IN_FIXTURE,
      accountData: { organizations: ORGANIZATIONS, onRequest: defaultLimit.onRequest },
    })
  )('[Given] two organizations and a current org', it => {
    it.effect('[Then] prints them as JSON on stdout and marks the current one on stderr', () =>
      Effect.gen(function* () {
        yield* cli(['orgs', 'list']);

        const stdout = yield* MockConsole.getLines({ stream: 'stdout' });
        const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
        expect(stdout).toEqual([
          JSON.stringify([
            { id: 'org_0', name: 'Other Org', is_selected_global_org: false },
            { id: 'org_1', name: 'Current Org', is_selected_global_org: true },
          ]),
        ]);
        expect(stderr).toEqual([
          '-- composio orgs list --',
          'Loaded 2 orgs',
          '  Other Org (org_0)\n✓ Current Org (org_1)',
          '-- Hint: run `composio orgs switch` to switch the default global org/project. --',
        ]);
        expect(defaultLimit.limits).toEqual([50]);
      })
    );
  });

  const clamped = recordLimits();
  layer(
    TestLive({
      fixture: LOGGED_IN_FIXTURE,
      accountData: { organizations: ORGANIZATIONS, onRequest: clamped.onRequest },
    })
  )('[Given] --limit outside 1..1000', it => {
    it.effect('[Then] clamps the requested limit into range', () =>
      Effect.gen(function* () {
        yield* cli(['orgs', 'list', '--limit', '5000']);
        yield* cli(['orgs', 'list', '--limit', '0']);

        expect(clamped.limits).toEqual([1000, 1]);
      })
    );
  });

  layer(TestLive({ fixture: LOGGED_IN_FIXTURE, accountData: { organizations: [] } }))(
    '[Given] no organizations',
    it => {
      it.effect('[Then] warns and prints no data', () =>
        Effect.gen(function* () {
          yield* cli(['orgs', 'list']);

          const stdout = yield* MockConsole.getLines({ stream: 'stdout' });
          const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
          expect(stdout).toEqual([]);
          expect(stderr).toContain('No organizations found.');
          expect(stderr).not.toContain(
            '-- Hint: run `composio orgs switch` to switch the default global org/project. --'
          );
        })
      );
    }
  );
});
