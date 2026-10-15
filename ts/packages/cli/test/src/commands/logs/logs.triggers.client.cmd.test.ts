import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { stubClientResources } from 'test/__utils__/services/stub-composio-client';

const testLayer = TestLive({
  baseConfigProvider: ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } }),
  fixture: 'global-test-user-id',
});

// The API has served trigger logs in snake_case with numeric timestamps and
// without `meta`; the response schema the client ships allows none of that.
const olderLog = {
  log_id: 'log_older_1',
  trigger_id: 'trigger_1',
  trigger_nano_id: 'ti_older_1',
  trigger_name: 'SLACK_NEW_MESSAGE',
  toolkit_key: 'slack',
  connection_id: 'conn_1',
  entity_id: 'user_1',
  status: 'success',
  created_at: 1767225600000,
};

describe('CLI: composio dev logs triggers over the API client', () => {
  layer(testLayer)('[Given] a page of trigger logs in an older response shape', it => {
    it.effect('[Then] the logs are listed and printed as the API returned them', () =>
      Effect.gen(function* () {
        const page = { data: [olderLog] };
        const stub = stubClientResources(['logs'], () => Response.json(page));
        yield* cli(['dev', 'logs', 'triggers']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines.join('\n')).toContain('ti_older_1');
        expect(lines.join('\n')).toContain('SLACK_NEW_MESSAGE');
        expect(lines.at(-1)).toBe(JSON.stringify(page, null, 2));
      })
    );
  });

  layer(testLayer)('[Given] one trigger log in an older response shape', it => {
    it.effect('[Then] its details are shown and it is printed as the API returned it', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(['logs'], () => Response.json(olderLog));
        yield* cli(['dev', 'logs', 'triggers', 'log_older_1']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines.join('\n')).toContain('SLACK_NEW_MESSAGE');
        expect(lines.at(-1)).toBe(JSON.stringify(olderLog, null, 2));
      })
    );
  });
});
