import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach, vi } from 'vitest';
import { writeStoredAgentIdentity } from 'src/services/agents';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { agentsJsonResponse, makeAgentIdentity } from 'test/__utils__/models/agent';
import { exitCodeOf } from 'test/__utils__/exit-code';

describe('CLI: composio agent whoami', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  layer(TestLive())(it => {
    it.effect('[Given] a stored agent identity [Then] prints its summary as JSON', () =>
      Effect.gen(function* () {
        yield* writeStoredAgentIdentity(makeAgentIdentity());
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
          agentsJsonResponse(makeAgentIdentity())
        );

        yield* cli(['agent', 'whoami']);

        const stdout = yield* MockConsole.getLines({ stream: 'stdout', stripAnsi: true });
        expect(JSON.parse(stdout.at(-1) ?? '')).toMatchObject({
          account_type: 'agent',
          status: 'READY',
          email: 'test-agent@agent.composio.ai',
        });
        expect(stdout.join('\n')).not.toContain('cak_test_agent');
        expect(stdout.join('\n')).not.toContain('uak_agent');
      })
    );
  });

  layer(TestLive({ fixture: 'user-config-example' }))(it => {
    it.effect('[Given] the CLI is signed in as a human user [Then] shows a soft auth warning', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['agent', 'whoami']));
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('currently signed in to Composio as a regular user');
        expect(output).toContain('composio agent login <composio_agent_key>');
        expect(exitCodeOf(exit)).toBe(1);
      })
    );
  });
});
