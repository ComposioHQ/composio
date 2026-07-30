import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { vi, afterEach } from 'vitest';
import { runOrgSelection } from 'src/effects/select-org-project';
import { TestLive, MockConsole } from 'test/__utils__';

const orgListResponse = () =>
  new Response(
    JSON.stringify({
      items: [
        { id: 'org_1', name: 'Alpha' },
        { id: 'org_2', name: 'Beta' },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

describe('runOrgSelection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  layer(TestLive())('quiet mode (embedded login)', it => {
    it.scoped('[Given] quiet [Then] no org chatter is emitted', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(orgListResponse());
        // currentOrgId matches an org so the "Current org" assertion is not vacuous
        yield* runOrgSelection({
          apiKey: 'k',
          baseURL: 'https://api.test',
          currentOrgId: 'org_2',
          quiet: true,
        });
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).not.toContain('Loaded');
        expect(output).not.toContain('Selected organization');
        expect(output).not.toContain('Current org');
      })
    );
  });

  layer(TestLive())('default (standalone login)', it => {
    it.scoped('[Given] no quiet flag [Then] the usual org chatter is emitted', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(orgListResponse());
        yield* runOrgSelection({
          apiKey: 'k',
          baseURL: 'https://api.test',
          currentOrgId: 'org_2',
        });
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Loaded 2 orgs');
        expect(output).toContain('Current org: "Beta" (org_2)');
        expect(output).toContain('Selected organization');
      })
    );
  });
});
