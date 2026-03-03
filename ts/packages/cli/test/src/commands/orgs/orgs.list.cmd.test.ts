import { Effect } from 'effect';
import { describe, expect, layer } from '@effect/vitest';
import { afterEach, vi } from 'vitest';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const mockFetchResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('CLI: composio orgs list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  layer(TestLive({ fixture: 'user-config-with-global-context' }))(it => {
    it.scoped('[Then] lists orgs, marks selected global org, and shows switch hint', () =>
      Effect.gen(function* () {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          mockFetchResponse({
            organizations: [
              { id: 'org_1', name: 'Org One' },
              { id: 'org_2', name: 'Org Two' },
            ],
          })
        );

        yield* cli(['orgs', 'list']);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [orgUrl, orgRequest] = fetchSpy.mock.calls[0]!;
        expect(orgUrl).toContain('/api/v3/org/list?limit=50');
        expect((orgRequest as RequestInit).headers).toMatchObject({
          'x-user-api-key': 'uak_test_key',
        });

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Loaded 2 orgs');
        expect(output).toContain('✓ Org One (org_1)');
        expect(output).toContain('  Org Two (org_2)');
        expect(output).toContain(
          'Hint: run `composio orgs switch` to switch the default global org/project.'
        );
      })
    );
  });
});
