import { describe, expect, layer } from '@effect/vitest';
import * as FileSystem from 'effect/FileSystem';
import { Effect, Option } from 'effect';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { ComposioUserContext } from 'src/services/user-context';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';

const existingAgent = {
  status: 'READY',
  slug: 'test-agent',
  email: 'test-agent@agent.composio.ai',
  composio_agent_key: 'cak_existing',
  agent_key: 'cak_existing',
  composio: {
    member_id: 'mem_agent',
    org_id: 'org_agent',
    project_id: 'proj_agent',
    user_api_key: 'uak_agent',
  },
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const agentConfigPath = Effect.map(setupCacheDir, cacheDir => path.join(cacheDir, 'agent.json'));

describe('CLI: composio agent login', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  layer(TestLive())(it => {
    it.effect(
      '[Given] a key the agents API knows [Then] stores the identity, logs in, and prints its summary',
      () =>
        Effect.gen(function* () {
          const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(async () => jsonResponse(existingAgent));

          yield* cli(['agent', 'login', 'cak_existing']);

          expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
            expect.stringContaining('/api/whoami'),
            expect.objectContaining({
              method: 'GET',
              headers: expect.objectContaining({ Authorization: 'Bearer cak_existing' }),
            })
          );
          const ctx = yield* ComposioUserContext;
          expect(Option.getOrUndefined(ctx.data.apiKey)).toBe('uak_agent');
          expect(Option.getOrUndefined(ctx.data.orgId)).toBe('org_agent');

          const fs = yield* FileSystem.FileSystem;
          const agentConfigRaw = yield* fs.readFileString(yield* agentConfigPath, 'utf8');
          expect(JSON.parse(agentConfigRaw)).toMatchObject({
            composio_agent_key: 'cak_existing',
            agent_key: 'cak_existing',
            composio: { user_api_key: 'uak_agent' },
          });

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          expect(lines).toContain('Logged in as Composio agent test-agent@agent.composio.ai');
          expect(lines.at(-1)).toBe(
            JSON.stringify({
              account_type: 'agent',
              status: 'READY',
              slug: 'test-agent',
              email: 'test-agent@agent.composio.ai',
              org_id: 'org_agent',
              project_id: 'proj_agent',
              member_id: 'mem_agent',
              claimed_by: null,
              claimed_at: null,
              logged_in: true,
            })
          );
        })
    );
  });

  layer(TestLive())(it => {
    it.effect('[Given] a key the agents API rejects [Then] fails and stores nothing', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
          jsonResponse({ message: 'Invalid agent key' }, 401)
        );

        const error = yield* cli(['agent', 'login', 'cak_revoked']).pipe(Effect.flip);

        expect(error).toMatchObject({ message: 'Invalid agent key', status: 401 });
        const ctx = yield* ComposioUserContext;
        expect(Option.getOrUndefined(ctx.data.apiKey)).toBeUndefined();
        const fs = yield* FileSystem.FileSystem;
        expect(yield* fs.exists(yield* agentConfigPath)).toBe(false);
      })
    );
  });

  layer(TestLive())(it => {
    it.effect(
      '[Given] an identity without credentials yet [Then] warns, exits 1, and does not log in',
      () =>
        Effect.gen(function* () {
          vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
            jsonResponse({ ...existingAgent, status: 'PENDING', composio: undefined })
          );

          const exit = yield* Effect.exit(cli(['agent', 'login', 'cak_existing']));

          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain('Agent identity is not ready yet.');
          expect(output).not.toContain('"logged_in":true');
          expect(exitCodeOf(exit)).toBe(1);
          const ctx = yield* ComposioUserContext;
          expect(Option.getOrUndefined(ctx.data.apiKey)).toBeUndefined();
        })
    );
  });

  layer(TestLive({ fixture: 'user-config-example' }))(it => {
    it.effect('[Given] the CLI is signed in as a human user [Then] shows a soft auth warning', () =>
      Effect.gen(function* () {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        const exit = yield* Effect.exit(cli(['agent', 'login', 'cak_existing']));
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('currently signed in to Composio as a regular user');
        expect(output).toContain('composio logout');
        expect(exitCodeOf(exit)).toBe(1);
        expect(fetchSpy).not.toHaveBeenCalled();
      })
    );
  });
});
