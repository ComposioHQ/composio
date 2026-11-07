import { Auth, make, type ComposioClientShape } from '@composio/client/effect';
import { describe, expect, it } from '@effect/vitest';
import { Console, Effect, Layer, Option } from 'effect';
import { HttpClient } from 'effect/http';
import {
  runConnectedAccountsList,
  type ConnectedAccountsListParams,
} from 'src/commands/connected-accounts/list/connected-accounts.list.handler';
import { viewDetailsHint } from 'src/commands/connected-accounts/list/connected-accounts.list.format';
import { CommandSurface } from 'src/commands/surface';
import { CONNECTED_ACCOUNTS_SHAPE_MESSAGE } from 'src/effects/decode-connected-account-list';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import type { ProjectKeys } from 'src/models/project-keys';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { ProjectContext } from 'src/services/project-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { MockConsole } from 'test/__utils__';
import { mockAccountResources, type MockRequestScope } from 'test/__utils__/layers/accounts';
import {
  mockConnectedAccountResources,
  resolveConnectedAccountsTestData,
} from 'test/__utils__/layers/connected-accounts';
import { makeOrgProject } from 'test/__utils__/models/account';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

const account = (overrides: Partial<ConnectedAccountItem> = {}): ConnectedAccountItem => ({
  id: 'con_gmail_active',
  alias: null,
  word_id: null,
  status: 'ACTIVE',
  status_reason: null,
  is_disabled: false,
  user_id: 'default',
  toolkit: { slug: 'gmail' },
  auth_config: {
    id: 'ac_gmail_oauth',
    auth_scheme: 'OAUTH2',
    is_composio_managed: true,
    is_disabled: false,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
  test_request_endpoint: '',
  ...overrides,
});

const ACCOUNTS: ReadonlyArray<ConnectedAccountItem> = [
  account(),
  account({ id: 'con_slack_active', user_id: 'user-123', toolkit: { slug: 'slack' } }),
];

const DIRECTORY_PROJECT: ProjectKeys = {
  orgId: 'org_test',
  projectId: 'proj_directory',
  projectName: Option.some('directory'),
  orgName: Option.none(),
  email: Option.none(),
  testUserId: Option.none(),
};

const NAMED_PROJECT = makeOrgProject({ id: 'proj_named', name: 'named', orgId: 'org_test' });

// A resource the mocks below do not shadow reaches this transport and dies with its URL.
const baseClient = make(
  { auth: Auth.project('test'), baseURL: 'https://mock.invalid' },
  HttpClient.make(request =>
    Effect.die(
      new Error(`unexpected network call from the connected-accounts list test: ${request.url}`)
    )
  )
);

/** One `connectedAccounts.list` call, with the scope of the client it went through. */
interface ListRequest {
  readonly scope: MockRequestScope;
  readonly params: unknown;
}

interface ListFixture {
  readonly accounts?: ReadonlyArray<ConnectedAccountItem>;
  readonly userId?: Option.Option<string>;
  readonly projectName?: Option.Option<string>;
  /** Served raw by `connectedAccounts.list`, bypassing the well-formed mock. */
  readonly rawListResponse?: unknown;
}

/**
 * What `runConnectedAccountsList` reads: the `dev` surface, a user with an org, a directory
 * project, the account and connected-account families of the mock client, and a headless
 * terminal whose stdout data lands in `outputs`. `requests` records every list call.
 */
const listTest = (fixture: ListFixture = {}) => {
  const outputs: Array<string> = [];
  const requests: Array<ListRequest> = [];
  const resources = mockConnectedAccountResources(
    resolveConnectedAccountsTestData({ items: [...(fixture.accounts ?? ACCOUNTS)] })
  );
  const clientFor = (scope: MockRequestScope): ComposioClientShape =>
    // The shadows answer only the fields the handler reads, as in `test-layer.ts`.
    ({
      ...baseClient,
      ...mockAccountResources({ projects: [NAMED_PROJECT] }, scope),
      connectedAccounts: {
        ...resources.connectedAccounts,
        list: (params: Parameters<typeof resources.connectedAccounts.list>[0]) =>
          fixture.rawListResponse !== undefined
            ? // Record the scope, then serve the raw payload as-is.
              Effect.sync(() => requests.push({ scope, params })).pipe(
                Effect.as(fixture.rawListResponse)
              )
            : Effect.sync(() => requests.push({ scope, params })).pipe(
                Effect.andThen(resources.connectedAccounts.list(params))
              ),
      },
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
    CommandSurface.dev({
      userId: fixture.userId ?? Option.none(),
      projectName: fixture.projectName ?? Option.none(),
    }),
    Layer.succeed(
      ComposioUserContext,
      ComposioUserContext.of({
        data: {
          apiKey: Option.some('uak_test'),
          baseURL: 'https://mock.invalid',
          webURL: 'https://platform.mock.invalid',
          orgId: Option.some('org_test'),
          projectId: Option.none(),
          testUserId: Option.none(),
        },
        backendMismatch: Option.none(),
        isLoggedIn: () => true,
        logout: Effect.void,
        login: () => Effect.void,
        update: () => Effect.void,
      })
    ),
    Layer.succeed(
      ProjectContext,
      ProjectContext.of({ resolve: Effect.succeed(Option.some(DIRECTORY_PROJECT)) })
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
  return { layer, outputs, requests };
};

const params = (
  overrides: Partial<ConnectedAccountsListParams> = {}
): ConnectedAccountsListParams => ({
  toolkits: Option.none(),
  status: Option.none(),
  limit: 30,
  ...overrides,
});

const stderrLines = MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
const allLines = MockConsole.getLines({ stripAnsi: true });

describe('runConnectedAccountsList', () => {
  it.effect('[Given] no filters [Then] lists the directory project without filters', () => {
    const { layer, requests } = listTest();
    return Effect.gen(function* () {
      yield* runConnectedAccountsList(params());

      expect(requests).toEqual([
        {
          scope: { orgId: 'org_test', projectId: 'proj_directory' },
          params: { toolkit_slugs: undefined, user_ids: undefined, statuses: undefined, limit: 30 },
        },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] --toolkits, --status and the shared --user-id [Then] sends each as a filter',
    () => {
      const { layer, requests } = listTest({ userId: Option.some('default') });
      return Effect.gen(function* () {
        yield* runConnectedAccountsList(
          params({ toolkits: Option.some('gmail, slack'), status: Option.some('ACTIVE') })
        );

        expect(requests.map(request => request.params)).toEqual([
          {
            toolkit_slugs: ['gmail', 'slack'],
            user_ids: ['default'],
            statuses: ['ACTIVE'],
            limit: 30,
          },
        ]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect.each([
    { limit: 0, expected: 1 },
    { limit: 1001, expected: 1000 },
  ])('[Given] --limit $limit [Then] requests $expected accounts', ({ limit, expected }) => {
    const { layer, requests } = listTest();
    return Effect.gen(function* () {
      yield* runConnectedAccountsList(params({ limit }));

      expect(requests.map(request => request.params)).toMatchObject([{ limit: expected }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] the shared --project-name [Then] lists that developer project', () => {
    const { layer, requests } = listTest({ projectName: Option.some('named') });
    return Effect.gen(function* () {
      yield* runConnectedAccountsList(params());

      expect(requests.map(request => request.scope)).toEqual([
        { orgId: 'org_test', projectId: 'proj_named' },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] accounts [Then] prints them as JSON on stdout and hints at `info`', () => {
    const { layer, outputs } = listTest();
    return Effect.gen(function* () {
      yield* runConnectedAccountsList(params());

      expect(outputs.map(output => JSON.parse(output))).toEqual([
        [
          {
            id: 'con_gmail_active',
            alias: null,
            word_id: null,
            user_id: 'default',
            toolkit_slug: 'gmail',
            auth_config_id: 'ac_gmail_oauth',
            auth_scheme: 'OAUTH2',
            status: 'ACTIVE',
            created_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'con_slack_active',
            alias: null,
            word_id: null,
            user_id: 'user-123',
            toolkit_slug: 'slack',
            auth_config_id: 'ac_gmail_oauth',
            auth_scheme: 'OAUTH2',
            status: 'ACTIVE',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      ]);
      const lines = yield* allLines;
      expect(lines.some(line => line.startsWith('Listing 2 of 2 connected accounts'))).toBe(true);
      expect(lines).toContain(viewDetailsHint('con_gmail_active'));
    }).pipe(Effect.provide(layer));
  });

  it.effect.each([
    {
      given: 'every filter',
      fixture: { userId: Option.some('nobody') },
      flags: { toolkits: Option.some('notion'), status: Option.some('REVOKED' as const) },
      expected:
        'No connected accounts found for toolkit "notion". Verify the toolkit slug with:\n> composio dev toolkits list',
    },
    {
      given: '--user-id and --status',
      fixture: { userId: Option.some('nobody') },
      flags: { status: Option.some('REVOKED' as const) },
      expected: 'No connected accounts found for user "nobody".',
    },
    {
      given: '--status',
      fixture: {},
      flags: { status: Option.some('REVOKED' as const) },
      expected: 'No connected accounts found with status "REVOKED".',
    },
    { given: 'no filter', fixture: {}, flags: {}, expected: 'No connected accounts found.' },
  ])(
    '[Given] an empty page and $given [Then] warns about the first filter and prints no data',
    ({ fixture, flags, expected }) => {
      const { layer, outputs } = listTest({ ...fixture, accounts: [] });
      return Effect.gen(function* () {
        yield* runConnectedAccountsList(params(flags));

        expect(yield* stderrLines).toEqual([expected]);
        expect(outputs).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] a response whose items are not an array [Then] fails instead of listing zero',
    () => {
      const { layer, outputs } = listTest({
        rawListResponse: { items: { pages: 2 }, total_items: 3 },
      });
      return Effect.gen(function* () {
        const error = yield* runConnectedAccountsList(params()).pipe(Effect.flip);

        expect(error).toMatchObject({
          _tag: 'commands/ConnectedAccountsListRequestError',
          message: CONNECTED_ACCOUNTS_SHAPE_MESSAGE,
          cause: {
            _tag: 'effects/ConnectedAccountListShapeError',
            message: expect.stringContaining('items'),
          },
        });
        expect(outputs).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );
});
