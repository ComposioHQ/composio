import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it } from '@effect/vitest';
import { Array as Arr, Console, Effect, Layer, Option } from 'effect';
import * as tempy from 'tempy';
import { afterEach, vi } from 'vitest';
import { runOrgsSwitch } from 'src/commands/orgs/switch/orgs.switch.handler';
import { NO_ORG_SELECTED_OUTRO } from 'src/commands/orgs/switch/orgs.switch.format';
import type { OrganizationSummary } from 'src/services/composio-account';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { NodeOs } from 'src/services/node-os';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import type { UserData } from 'src/models/user-data';
import { MockConsole } from 'test/__utils__';
import type { MockAccountRequest, MockRequestScope } from 'test/__utils__/layers/accounts';
import { makeShadowClient } from 'test/__utils__/layers/shadow-client';
import { makeSessionInfo } from 'test/__utils__/models/account';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

const analytics = vi.hoisted(() => ({ linked: [] as Array<string> }));

// Records each analytics identity link instead of enqueueing an event.
vi.mock('src/analytics/dispatch', async importOriginal => {
  const actual = await importOriginal<typeof import('src/analytics/dispatch')>();
  const { Effect } = await import('effect');
  return {
    ...actual,
    analyticsIdentityLinkingEnabled: Effect.succeed(true),
    linkApolloIdentityForAnalytics: ((apolloUserId: string) =>
      Effect.sync(() => {
        analytics.linked.push(apolloUserId);
      })) as unknown as typeof actual.linkApolloIdentityForAnalytics,
  };
});

afterEach(() => {
  analytics.linked.length = 0;
});

const ORGANIZATIONS: ReadonlyArray<OrganizationSummary> = [
  { id: 'org_first', name: 'First Org' },
  { id: 'org_current', name: 'Current Org' },
  { id: 'org_third', name: 'Third Org' },
];

interface OrgsSwitchFixture {
  readonly apiKey?: Option.Option<string>;
  readonly orgId?: Option.Option<string>;
  readonly testUserId?: Option.Option<string>;
  readonly organizations?: ReadonlyArray<OrganizationSummary>;
  /** The org name the picker answers with; the first option when absent. */
  readonly pick?: string;
}

/**
 * What `runOrgsSwitch` reads: a user context whose org updates land in `orgUpdates` (switching
 * must not log in again, so `login` fails the test), the account
 * family of the mock client, and a headless terminal whose picker answers with `pick` and
 * records the options it was shown in `prompts`, and whose stdout data lands in `outputs`.
 */
const orgsSwitchTest = (fixture: OrgsSwitchFixture = {}) => {
  const outputs: Array<string> = [];
  const orgUpdates: Array<string | undefined> = [];
  const prompts: Array<ReadonlyArray<{ readonly label: string; readonly hint?: string }>> = [];
  const requests: Array<MockAccountRequest> = [];
  const apiKey = fixture.apiKey ?? Option.some('uak_orgs_switch');
  const accountData = {
    organizations: fixture.organizations ?? ORGANIZATIONS,
    sessionInfo: (scope: MockRequestScope) =>
      makeSessionInfo({
        orgId: scope.orgId ?? 'org_unknown',
        orgName: 'Any Org',
        orgMemberId: `member_${scope.orgId}`,
      }),
    onRequest: (request: MockAccountRequest) => {
      requests.push(request);
    },
  };

  const select = <A>(
    _message: string,
    options: ReadonlyArray<{ readonly value: A; readonly label: string; readonly hint?: string }>
  ) =>
    Effect.sync(() => {
      prompts.push(options.map(({ label, hint }) => ({ label, hint })));
      return Arr.findFirst(options, option => option.label === fixture.pick).pipe(
        Option.orElse(() => Arr.head(options)),
        Option.map(option => option.value),
        Option.getOrThrow
      );
    });

  const layer = Layer.mergeAll(
    Layer.effect(Console.Console, MockConsole.make),
    Layer.succeed(
      TerminalUI,
      TerminalUI.of({
        ...terminalUITestImpl,
        select,
        output: data =>
          Effect.sync(() => {
            outputs.push(data);
          }),
      })
    ),
    Layer.succeed(
      ComposioUserContext,
      ComposioUserContext.of({
        data: {
          apiKey,
          baseURL: 'https://mock.invalid',
          webURL: 'https://platform.mock.invalid/',
          orgId: fixture.orgId ?? Option.none(),
          projectId: Option.none(),
          testUserId: fixture.testUserId ?? Option.none(),
        },
        backendMismatch: Option.none(),
        isLoggedIn: () => Option.isSome(apiKey),
        logout: Effect.void,
        login: () => Effect.die('orgs switch must update the org, not log in again'),
        update: (data: Partial<UserData>) =>
          Effect.sync(() => {
            orgUpdates.push(
              data.orgId === undefined ? undefined : Option.getOrUndefined(data.orgId)
            );
          }),
      })
    ),
    Layer.succeed(
      ComposioClientSingleton,
      ComposioClientSingleton.of({
        get: () => Effect.succeed(makeShadowClient(accountData, {})),
        getFor: (scope: MockRequestScope) => Effect.succeed(makeShadowClient(accountData, scope)),
        getMetrics: () => Effect.succeed({ byteSize: 0, requests: 0 }),
      })
    ),
    // The analytics link is mocked; its signature still names the platform services.
    BunFileSystem.layer,
    BunPath.layer,
    Layer.sync(NodeOs, () => {
      const dir = tempy.temporaryDirectory();
      return NodeOs.of({ homedir: dir, tmpdir: dir, arch: 'arm64', platform: 'darwin' });
    })
  );
  return { layer, outputs, orgUpdates, prompts, requests };
};

