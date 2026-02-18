import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { TOOLS_TYPES_GMAIL } from 'test/__mocks__/tools-types-gmail';
import { TRIGGER_TYPES_GMAIL } from 'test/__mocks__/trigger-types-gmail';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

describe('CLI: composio auth_configs', () => {
  const toolkitsData = {
    toolkits: makeTestToolkits([{ name: 'Gmail', slug: 'gmail' }]),
    tools: [...TOOLS_TYPES_GMAIL.slice(0, 2)],
    triggerTypes: [...TRIGGER_TYPES_GMAIL.slice(0, 1)],
    triggerTypesAsEnums: [...TRIGGER_TYPES_GMAIL.slice(0, 1).map(item => item.slug)],
  } satisfies TestLiveInput['toolkitsData'];

  const entitiesData = {
    authConfigs: [
      {
        id: 'ac_1',
        name: 'gmail-auth',
        auth_scheme: 'OAUTH2',
        no_of_connections: 2,
        status: 'ENABLED',
        toolkit: { slug: 'gmail' },
        credentials: { scopes: ['email.readonly'] },
      },
    ],
  } satisfies TestLiveInput['entitiesData'];

  layer(
    TestLive({
      toolkitsData,
      entitiesData,
    })
  )(it => {
    it.scoped('lists auth configs', () =>
      Effect.gen(function* () {
        yield* cli(['auth_configs', 'list', '--toolkits', 'gmail']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Found 1 auth configs');
        expect(output).toContain('gmail-auth');
      })
    );

    it.scoped('shows auth config details', () =>
      Effect.gen(function* () {
        yield* cli(['auth_configs', 'info', 'ac_1']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Id: ac_1');
        expect(output).toContain('Auth Scheme: OAUTH2');
      })
    );

    it.scoped('creates managed auth config', () =>
      Effect.gen(function* () {
        yield* cli(['auth_configs', 'create', '--toolkit', 'gmail', 'gmail-managed']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Auth config created successfully');
        expect(output).toContain('"id": "ac_created_1"');
      })
    );

    it.scoped('deletes auth config', () =>
      Effect.gen(function* () {
        yield* cli(['auth_configs', 'delete', 'ac_1']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Deleted auth config ac_1');
      })
    );
  });
});
