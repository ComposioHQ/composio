import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach, vi } from 'vitest';
import { writeStoredAgentIdentity } from 'src/services/agents';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { agentsJsonResponse, makeAgentIdentity } from 'test/__utils__/models/agent';
import { exitCodeOf } from 'test/__utils__/exit-code';

describe('CLI: composio agent claim', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  layer(TestLive())(it => {
    it.effect('[Given] an email [Then] invites it and prints the invite as JSON', () =>
      Effect.gen(function* () {
        yield* writeStoredAgentIdentity(makeAgentIdentity());
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () => agentsJsonResponse({ status: 'invited' }));

        yield* cli(['agent', 'claim', 'boss@example.com']);

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          expect.stringContaining('/api/claim'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ email: 'boss@example.com' }),
          })
        );
        const stdout = yield* MockConsole.getLines({ stream: 'stdout', stripAnsi: true });
        expect(stdout.at(-1)).toBe(
          JSON.stringify({
            status: 'invited',
            email: 'boss@example.com',
            org_id: null,
            invite_code: null,
          })
        );
      })
    );
  });

  layer(TestLive({ fixture: 'user-config-example' }))(it => {
    it.effect('[Given] the CLI is signed in as a human user [Then] shows a soft auth warning', () =>
      Effect.gen(function* () {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        const exit = yield* Effect.exit(cli(['agent', 'claim', 'boss@example.com']));
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('currently signed in to Composio as a regular user');
        expect(exitCodeOf(exit)).toBe(1);
        expect(fetchSpy).not.toHaveBeenCalled();
      })
    );
  });
});
