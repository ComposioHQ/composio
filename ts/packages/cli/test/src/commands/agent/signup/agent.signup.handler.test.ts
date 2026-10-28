import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import { afterEach, vi } from 'vitest';
import {
  runAgentSignup,
  type AgentSignupParams,
} from 'src/commands/agent/signup/agent.signup.handler';
import { readStoredAgentIdentity, writeStoredAgentIdentity } from 'src/services/agents';
import { MockConsole } from 'test/__utils__';
import { AgentHandlerTest } from 'test/__utils__/layers/agents';
import { agentsJsonResponse, makeAgentIdentity } from 'test/__utils__/models/agent';
import { exitCodeOf } from 'test/__utils__/exit-code';

const params = (overrides: Partial<AgentSignupParams> = {}): AgentSignupParams => ({
  noWait: false,
  noLogin: false,
  force: false,
  ...overrides,
});

const pendingIdentity = makeAgentIdentity({
  status: 'PENDING',
  composio_agent_key: 'cak_pending',
  composio: undefined,
});

/** The note body for the default READY identity. */
const readyNote = [
  '[Composio Agent] Type: agent',
  'Status: READY',
  'Email: test-agent@agent.composio.ai',
  'Slug: test-agent',
  'Current Org ID: org_agent',
  'Project ID: proj_agent',
  'Agent key: stored in ~/.composio/agent.json',
].join('\n');

const INTRO = '-- composio agent signup --';
const INFO =
  'composio agent signup signs you up as a Composio agent. This flow is fully non-interactive and does not open a browser.';
const OUTRO = '-- Agent setup complete. --';

const summaryJson = (identity: ReturnType<typeof makeAgentIdentity>, loggedIn: boolean) =>
  JSON.stringify({
    account_type: 'agent',
    status: identity.status,
    slug: identity.slug,
    email: identity.email,
    org_id: identity.composio?.org_id ?? null,
    project_id: identity.composio?.project_id ?? null,
    member_id: identity.composio?.member_id ?? null,
    claimed_by: null,
    claimed_at: null,
    logged_in: loggedIn,
  });

describe('runAgentSignup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it.effect(
    '[Given] no stored identity [Then] signs up, waits, stores the identity, and logs in',
    () => {
      const { layer, outputs, logins } = AgentHandlerTest();
      return Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () => agentsJsonResponse(makeAgentIdentity()));

        yield* runAgentSignup(params());

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          'https://agents.composio.dev/api/signup',
          expect.objectContaining({ method: 'POST', body: '{}' })
        );
        expect(Option.getOrThrow(yield* readStoredAgentIdentity)).toMatchObject({
          composio_agent_key: 'cak_test_agent',
          agent_key: 'cak_test_agent',
        });
        expect(logins).toEqual([{ apiKey: 'uak_agent', orgId: 'org_agent' }]);
        expect(yield* MockConsole.getLines({ stripAnsi: true })).toEqual([
          INTRO,
          INFO,
          readyNote,
          'Logged in with the Composio agent identity.',
          OUTRO,
        ]);
        expect(outputs).toEqual([{ data: summaryJson(makeAgentIdentity(), true), force: false }]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] --no-wait [Then] starts the signup, reports it pending, and stays logged out',
    () => {
      const { layer, outputs, logins } = AgentHandlerTest();
      return Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () => agentsJsonResponse(pendingIdentity));

        yield* runAgentSignup(params({ noWait: true }));

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          'https://agents.composio.dev/api/signup?wait=0',
          expect.objectContaining({ method: 'POST' })
        );
        expect(Option.getOrThrow(yield* readStoredAgentIdentity).composio_agent_key).toBe(
          'cak_pending'
        );
        expect(logins).toEqual([]);
        expect(yield* MockConsole.getLines({ stripAnsi: true })).toEqual([
          INTRO,
          INFO,
          [
            '[Composio Agent] Type: agent',
            'Status: PENDING',
            'Email: test-agent@agent.composio.ai',
            'Slug: test-agent',
            'Current Org ID: pending',
            'Project ID: pending',
            'Agent key: stored in ~/.composio/agent.json',
          ].join('\n'),
          'Signup is pending. Run `composio agent whoami` to poll status.',
          OUTRO,
        ]);
        expect(outputs).toEqual([{ data: summaryJson(pendingIdentity, false), force: false }]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('[Given] --no-login [Then] signs up without logging in or a pending note', () => {
    const { layer, outputs, logins } = AgentHandlerTest();
    return Effect.gen(function* () {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        agentsJsonResponse(makeAgentIdentity())
      );

      yield* runAgentSignup(params({ noLogin: true }));

      expect(logins).toEqual([]);
      expect(yield* MockConsole.getLines({ stripAnsi: true })).toEqual([
        INTRO,
        INFO,
        readyNote,
        OUTRO,
      ]);
      expect(outputs).toEqual([{ data: summaryJson(makeAgentIdentity(), false), force: false }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] a stored READY identity [Then] refreshes and reuses it without signing up',
    () => {
      const { layer, logins } = AgentHandlerTest();
      return Effect.gen(function* () {
        yield* writeStoredAgentIdentity(makeAgentIdentity());
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () => agentsJsonResponse(makeAgentIdentity()));

        yield* runAgentSignup(params());

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          'https://agents.composio.dev/api/whoami',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({ Authorization: 'Bearer cak_test_agent' }),
          })
        );
        expect(logins).toEqual([{ apiKey: 'uak_agent', orgId: 'org_agent' }]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('[Given] a stored identity and --force [Then] signs up a new agent', () => {
    const { layer } = AgentHandlerTest();
    return Effect.gen(function* () {
      yield* writeStoredAgentIdentity(makeAgentIdentity({ composio_agent_key: 'cak_old' }));
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => agentsJsonResponse(makeAgentIdentity()));

      yield* runAgentSignup(params({ force: true, noLogin: true }));

      expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
        'https://agents.composio.dev/api/signup',
        expect.objectContaining({ method: 'POST' })
      );
      expect(Option.getOrThrow(yield* readStoredAgentIdentity).composio_agent_key).toBe(
        'cak_test_agent'
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] a human login [Then] warns, exits 1, and signs nothing up', () => {
    const { layer, outputs, logins } = AgentHandlerTest({ apiKey: 'uak_human' });
    return Effect.gen(function* () {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const exit = yield* Effect.exit(runAgentSignup(params()));

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

  it.effect('[Given] the agents API refuses the signup [Then] fails and stores nothing', () => {
    const { layer, outputs, logins } = AgentHandlerTest();
    return Effect.gen(function* () {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        agentsJsonResponse({ message: 'Signup unavailable' }, 503)
      );

      const error = yield* Effect.flip(runAgentSignup(params()));

      expect(error).toMatchObject({
        _tag: 'services/AgentRequestError',
        message: 'Signup unavailable',
        pathname: '/api/signup',
        status: 503,
      });
      expect(Option.isNone(yield* readStoredAgentIdentity)).toBe(true);
      expect(logins).toEqual([]);
      expect(outputs).toEqual([]);
    }).pipe(Effect.provide(layer));
  });
});
