import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';

describe('CLI: composio session', () => {
  layer(TestLive())(it => {
    it.scoped('creates a toolkit auth link for a session', () =>
      Effect.gen(function* () {
        yield* cli([
          'session',
          'link',
          '--user_id',
          'user_123',
          '--toolkit',
          'gmail',
          'trs_abc123',
        ]);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');

        expect(output).toContain('Auth link created successfully');
        expect(output).toContain('Session Id: trs_abc123');
        expect(output).toContain('User Id: user_123');
        expect(output).toContain('Toolkit: gmail');
        expect(output).toContain('Connected Account Id: ca_gmail');
        expect(output).toContain('Redirect URL: https://app.composio.dev/link/trs_abc123/gmail');
        expect(output).toContain('Link Token: lt_trs_abc123_gmail');
      })
    );

    it.scoped('prints session link output in json mode', () =>
      Effect.gen(function* () {
        yield* cli([
          'session',
          'link',
          '--user_id',
          'user_789',
          '--toolkit',
          'slack',
          '--json',
          'trs_json_1',
        ]);
        const lines = yield* MockConsole.getLines();
        const jsonLine = lines[lines.length - 1];
        const parsed = JSON.parse(jsonLine);

        expect(parsed).toEqual(
          expect.objectContaining({
            session_id: 'trs_json_1',
            user_id: 'user_789',
            toolkit: 'slack',
            connected_account_id: 'ca_slack',
            link_token: 'lt_trs_json_1_slack',
            redirect_url: 'https://app.composio.dev/link/trs_json_1/slack',
          })
        );
      })
    );

    it.scoped('lists toolkits for a session with filters in json mode', () =>
      Effect.gen(function* () {
        yield* cli([
          'session',
          'toolkits',
          '--toolkits',
          'gmail,slack',
          '--is_connected',
          'true',
          '--search',
          'mail',
          '--limit',
          '5',
          '--json',
          'trs_toolkits_1',
        ]);

        const lines = yield* MockConsole.getLines();
        const jsonLine = lines[lines.length - 1];
        const parsed = JSON.parse(jsonLine);

        expect(parsed.session_id).toBe('trs_toolkits_1');
        expect(Array.isArray(parsed.items)).toBe(true);
        expect(parsed.items.length).toBeLessThanOrEqual(5);
        if (parsed.items.length > 0) {
          expect(parsed.items[0]).toEqual(
            expect.objectContaining({
              slug: expect.any(String),
            })
          );
        }
      })
    );

    it.scoped('shows detailed help for session link command', () =>
      Effect.gen(function* () {
        yield* cli(['session', 'link', '--help']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');

        expect(output).toContain('Create an authentication link for a toolkit');
        expect(output).toContain('composio session link <session_id>');
        expect(output).toContain('Toolkit slug for which an auth link should be created');
        expect(output).toContain('User id used to create auth link context');
        expect(output).toContain('Optional callback URL');
        expect(output).toContain('machine-readable JSON output');
      })
    );

    it.scoped('shows detailed help for session toolkits command with all supported filters', () =>
      Effect.gen(function* () {
        yield* cli(['session', 'toolkits', '--help']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');

        expect(output).toContain('List toolkits in a Tool Router session');
        expect(output).toContain('--toolkits');
        expect(output).toContain('--limit');
        expect(output).toContain('--cursor');
        expect(output).toContain('--is_connected');
        expect(output).toContain('--search');
        expect(output).toContain('machine-readable JSON output');
      })
    );
  });
});
