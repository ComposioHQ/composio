import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import { afterEach, vi } from 'vitest';
import { runAgentWhoami } from 'src/commands/agent/whoami/agent.whoami.handler';
import { readStoredAgentIdentity, writeStoredAgentIdentity } from 'src/services/agents';
import { MockConsole } from 'test/__utils__';
import { AgentHandlerTest } from 'test/__utils__/layers/agents';
import { agentsJsonResponse, makeAgentIdentity } from 'test/__utils__/models/agent';

const decoration = Effect.map(MockConsole.getLines({ stripAnsi: true }), lines => lines.join('\n'));

describe('runAgentWhoami', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it.effect(
    '[Given] a stored agent key [Then] refreshes and saves the identity, and prints its summary',
    () => {
      const { layer, outputs } = AgentHandlerTest();
      return Effect.gen(function* () {
        yield* writeStoredAgentIdentity(makeAgentIdentity({ status: 'PENDING', composio: {} }));
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () =>
            agentsJsonResponse(makeAgentIdentity({ claimed_by: 'owner@example.com' }))
          );

        yield* runAgentWhoami();

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          'https://agents.composio.dev/api/whoami',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({ Authorization: 'Bearer cak_test_agent' }),
          })
        );
        const stored = Option.getOrThrow(yield* readStoredAgentIdentity);
        expect(stored).toMatchObject({ status: 'READY', claimed_by: 'owner@example.com' });
        expect(yield* decoration).toBe(
          [
            '[Composio Agent] Type: agent',
            'Status: READY',
            'Email: test-agent@agent.composio.ai',
            'Slug: test-agent',
            'Current Org ID: org_agent',
            'Project ID: proj_agent',
            'Claimed By: owner@example.com',
          ].join('\n')
        );
        expect(outputs).toEqual([
          {
            data: JSON.stringify({
              account_type: 'agent',
              status: 'READY',
              slug: 'test-agent',
              email: 'test-agent@agent.composio.ai',
              org_id: 'org_agent',
              project_id: 'proj_agent',
              member_id: 'mem_agent',
              claimed_by: 'owner@example.com',
              claimed_at: null,
            }),
            force: false,
          },
        ]);
        expect(process.exitCode).toBeUndefined();
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('[Given] a pending identity [Then] prints placeholders for the missing fields', () => {
    const { layer } = AgentHandlerTest();
    return Effect.gen(function* () {
      yield* writeStoredAgentIdentity(makeAgentIdentity());
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        agentsJsonResponse({ status: 'pending' })
      );

      yield* runAgentWhoami();

      expect(yield* decoration).toBe(
        [
          '[Composio Agent] Type: agent',
          'Status: PENDING',
          'Email: unknown',
          'Slug: unknown',
          'Current Org ID: pending',
          'Project ID: pending',
          'Claimed By: not claimed',
        ].join('\n')
      );
      // The key the request used is kept on the refreshed identity.
      const stored = Option.getOrThrow(yield* readStoredAgentIdentity);
      expect(stored.composio_agent_key).toBe('cak_test_agent');
    }).pipe(Effect.provide(layer));
  });

  it.effect.each([
    {
      name: 'no stored identity',
      apiKey: undefined,
      stored: Option.none(),
      message: 'No Composio agent identity is saved on this machine.',
    },
    {
      name: 'a stored identity without its key',
      apiKey: undefined,
      stored: Option.some(makeAgentIdentity({ composio_agent_key: undefined })),
      message: 'The saved Composio agent identity is missing its composio_agent_key.',
    },
    {
      name: 'a human login',
      apiKey: 'uak_human',
      stored: Option.some(makeAgentIdentity()),
      message: 'This CLI is currently signed in to Composio as a regular user, not an agent.',
    },
  ])(
    '[Given] $name [Then] warns with next steps, exits 1, and calls nothing',
    ({ apiKey, stored, message }) => {
      const { layer, outputs } = AgentHandlerTest({ apiKey });
      return Effect.gen(function* () {
        yield* Effect.forEach(Option.toArray(stored), writeStoredAgentIdentity);
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        yield* runAgentWhoami();

        // Plain lines on stderr: a headless terminal drops `ui.log.*` decoration.
        const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
        expect(stderr).toEqual([message, expect.stringMatching(/^Next steps:\n/)]);
        expect(process.exitCode).toBe(1);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(outputs).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] a key the agents API rejects [Then] fails and keeps the stored identity',
    () => {
      const { layer, outputs } = AgentHandlerTest();
      return Effect.gen(function* () {
        const original = yield* writeStoredAgentIdentity(makeAgentIdentity());
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
          agentsJsonResponse({ message: 'Invalid agent key' }, 401)
        );

        const error = yield* Effect.flip(runAgentWhoami());

        expect(error).toMatchObject({
          _tag: 'services/AgentRequestError',
          message: 'Invalid agent key',
          status: 401,
        });
        expect(Option.getOrThrow(yield* readStoredAgentIdentity)).toEqual(original);
        expect(outputs).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );
});
