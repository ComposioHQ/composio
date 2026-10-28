import { describe, expect, it } from '@effect/vitest';
import { Console, Effect, Layer, Option } from 'effect';
import { runProjectsList } from 'src/commands/projects/list/projects.list.handler';
import { isUsageFailure } from 'src/commands/errors';
import {
  NO_CURRENT_ORG_MESSAGE,
  NO_CURRENT_ORG_OUTRO,
  NO_PROJECTS_MESSAGE,
} from 'src/commands/projects/list/projects.list.format';
import type { OrgProject } from 'src/services/composio-account';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { MockConsole } from 'test/__utils__';
import type { MockAccountRequest, MockRequestScope } from 'test/__utils__/layers/accounts';
import { makeShadowClient } from 'test/__utils__/layers/shadow-client';
import { makeOrgProject } from 'test/__utils__/models/account';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

const PROJECTS: ReadonlyArray<OrgProject> = [
  makeOrgProject({ id: 'project_a', name: 'Project A', orgId: 'org_current' }),
  makeOrgProject({ id: 'project_b', name: 'Project B', orgId: 'org_current' }),
];

interface ProjectsListFixture {
  readonly apiKey?: Option.Option<string>;
  readonly orgId?: Option.Option<string>;
  readonly projects?: ReadonlyArray<OrgProject>;
}

/**
 * What `runProjectsList` reads: a user context, the account family of the mock client, and a
 * headless terminal whose stdout data lands in `outputs` and whose `org.project.list` requests
 * land in `requests`.
 */
const projectsListTest = (fixture: ProjectsListFixture = {}) => {
  const outputs: Array<string> = [];
  const requests: Array<MockAccountRequest> = [];
  const apiKey = fixture.apiKey ?? Option.some('uak_projects_list');
  const accountData = {
    projects: fixture.projects ?? PROJECTS,
    onRequest: (request: MockAccountRequest) => {
      requests.push(request);
    },
  };

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
          orgId: fixture.orgId ?? Option.some('org_current'),
          projectId: Option.none(),
          testUserId: Option.none(),
        },
        backendMismatch: Option.none(),
        isLoggedIn: () => Option.isSome(apiKey),
        logout: Effect.void,
        login: () => Effect.void,
        update: () => Effect.void,
      })
    ),
    Layer.succeed(
      ComposioClientSingleton,
      ComposioClientSingleton.of({
        get: () => Effect.succeed(makeShadowClient(accountData, {})),
        getFor: (scope: MockRequestScope) => Effect.succeed(makeShadowClient(accountData, scope)),
        getMetrics: () => Effect.succeed({ byteSize: 0, requests: 0 }),
      })
    )
  );
  return { layer, outputs, requests };
};

describe('runProjectsList', () => {
  it.effect('[Given] no --org-id [Then] lists the projects of the current org', () => {
    const { layer, outputs, requests } = projectsListTest();
    return Effect.gen(function* () {
      yield* runProjectsList({ orgId: Option.none(), limit: 50 });

      expect(requests.map(request => request.scope.orgId)).toEqual(['org_current']);
      expect(outputs.map(output => JSON.parse(output))).toEqual([
        [
          { id: 'project_a', name: 'Project A', is_selected_global_project: false },
          { id: 'project_b', name: 'Project B', is_selected_global_project: false },
        ],
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] --org-id [Then] it wins over the current org', () => {
    const { layer, requests } = projectsListTest();
    return Effect.gen(function* () {
      yield* runProjectsList({ orgId: Option.some('org_explicit'), limit: 50 });

      expect(requests.map(request => request.scope.orgId)).toEqual(['org_explicit']);
    }).pipe(Effect.provide(layer));
  });

  it.effect.each([
    { orgId: Option.none<string>(), current: Option.none<string>(), label: 'no org at all' },
    { orgId: Option.some(''), current: Option.some('org_current'), label: 'an empty --org-id' },
    { orgId: Option.none<string>(), current: Option.some(''), label: 'an empty current org' },
  ])('[Given] $label [Then] fails with a usage error before any request', ({ orgId, current }) => {
    const { layer, outputs, requests } = projectsListTest({ orgId: current });
    return Effect.gen(function* () {
      const failure = yield* runProjectsList({ orgId, limit: 50 }).pipe(Effect.flip);

      expect(failure).toMatchObject({
        _tag: 'commands/CommandInputError',
        command: 'dev projects list',
        option: '--org-id',
        message: `${NO_CURRENT_ORG_MESSAGE}\n${NO_CURRENT_ORG_OUTRO}`,
      });
      // The invocation prints a usage failure on stderr and exits 1.
      expect(isUsageFailure(failure)).toBe(true);
      expect(requests).toEqual([]);
      expect(outputs).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect.each([
    { limit: 50, expected: 50 },
    { limit: 0, expected: 1 },
    { limit: -3, expected: 1 },
    { limit: 1001, expected: 1000 },
  ])('[Given] limit $limit [Then] requests $expected projects', ({ limit, expected }) => {
    const { layer, requests } = projectsListTest();
    return Effect.gen(function* () {
      yield* runProjectsList({ orgId: Option.none(), limit });

      expect(requests.map(request => request.params)).toEqual([{ limit: expected }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] no projects [Then] warns and prints an empty list', () => {
    const { layer, outputs } = projectsListTest({ projects: [] });
    return Effect.gen(function* () {
      yield* runProjectsList({ orgId: Option.none(), limit: 50 });

      // Piped callers get the parseable empty result, not silence.
      expect(outputs).toEqual(['[]']);
      expect(yield* MockConsole.getLines({ stream: 'stderr' })).toEqual([NO_PROJECTS_MESSAGE]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] no stored API key [Then] fails with NotLoggedInError before any request',
    () => {
      const { layer, requests } = projectsListTest({ apiKey: Option.none() });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(runProjectsList({ orgId: Option.none(), limit: 50 }));

        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
        expect(requests).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );
});
