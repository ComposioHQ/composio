import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach, vi } from 'vitest';
import { runAgentInbox } from 'src/commands/agent/inbox/agent.inbox.handler';
import { writeStoredAgentIdentity } from 'src/services/agents';
import { MockConsole } from 'test/__utils__';
import { AgentHandlerTest } from 'test/__utils__/layers/agents';
import { agentsJsonResponse, makeAgentIdentity } from 'test/__utils__/models/agent';
import { exitCodeOf } from 'test/__utils__/exit-code';

const inbox = {
  count: 1,
  messages: [
    {
      id: 'msg_123',
      from: 'person@example.com',
      subject: 'Hello',
      preview: 'Hi agent',
      labels: ['inbox'],
    },
  ],
  next_cursor: 'cursor_2',
};

describe('runAgentInbox', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.effect(
    '[Given] a stored agent key [Then] fetches up to --limit messages and forces the JSON to stdout',
    () => {
      const { layer, outputs } = AgentHandlerTest();
      return Effect.gen(function* () {
        yield* writeStoredAgentIdentity(makeAgentIdentity());
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () => agentsJsonResponse(inbox));

        yield* runAgentInbox({ limit: 7 });

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          'https://agents.composio.dev/api/mail?limit=7',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({ Authorization: 'Bearer cak_test_agent' }),
          })
        );
        // Fields the CLI does not model pass through unchanged.
        expect(outputs).toEqual([{ data: JSON.stringify(inbox), force: true }]);
        expect(yield* MockConsole.getLines()).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('[Given] a human login [Then] warns, exits 1, and reads no mail', () => {
    const { layer, outputs } = AgentHandlerTest({ apiKey: 'uak_human' });
    return Effect.gen(function* () {
      yield* writeStoredAgentIdentity(makeAgentIdentity());
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const exit = yield* Effect.exit(runAgentInbox({ limit: 50 }));

      expect(yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true })).toEqual([
        'This CLI is currently signed in to Composio as a regular user, not an agent.',
        expect.stringMatching(/^Next steps:\n/),
      ]);
      expect(exitCodeOf(exit)).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(outputs).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] the logged-in key is the stored agent [Then] reads its inbox', () => {
    const { layer, outputs } = AgentHandlerTest({ apiKey: 'uak_agent' });
    return Effect.gen(function* () {
      yield* writeStoredAgentIdentity(makeAgentIdentity());
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => agentsJsonResponse(inbox));

      yield* runAgentInbox({ limit: 50 });

      expect(outputs).toEqual([{ data: JSON.stringify(inbox), force: true }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] a response that is not an inbox [Then] fails to decode it', () => {
    const { layer, outputs } = AgentHandlerTest();
    return Effect.gen(function* () {
      yield* writeStoredAgentIdentity(makeAgentIdentity());
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        agentsJsonResponse({ count: 'one' })
      );

      const error = yield* Effect.flip(runAgentInbox({ limit: 50 }));

      expect(error).toMatchObject({
        _tag: 'services/AgentResponseDecodeError',
        pathname: '/api/mail?limit=50',
      });
      expect(outputs).toEqual([]);
    }).pipe(Effect.provide(layer));
  });
});
