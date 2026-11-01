import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import { runAuthConfigsList } from 'src/commands/auth-configs/list/auth-configs.list.handler';
import { redact } from 'src/ui/redact';
import { MockConsole } from 'test/__utils__';
import { AuthConfigsHandlerTest } from 'test/__utils__/layers/auth-configs';
import { makeAuthConfigItem } from 'test/__utils__/models/auth-configs';

const gmail = makeAuthConfigItem();
const slack = makeAuthConfigItem({
  id: 'ac_slack_custom',
  name: 'Slack Custom',
  toolkit: { logo: '', slug: 'slack' },
  auth_scheme: 'API_KEY',
  type: 'custom',
  is_composio_managed: false,
});

const params = {
  toolkits: Option.none<string>(),
  query: Option.none<string>(),
  limit: 30,
};

describe('runAuthConfigsList', () => {
  it.effect('[Given] auth configs [Then] prints their summary JSON to stdout', () => {
    const { layer, outputs } = AuthConfigsHandlerTest({
      authConfigsData: { items: [gmail, slack] },
    });
    return Effect.gen(function* () {
      yield* runAuthConfigsList(params);

      expect(outputs.map(data => JSON.parse(data))).toEqual([
        [
          {
            id: 'ac_gmail_default',
            name: 'Gmail Default',
            toolkit_slug: 'gmail',
            auth_scheme: 'OAUTH2',
            type: 'default',
            status: 'ENABLED',
            no_of_connections: 5,
            is_composio_managed: true,
          },
          {
            id: 'ac_slack_custom',
            name: 'Slack Custom',
            toolkit_slug: 'slack',
            auth_scheme: 'API_KEY',
            type: 'custom',
            status: 'ENABLED',
            no_of_connections: 5,
            is_composio_managed: false,
          },
        ],
      ]);
      const decoration = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
      expect(decoration).toContain('Listing 2 of 2 auth configs');
      expect(decoration).toContain(
        `To view details of an auth config:\n> composio dev auth-configs info "${redact({ value: 'ac_gmail_default', prefix: 'ac_' })}"`
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] a limit above 1000 [Then] asks the API for at most 1000', () => {
    const limits: Array<number | undefined> = [];
    const { layer } = AuthConfigsHandlerTest({
      repository: {
        listAuthConfigs: params =>
          Effect.sync(() => {
            limits.push(params.limit);
            return {
              items: [],
              total_items: 0,
              total_pages: 0,
              current_page: 1,
              next_cursor: null,
            };
          }),
      },
    });
    return Effect.gen(function* () {
      yield* runAuthConfigsList({ ...params, limit: 5000 });

      expect(limits).toEqual([1000]);
    }).pipe(Effect.provide(layer));
  });

  it.effect.each([
    {
      name: 'no toolkit filter',
      toolkits: Option.none<string>(),
      warning: 'No auth configs found. Try broadening your search.',
    },
    {
      name: 'a toolkit filter',
      toolkits: Option.some('notion'),
      warning:
        'No auth configs found for toolkit "notion". Verify the toolkit slug with:\n> composio dev toolkits list',
    },
  ])(
    '[Given] no matches and $name [Then] warns and prints nothing to stdout',
    ({ toolkits, warning }) => {
      const { layer, outputs } = AuthConfigsHandlerTest({
        authConfigsData: { items: [gmail] },
      });
      return Effect.gen(function* () {
        yield* runAuthConfigsList({ ...params, toolkits, query: Option.some('nothing-matches') });

        expect(yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true })).toEqual([
          warning,
        ]);
        expect(outputs).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );
});
