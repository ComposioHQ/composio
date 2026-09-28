import { Effect } from 'effect';
import { describe, expect, layer } from '@effect/vitest';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { makeOrgProject } from 'test/__utils__/models/account';
import type { MockAccountRequest } from 'test/__utils__/services/test-layer';

describe('CLI: composio dev projects list', () => {
  const requests: MockAccountRequest[] = [];

  layer(
    TestLive({
      fixture: 'user-config-with-global-context',
      accountData: {
        projects: [
          makeOrgProject({ id: 'project_1', name: 'Project One', orgId: 'org_1' }),
          makeOrgProject({ id: 'project_2', name: 'Project Two', orgId: 'org_1' }),
        ],
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

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Loaded 2 projects');
        expect(output).toContain('  Project One (project_1)');
        expect(output).toContain('  Project Two (project_2)');
        expect(output).toContain(
          'Hint: run `composio dev init` in a directory to bind it to a developer project.'
        );
        expect(output).toContain('Run `composio orgs switch` to change your current org.');
      })
    );
  });
});
