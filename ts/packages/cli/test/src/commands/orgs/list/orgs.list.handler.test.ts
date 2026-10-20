import { Auth, make, type ComposioClientShape } from '@composio/client/effect';
import { describe, expect, it } from '@effect/vitest';
import { Console, Effect, Layer, Option } from 'effect';
import { HttpClient } from 'effect/http';
import { runOrgsList } from 'src/commands/orgs/list/orgs.list.handler';
import { NO_ORGANIZATIONS_MESSAGE } from 'src/commands/orgs/list/orgs.list.format';
import type { OrganizationSummary } from 'src/services/composio-account';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { MockConsole } from 'test/__utils__';
import { mockAccountResources, type MockRequestScope } from 'test/__utils__/layers/accounts';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

const ORGANIZATIONS: ReadonlyArray<OrganizationSummary> = [
  { id: 'org_first', name: 'First Org' },
  { id: 'org_second', name: 'Second Org' },
];

// A resource the account mocks do not shadow reaches this transport and dies with its URL.
const baseClient = make(
  { auth: Auth.project('test'), baseURL: 'https://mock.invalid' },
  HttpClient.make(request =>
    Effect.die(new Error(`unexpected network call from the orgs list handler test: ${request.url}`))
  )
);

interface OrgsListFixture {
  readonly apiKey?: Option.Option<string>;
  readonly orgId?: Option.Option<string>;
  readonly organizations?: ReadonlyArray<OrganizationSummary>;
}

/**
 * What `runOrgsList` reads: a user context, the account family of the mock client, and a
 * headless terminal whose stdout data lands in `outputs` and whose `org.list` limits land in
 * `limits`.
 */
const orgsListTest = (fixture: OrgsListFixture = {}) => {
  const outputs: Array<string> = [];
  const limits: Array<unknown> = [];
  const apiKey = fixture.apiKey ?? Option.some('uak_orgs_list');
  const accountData = {
    organizations: fixture.organizations ?? ORGANIZATIONS,
    onRequest: (request: { readonly params?: unknown }) => {
      limits.push((request.params as { readonly limit?: number } | undefined)?.limit);
    },
  };
  const clientFor = (scope: MockRequestScope): ComposioClientShape =>
    // The shadows answer only the fields the handler reads, as in `test-layer.ts`.
    ({
      ...baseClient,
      ...mockAccountResources(accountData, scope),
    }) as unknown as ComposioClientShape;

  const layer = Layer.mergeAll(
    Layer.effect(Console.Console, MockConsole.make),
    Layer.succeed(
      TerminalUI,
      TerminalUI.of({
        ...terminalUITestImpl,
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
          testUserId: Option.none(),
        },
        isLoggedIn: () => Option.isSome(apiKey),
        logout: Effect.void,
        login: () => Effect.void,
        update: () => Effect.void,
      })
    ),
    Layer.succeed(
      ComposioClientSingleton,
      ComposioClientSingleton.of({
        get: () => Effect.succeed(clientFor({})),
        getFor: (scope: MockRequestScope) => Effect.succeed(clientFor(scope)),
        getMetrics: () => Effect.succeed({ byteSize: 0, requests: 0 }),
      })
    )
  );
  return { layer, outputs, limits };
};

describe('runOrgsList', () => {
  it.effect('[Given] a current org [Then] flags only that org as selected', () => {
    const { layer, outputs } = orgsListTest({ orgId: Option.some('org_second') });
    return Effect.gen(function* () {
      yield* runOrgsList({ limit: 50 });

      expect(outputs.map(output => JSON.parse(output))).toEqual([
        [
          { id: 'org_first', name: 'First Org', is_selected_global_org: false },
          { id: 'org_second', name: 'Second Org', is_selected_global_org: true },
        ],
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] no current org [Then] flags no org as selected', () => {
    const { layer, outputs } = orgsListTest();
    return Effect.gen(function* () {
      yield* runOrgsList({ limit: 50 });

      expect(JSON.parse(outputs[0] ?? '[]')).toEqual([
        { id: 'org_first', name: 'First Org', is_selected_global_org: false },
        { id: 'org_second', name: 'Second Org', is_selected_global_org: false },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect.each([
    { limit: 50, expected: 50 },
    { limit: 0, expected: 1 },
    { limit: -3, expected: 1 },
    { limit: 1001, expected: 1000 },
  ])('[Given] limit $limit [Then] requests $expected organizations', ({ limit, expected }) => {
    const { layer, limits } = orgsListTest();
    return Effect.gen(function* () {
      yield* runOrgsList({ limit });

      expect(limits).toEqual([expected]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] no organizations [Then] warns and outputs nothing', () => {
    const { layer, outputs } = orgsListTest({ organizations: [] });
    return Effect.gen(function* () {
      yield* runOrgsList({ limit: 50 });

      expect(outputs).toEqual([]);
      expect(yield* MockConsole.getLines({ stream: 'stderr' })).toEqual([NO_ORGANIZATIONS_MESSAGE]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] no stored API key [Then] fails with NotLoggedInError before any request',
    () => {
      const { layer, limits } = orgsListTest({ apiKey: Option.none() });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(runOrgsList({ limit: 50 }));

        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
        expect(limits).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );
});
