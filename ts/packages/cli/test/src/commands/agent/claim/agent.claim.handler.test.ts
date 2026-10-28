import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach, vi } from 'vitest';
import { runAgentClaim } from 'src/commands/agent/claim/agent.claim.handler';
import { writeStoredAgentIdentity } from 'src/services/agents';
import { MockConsole } from 'test/__utils__';
import { AgentHandlerTest } from 'test/__utils__/layers/agents';
import { agentsJsonResponse, makeAgentIdentity } from 'test/__utils__/models/agent';
import { exitCodeOf } from 'test/__utils__/exit-code';

describe('runAgentClaim', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it.effect(
    '[Given] a stored agent key [Then] posts the invite and prints what the API returned',
    () => {
      const { layer, outputs } = AgentHandlerTest();
      return Effect.gen(function* () {
        yield* writeStoredAgentIdentity(makeAgentIdentity());
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
          agentsJsonResponse({
            status: 'pending',
            email: 'Boss@Example.com',
            org_id: 'org_agent',
            invite_code: 'inv_123',
          })
        );

        yield* runAgentClaim({ email: 'boss@example.com' });

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          'https://agents.composio.dev/api/claim',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ email: 'boss@example.com' }),
            headers: expect.objectContaining({ Authorization: 'Bearer cak_test_agent' }),
          })
        );
        expect(yield* MockConsole.getLines({ stripAnsi: true })).toEqual([
          'Sent Composio org claim invite to Boss@Example.com.',
        ]);
        expect(outputs).toEqual([
          {
            data: JSON.stringify({
              status: 'pending',
              email: 'Boss@Example.com',
              org_id: 'org_agent',
              invite_code: 'inv_123',
            }),
            force: false,
          },
        ]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('[Given] an empty API response [Then] falls back to the requested email', () => {
    const { layer, outputs } = AgentHandlerTest();
    return Effect.gen(function* () {
      yield* writeStoredAgentIdentity(makeAgentIdentity());
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => agentsJsonResponse({}));

      yield* runAgentClaim({ email: 'boss@example.com' });

      expect(yield* MockConsole.getLines({ stripAnsi: true })).toEqual([
        'Sent Composio org claim invite to boss@example.com.',
      ]);
      expect(outputs.map(output => output.data)).toEqual([
        JSON.stringify({
          status: 'invited',
          email: 'boss@example.com',
          org_id: null,
          invite_code: null,
        }),
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] no stored identity [Then] warns, exits 1, and sends no invite', () => {
    const { layer, outputs } = AgentHandlerTest();
    return Effect.gen(function* () {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const exit = yield* Effect.exit(runAgentClaim({ email: 'boss@example.com' }));

      expect(yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true })).toEqual([
        'No Composio agent identity is saved on this machine.',
        expect.stringMatching(/^Next steps:\n/),
      ]);
      expect(exitCodeOf(exit)).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(outputs).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] the agents API refuses the invite [Then] fails with its message', () => {
    const { layer, outputs } = AgentHandlerTest();
    return Effect.gen(function* () {
      yield* writeStoredAgentIdentity(makeAgentIdentity());
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        agentsJsonResponse({ message: 'Org already claimed' }, 409)
      );

      const error = yield* Effect.flip(runAgentClaim({ email: 'boss@example.com' }));

      expect(error).toMatchObject({
        _tag: 'services/AgentRequestError',
        message: 'Org already claimed',
        pathname: '/api/claim',
        status: 409,
      });
      expect(outputs).toEqual([]);
    }).pipe(Effect.provide(layer));
  });
});
