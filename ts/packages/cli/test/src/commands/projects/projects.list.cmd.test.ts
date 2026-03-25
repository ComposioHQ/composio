import { Effect } from 'effect';
import { describe, expect, layer } from '@effect/vitest';
import { afterEach, vi } from 'vitest';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const mockFetchResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('CLI: composio dev projects list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  layer(TestLive({ fixture: 'user-config-with-global-context' }))(it => {
    it.scoped('[Then] lists developer projects and shows init guidance', () =>
      Effect.gen(function* () {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          mockFetchResponse({
            data: [
              { id: 'project_1', name: 'Project One' },
              { id: 'project_2', name: 'Project Two' },
            ],
          })
        );

        yield* cli(['dev', 'projects', 'list', '--org-id', 'org_1']);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [projectUrl, projectRequest] = fetchSpy.mock.calls[0]!;
        expect(projectUrl).toContain('/api/v3/org/project/list?limit=50');
        expect((projectRequest as RequestInit).headers).toMatchObject({
          'x-user-api-key': 'uak_test_key',
          'x-org-id': 'org_1',
        });

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Loaded 2 projects');
        expect(output).toContain('  Project One (project_1)');
        expect(output).toContain('  Project Two (project_2)');
        expect(output).toContain(
          'Hint: run `composio dev init` in a directory to bind it to a developer project.'
        );
        expect(output).toContain('Run `composio dev orgs switch` to change your default org.');
      })
    );
  });
});
