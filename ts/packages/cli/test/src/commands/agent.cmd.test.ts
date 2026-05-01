import { describe, expect, layer } from '@effect/vitest';
import { FileSystem } from '@effect/platform';
import { Effect, Option } from 'effect';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import * as constants from 'src/constants';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { writeStoredAgentIdentity } from 'src/services/agents';
import { ComposioUserContext } from 'src/services/user-context';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const agentSignupResponse = {
  status: 'READY',
  slug: 'test-agent',
  email: 'test-agent@agent.composio.ai',
  composio_agent_key: 'cak_test_agent',
  composio: {
    member_id: 'mem_agent',
    org_id: 'org_agent',
    project_id: 'proj_agent',
    user_api_key: 'uak_agent',
  },
};

describe('CLI: composio agent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  layer(TestLive())(it => {
    it.scoped('exposes agent signup as a subcommand', () =>
      Effect.gen(function* () {
        yield* cli(['agent', '--help']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('signup');
        expect(output).toContain('login');
        expect(output).toContain('whoami');
        expect(output).toContain('claim');
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('agent signup works when the CLI is not signed in', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async requestInput => {
          const url =
            typeof requestInput === 'string'
              ? requestInput
              : requestInput instanceof URL
                ? requestInput.toString()
                : requestInput.url;

          if (url.includes('/api/signup')) {
            return new Response(JSON.stringify(agentSignupResponse), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          return new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        });

        yield* cli(['agent', 'signup']);

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('composio agent signup signs you up as a Composio agent');
        expect(output).toContain('fully non-interactive');

        const ctx = yield* ComposioUserContext;
        expect(Option.getOrUndefined(ctx.data.apiKey)).toBe('uak_agent');
        expect(Option.getOrUndefined(ctx.data.orgId)).toBe('org_agent');

        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        const userConfigRaw = yield* fs.readFileString(
          path.join(cacheDir, constants.USER_CONFIG_FILE_NAME),
          'utf8'
        );
        const agentConfigRaw = yield* fs.readFileString(path.join(cacheDir, 'agent.json'), 'utf8');

        expect(JSON.parse(userConfigRaw)).toMatchObject({
          api_key: 'uak_agent',
          org_id: 'org_agent',
        });
        expect(JSON.parse(agentConfigRaw)).toMatchObject({
          composio_agent_key: 'cak_test_agent',
          agent_key: 'cak_test_agent',
          composio: { user_api_key: 'uak_agent' },
        });
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('top-level signup makes clear it signs up an agent', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async requestInput => {
          const url =
            typeof requestInput === 'string'
              ? requestInput
              : requestInput instanceof URL
                ? requestInput.toString()
                : requestInput.url;

          if (url.includes('/api/signup')) {
            return new Response(JSON.stringify(agentSignupResponse), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          return new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        });

        yield* cli(['signup']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('composio signup signs you up as a Composio agent');
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('agent inbox prints only JSON', () =>
      Effect.gen(function* () {
        yield* writeStoredAgentIdentity(agentSignupResponse);
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (requestInput, init) => {
          const url =
            typeof requestInput === 'string'
              ? requestInput
              : requestInput instanceof URL
                ? requestInput.toString()
                : requestInput.url;

          if (url.includes('/api/mail')) {
            expect(new Headers(init?.headers).get('authorization')).toBe('Bearer cak_test_agent');
            return new Response(
              JSON.stringify({
                count: 1,
                messages: [
                  {
                    id: 'msg_123',
                    from: 'person@example.com',
                    subject: 'Hello',
                    preview: 'Hi agent',
                  },
                ],
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }

          return new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        });

        yield* cli(['agent', 'inbox']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines).toEqual([
          JSON.stringify({
            count: 1,
            messages: [
              {
                id: 'msg_123',
                from: 'person@example.com',
                subject: 'Hello',
                preview: 'Hi agent',
              },
            ],
          }),
        ]);
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('agent login restores an existing agent from composio_agent_key', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (requestInput, init) => {
          const url =
            typeof requestInput === 'string'
              ? requestInput
              : requestInput instanceof URL
                ? requestInput.toString()
                : requestInput.url;

          if (url.includes('/api/whoami')) {
            expect(new Headers(init?.headers).get('authorization')).toBe('Bearer cak_existing');
            return new Response(
              JSON.stringify({
                ...agentSignupResponse,
                composio_agent_key: 'cak_existing',
                agent_key: 'cak_existing',
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }

          return new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        });

        yield* cli(['agent', 'login', 'cak_existing']);

        const ctx = yield* ComposioUserContext;
        expect(Option.getOrUndefined(ctx.data.apiKey)).toBe('uak_agent');
        expect(Option.getOrUndefined(ctx.data.orgId)).toBe('org_agent');

        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        const agentConfigRaw = yield* fs.readFileString(path.join(cacheDir, 'agent.json'), 'utf8');
        expect(JSON.parse(agentConfigRaw)).toMatchObject({
          composio_agent_key: 'cak_existing',
          agent_key: 'cak_existing',
          composio: { user_api_key: 'uak_agent' },
        });
      })
    );
  });

  layer(TestLive({ fixture: 'user-config-example' }))(it => {
    it.scoped('agent commands show a soft auth warning when signed in as a human user', () =>
      Effect.gen(function* () {
        yield* cli(['agent', 'whoami']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('currently signed in to Composio as a regular user');
        expect(output).toContain('composio agent login <composio_agent_key>');
        expect(process.exitCode).toBe(1);
      })
    );

    it.scoped('agent signup shows a soft auth warning when signed in as a human user', () =>
      Effect.gen(function* () {
        yield* cli(['agent', 'signup']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('currently signed in to Composio as a regular user');
        expect(output).toContain('composio signup');
        expect(process.exitCode).toBe(1);
      })
    );

    it.scoped('agent login shows a soft auth warning when signed in as a human user', () =>
      Effect.gen(function* () {
        yield* cli(['agent', 'login', 'cak_existing']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('currently signed in to Composio as a regular user');
        expect(output).toContain('composio logout');
        expect(process.exitCode).toBe(1);
      })
    );
  });
});
