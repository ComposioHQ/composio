import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { TOOLS_TYPES_GMAIL } from 'test/__mocks__/tools-types-gmail';
import { TRIGGER_TYPES_GMAIL } from 'test/__mocks__/trigger-types-gmail';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

describe('CLI: composio connected_accounts', () => {
  const toolkitsData = {
    toolkits: makeTestToolkits([{ name: 'Gmail', slug: 'gmail' }]),
    tools: [...TOOLS_TYPES_GMAIL.slice(0, 2)],
    triggerTypes: [...TRIGGER_TYPES_GMAIL.slice(0, 1)],
    triggerTypesAsEnums: [...TRIGGER_TYPES_GMAIL.slice(0, 1).map(item => item.slug)],
  } satisfies TestLiveInput['toolkitsData'];

  const entitiesData = {
    connectedAccounts: [
      {
        id: 'ca_1',
        user_id: 'user_1',
        status: 'ACTIVE',
        toolkit: { slug: 'gmail' },
        auth_config: { id: 'ac_1' },
        state: { refreshable: true },
        test_request_endpoint: '/users/me',
      },
    ],
  } satisfies TestLiveInput['entitiesData'];

  layer(
    TestLive({
      toolkitsData,
      entitiesData,
    })
  )(it => {
    it.scoped('lists connected accounts', () =>
      Effect.gen(function* () {
        yield* cli(['connected_accounts', 'list', '--user_id', 'user_1', '--toolkits', 'gmail']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Found 1 connected accounts');
        expect(output).toContain('ca_1');
      })
    );

    it.scoped('shows connected account details', () =>
      Effect.gen(function* () {
        yield* cli(['connected_accounts', 'info', 'ca_1']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Id: ca_1');
        expect(output).toContain('Toolkit: gmail');
      })
    );

    it.scoped('runs whoami via proxy execute', () =>
      Effect.gen(function* () {
        yield* cli(['connected_accounts', 'whoami', 'ca_1']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('200 fetched details of the connected account');
        expect(output).toContain('"endpoint": "/users/me"');
      })
    );

    it.scoped('creates account link', () =>
      Effect.gen(function* () {
        yield* cli(['connected_accounts', 'link', '--auth_config', 'ac_1', '--user_id', 'user_42']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Created auth link successfully');
        expect(output).toContain('Connected Account Id: ca_link_1');
      })
    );

    it.scoped('deletes connected account', () =>
      Effect.gen(function* () {
        yield* cli(['connected_accounts', 'delete', 'ca_1']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Deleted connected account ca_1');
      })
    );
  });
});
