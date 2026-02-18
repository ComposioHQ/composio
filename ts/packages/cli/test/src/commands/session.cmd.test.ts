import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';

describe('CLI: composio session', () => {
  layer(TestLive())(it => {
    it.scoped('creates a toolkit auth link for a session', () =>
      Effect.gen(function* () {
        yield* cli(['session', 'link', '--session_id', 'trs_abc123', '--toolkit', 'gmail']);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');

        expect(output).toContain('Auth link created successfully');
        expect(output).toContain('Session Id: trs_abc123');
        expect(output).toContain('Toolkit: gmail');
        expect(output).toContain('Connected Account Id: ca_gmail');
        expect(output).toContain('Redirect URL: https://app.composio.dev/link/trs_abc123/gmail');
        expect(output).toContain('Link Token: lt_trs_abc123_gmail');
      })
    );

    it.scoped('shows detailed help for session link command', () =>
      Effect.gen(function* () {
        yield* cli(['session', 'link', '--help']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');

        expect(output).toContain('Create an authentication link for a toolkit');
        expect(output).toContain('Tool Router session id');
        expect(output).toContain('Toolkit slug for which an auth link should be created');
        expect(output).toContain('Optional callback URL');
      })
    );
  });
});
