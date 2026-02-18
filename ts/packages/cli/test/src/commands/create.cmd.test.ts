import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';

describe('CLI: composio create', () => {
  layer(TestLive())(it => {
    it.scoped('creates a tool router session with explicit options', () =>
      Effect.gen(function* () {
        yield* cli([
          'create',
          '--user_id',
          'user_123',
          '--toolkits',
          'gmail,slack',
          '--tools',
          'GMAIL_SEND_EMAIL,SLACK_SEND_MESSAGE',
          '--manage_connections',
          'false',
          '--auth_configs',
          'gmail<>ac_1,slack<>ac_2',
          '--connected_accounts',
          'gmail<>ca_1,slack<>ca_2',
        ]);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');

        expect(output).toContain('Session created successfully');
        expect(output).toContain('id: trs_test_1');
        expect(output).toContain('MCP: https://mcp.composio.dev/tool_router/user_123/trs_test_1');
        expect(output).toContain(
          'Use `x-api-key` header with your project API key to use this session'
        );
      })
    );

    it.scoped('uses COMPOSIO_TEST_USER_ID when --user_id is omitted', () =>
      Effect.gen(function* () {
        const original = process.env['COMPOSIO_TEST_USER_ID'];
        process.env['COMPOSIO_TEST_USER_ID'] = 'env_user_42';

        try {
          yield* cli(['create', '--toolkits', 'gmail', '--tools', 'GMAIL_FETCH_EMAILS']);
          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('Session created successfully');
          expect(output).toContain(
            'MCP: https://mcp.composio.dev/tool_router/env_user_42/trs_test_1'
          );
        } finally {
          if (original === undefined) {
            delete process.env['COMPOSIO_TEST_USER_ID'];
          } else {
            process.env['COMPOSIO_TEST_USER_ID'] = original;
          }
        }
      })
    );

    it.scoped('fails with actionable error on invalid auth_configs format', () =>
      Effect.gen(function* () {
        const result = yield* cli([
          'create',
          '--user_id',
          'user_1',
          '--auth_configs',
          'gmail:ac_1',
        ]).pipe(Effect.catchAll(error => Effect.succeed(error)));

        expect(String(result)).toContain('Expected format: toolkit<>id');
      })
    );

    it.scoped('shows detailed help for create options and formats', () =>
      Effect.gen(function* () {
        yield* cli(['create', '--help']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');

        expect(output).toContain('Create a Tool Router session');
        expect(output).toContain('COMPOSIO_TEST_USER_ID');
        expect(output).toContain('toolkit<>auth_config_id');
        expect(output).toContain('toolkit<>connected_account_id');
        expect(output).toContain('Accepted values: true, false, 1, 0');
      })
    );
  });
});
