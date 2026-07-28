import { afterEach, vi } from 'vitest';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import {
  AgentRequestError,
  AgentResponseDecodeError,
  fetchAgentInbox,
  normalizeAgentIdentity,
} from 'src/services/agents';

describe('agent service response boundaries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes known keys while preserving forward-compatible fields', () => {
    const identity = normalizeAgentIdentity({
      agent_key: 'agent_test_key',
      status: 'READY',
      future_field: { enabled: true },
      composio: {
        user_api_key: 'uak_test',
        org_id: 'org_test',
        future_credential_metadata: 'preserved',
      },
    });

    expect(identity.composio_agent_key).toBe('agent_test_key');
    expect(identity.future_field).toEqual({ enabled: true });
    expect(identity.composio?.future_credential_metadata).toBe('preserved');
  });

  it.effect('decodes inbox responses instead of asserting their shape', () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            count: 1,
            messages: [{ subject: 'Hello', future_field: 'preserved' }],
            next_cursor: 'cursor_test',
          }),
          { status: 200 }
        )
      );

      const inbox = yield* fetchAgentInbox({ agentKey: 'agent_test_key' });

      expect(inbox.count).toBe(1);
      expect(inbox.messages?.[0]?.subject).toBe('Hello');
      expect(inbox.messages?.[0]?.future_field).toBe('preserved');
      expect(inbox.next_cursor).toBe('cursor_test');
    })
  );

  it.effect('fails with structured context when an inbox response is invalid', () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ subject: 42 }] }), { status: 200 })
      );

      const error = yield* fetchAgentInbox({ agentKey: 'agent_test_key', limit: 5 }).pipe(
        Effect.flip
      );

      expect(error).toBeInstanceOf(AgentResponseDecodeError);
      expect(error.pathname).toBe('/api/mail?limit=5');
    })
  );

  it.effect('preserves an agent API error message and HTTP status', () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ message: 'Agent key expired' }), { status: 401 })
      );

      const error = yield* fetchAgentInbox({ agentKey: 'expired_key' }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(AgentRequestError);
      if (!(error instanceof AgentRequestError)) return;
      expect(error.message).toBe('Agent key expired');
      expect(error.status).toBe(401);
      expect(error.pathname).toBe('/api/mail?limit=50');
    })
  );
});
