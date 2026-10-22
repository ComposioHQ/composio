import { ConfigProvider, Effect } from 'effect';
import { describe, expect, layer } from '@effect/vitest';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { makeOrgProject } from 'test/__utils__/models/account';
import type { MockAccountRequest } from 'test/__utils__/services/test-layer';

// The fixture stores a login whose current org is `org_1`.
const LOGGED_IN_FIXTURE = 'user-config-with-global-context';

const PROJECTS = [
  makeOrgProject({ id: 'project_1', name: 'Project One', orgId: 'org_1' }),
  makeOrgProject({ id: 'project_2', name: 'Project Two', orgId: 'org_1' }),
];

describe('CLI: composio dev projects list', () => {
  layer(TestLive())('[Given] no API key', it => {
    it.effect('[Then] fails with NotLoggedInError', () =>
      Effect.gen(function* () {
        const error = yield* cli(['dev', 'projects', 'list']).pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });

  const requests: MockAccountRequest[] = [];

  layer(
    TestLive({
      fixture: LOGGED_IN_FIXTURE,
      accountData: {
        projects: PROJECTS,
        onRequest: request => requests.push(request),
      },
    })
  )(it => {
    it.effect('[Then] lists developer projects and shows init guidance', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'projects', 'list', '--org-id', 'org_1']);

        expect(requests).toEqual([
          expect.objectContaining({
            operation: 'org.project.list',
            params: { limit: 50 },
            scope: expect.objectContaining({ userApiKey: 'uak_test_key', orgId: 'org_1' }),
          }),
        ]);
        expect(requests[0]?.scope.projectId).toBeUndefined();

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        expect(output).toContain('Loaded 2 projects');
        expect(output).toContain('Project One (project_1)');
        expect(output).toContain('Project Two (project_2)');
        expect(JSON.parse(String(lines.at(-1)))).toEqual([
          { id: 'project_1', name: 'Project One', is_selected_global_project: false },
          { id: 'project_2', name: 'Project Two', is_selected_global_project: false },
        ]);
        expect(output).toContain(
          'Hint: run `composio dev init` in a directory to bind it to a developer project.'
        );
        expect(output).toContain('Run `composio orgs switch` to change your current org.');
      })
    );
  });

  const currentOrgRequests: MockAccountRequest[] = [];

  layer(
    TestLive({
      fixture: LOGGED_IN_FIXTURE,
      accountData: {
        projects: PROJECTS,
        onRequest: request => currentOrgRequests.push(request),
      },
    })
  )('[Given] no --org-id', it => {
    it.effect(
      '[Then] lists the projects of the current org, data on stdout and decoration on stderr',
      () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'projects', 'list', '--limit', '5000']);

          expect(currentOrgRequests).toEqual([
            expect.objectContaining({
              operation: 'org.project.list',
              params: { limit: 1000 },
              scope: expect.objectContaining({ orgId: 'org_1' }),
            }),
          ]);

          const stdout = yield* MockConsole.getLines({ stream: 'stdout' });
          const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
          expect(stdout).toEqual([
            JSON.stringify([
              { id: 'project_1', name: 'Project One', is_selected_global_project: false },
              { id: 'project_2', name: 'Project Two', is_selected_global_project: false },
            ]),
          ]);
          expect(stderr).toEqual([
            '-- composio dev projects list --',
            'Loaded 2 projects',
            '  Project One (project_1)\n  Project Two (project_2)',
            '-- Hint: run `composio dev init` in a directory to bind it to a developer project.\nRun `composio orgs switch` to change your current org. --',
          ]);
        })
    );
  });

  const noOrgRequests: MockAccountRequest[] = [];

  layer(
    TestLive({
      // Logged in through the environment, so no current org is stored.
      baseConfigProvider: ConfigProvider.fromEnvRecord({ COMPOSIO_USER_API_KEY: 'uak_no_org' }),
      accountData: { projects: PROJECTS, onRequest: request => noOrgRequests.push(request) },
    })
  )('[Given] no --org-id and no current org', it => {
    it.effect(
      '[Then] fails with a usage error naming the `orgs switch` hint and sends no request',
      () =>
        Effect.gen(function* () {
          const failure = yield* cli(['dev', 'projects', 'list']).pipe(Effect.flip);

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            option: '--org-id',
            message:
              'No current org is configured.\nHint: run `composio orgs switch` first, or pass `--org-id`.',
          });
          const stdout = yield* MockConsole.getLines({ stream: 'stdout' });
          const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
          expect(noOrgRequests).toEqual([]);
          expect(stdout).toEqual([]);
          expect(stderr).toEqual(['-- composio dev projects list --']);
        })
    );
  });

  layer(TestLive({ fixture: LOGGED_IN_FIXTURE, accountData: { projects: [] } }))(
    '[Given] an org without projects',
    it => {
      it.effect('[Then] warns, points at `dev init`, and prints an empty list', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'projects', 'list']);

          const stdout = yield* MockConsole.getLines({ stream: 'stdout' });
          const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
          // Piped callers get the parseable empty result, not silence.
          expect(stdout).toEqual(['[]']);
          expect(stderr).toEqual([
            '-- composio dev projects list --',
            'Loaded 0 projects',
            'No projects found.',
            '-- Hint: run `composio dev init` in a directory to bind it to a developer project. --',
          ]);
        })
      );
    }
  );
});