const orgListLimits = (requests: ReadonlyArray<MockAccountRequest>) =>
  requests
    .filter(request => request.operation === 'org.list')
    .map(request => (request.params as { readonly limit?: number } | undefined)?.limit);

describe('runOrgsSwitch', () => {
  it.effect('[Given] --org-id [Then] stores it without listing or prompting', () => {
    const { layer, outputs, orgUpdates, prompts, requests } = orgsSwitchTest({
      testUserId: Option.some('test_user'),
    });
    return Effect.gen(function* () {
      yield* runOrgsSwitch({ orgId: Option.some('org_explicit'), limit: 50 });

      expect(orgListLimits(requests)).toEqual([]);
      expect(prompts).toEqual([]);
      expect(orgUpdates).toEqual(['org_explicit']);
      expect(analytics.linked).toEqual(['member_org_explicit']);
      expect(outputs).toEqual([JSON.stringify({ scope: 'global', org_id: 'org_explicit' })]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] several orgs and a current one [Then] the picker lists the current org first and stores the pick',
    () => {
      const { layer, outputs, orgUpdates, prompts } = orgsSwitchTest({
        orgId: Option.some('org_current'),
        pick: 'Third Org',
      });
      return Effect.gen(function* () {
        yield* runOrgsSwitch({ orgId: Option.none(), limit: 50 });

        expect(prompts).toEqual([
          [
            { label: 'Current Org', hint: 'org_current (current)' },
            { label: 'First Org', hint: 'org_first' },
            { label: 'Third Org', hint: 'org_third' },
          ],
        ]);
        expect(orgUpdates).toEqual(['org_third']);
        expect(analytics.linked).toEqual(['member_org_third']);
        expect(outputs).toEqual([JSON.stringify({ scope: 'global', org_id: 'org_third' })]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('[Given] several orgs and no current one [Then] the picker keeps the API order', () => {
    const { layer, prompts } = orgsSwitchTest({ pick: 'First Org' });
    return Effect.gen(function* () {
      yield* runOrgsSwitch({ orgId: Option.none(), limit: 50 });

      expect(prompts.map(options => options.map(option => option.hint))).toEqual([
        ['org_first', 'org_current', 'org_third'],
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] one org [Then] it is stored without prompting', () => {
    const { layer, orgUpdates, prompts } = orgsSwitchTest({
      organizations: [{ id: 'org_only', name: 'Only Org' }],
    });
    return Effect.gen(function* () {
      yield* runOrgsSwitch({ orgId: Option.none(), limit: 50 });

      expect(prompts).toEqual([]);
      expect(orgUpdates).toEqual(['org_only']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] no orgs [Then] stores nothing, links nothing, and outputs nothing', () => {
    const { layer, outputs, orgUpdates } = orgsSwitchTest({ organizations: [] });
    return Effect.gen(function* () {
      yield* runOrgsSwitch({ orgId: Option.none(), limit: 50 });

      expect(orgUpdates).toEqual([]);
      expect(analytics.linked).toEqual([]);
      expect(outputs).toEqual([]);
      expect(yield* MockConsole.getLines()).toContain(`-- ${NO_ORG_SELECTED_OUTRO} --`);
    }).pipe(Effect.provide(layer));
  });

  it.effect.each([
    { limit: 50, expected: 50 },
    { limit: 0, expected: 1 },
    { limit: -3, expected: 1 },
    { limit: 1001, expected: 1000 },
  ])('[Given] limit $limit [Then] requests $expected organizations', ({ limit, expected }) => {
    const { layer, requests } = orgsSwitchTest();
    return Effect.gen(function* () {
      yield* runOrgsSwitch({ orgId: Option.none(), limit });

      expect(orgListLimits(requests)).toEqual([expected]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] no stored API key [Then] fails with NotLoggedInError before any request',
    () => {
      const { layer, orgUpdates, requests } = orgsSwitchTest({ apiKey: Option.none() });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(runOrgsSwitch({ orgId: Option.none(), limit: 50 }));

        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
        expect(requests).toEqual([]);
        expect(orgUpdates).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );
});
