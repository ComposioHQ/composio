import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import { afterEach, vi } from 'vitest';
import { runAgentLogin } from 'src/commands/agent/login/agent.login.handler';
import { readStoredAgentIdentity, writeStoredAgentIdentity } from 'src/services/agents';
import { MockConsole } from 'test/__utils__';
import { AgentHandlerTest } from 'test/__utils__/layers/agents';
import { agentsJsonResponse, makeAgentIdentity } from 'test/__utils__/models/agent';
import { exitCodeOf } from 'test/__utils__/exit-code';

describe('runAgentLogin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it.effect(
    '[Given] a key the agents API knows [Then] stores the identity under that key and logs in',
    () => {
      const { layer, outputs, logins } = AgentHandlerTest();
      return Effect.gen(function* () {
        // The API answers without the key; the stored identity keeps the one the user passed.
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () =>
            agentsJsonResponse(makeAgentIdentity({ composio_agent_key: undefined }))
          );

        yield* runAgentLogin({ composioAgentKey: 'cak_existing' });

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          'https://agents.composio.dev/api/whoami',
          expect.objectContaining({
            headers: expect.objectContaining({ Authorization: 'Bearer cak_existing' }),
          })
        );
        expect(Option.getOrThrow(yield* readStoredAgentIdentity)).toMatchObject({
          composio_agent_key: 'cak_existing',
          agent_key: 'cak_existing',
        });
        expect(logins).toEqual([{ apiKey: 'uak_agent', orgId: 'org_agent' }]);
        expect(yield* MockConsole.getLines({ stripAnsi: true })).toEqual([
          'Logged in as Composio agent test-agent@agent.composio.ai',
        ]);
        expect(outputs.map(output => JSON.parse(output.data))).toEqual([
          expect.objectContaining({ account_type: 'agent', logged_in: true }),
        ]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('[Given] the CLI is logged in as this agent [Then] logs in again', () => {
    const { layer, logins } = AgentHandlerTest({ apiKey: 'uak_agent' });
    return Effect.gen(function* () {
      yield* writeStoredAgentIdentity(makeAgentIdentity());
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        agentsJsonResponse(makeAgentIdentity())
      );

      yield* runAgentLogin({ composioAgentKey: 'cak_test_agent' });

      expect(logins).toEqual([{ apiKey: 'uak_agent', orgId: 'org_agent' }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] a human login [Then] warns, exits 1, and looks nothing up', () => {
    const { layer, outputs, logins } = AgentHandlerTest({ apiKey: 'uak_human' });
    return Effect.gen(function* () {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const exit = yield* Effect.exit(runAgentLogin({ composioAgentKey: 'cak_existing' }));

      expect(yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true })).toEqual([
        'This CLI is currently signed in to Composio as a regular user, not an agent.',
        expect.stringMatching(/^Next steps:\n/),
      ]);
      expect(exitCodeOf(exit)).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(logins).toEqual([]);
      expect(outputs).toEqual([]);
    }).pipe(Effect.provide(layer));
  });
});
