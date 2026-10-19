import { describe, expect, layer } from '@effect/vitest';
import * as FileSystem from 'effect/FileSystem';
import { Effect, Option } from 'effect';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import * as constants from 'src/constants';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { readStoredAgentIdentity, writeStoredAgentIdentity } from 'src/services/agents';
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

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('CLI: composio agent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  layer(TestLive())(it => {
    it.effect('repairs permissions on an existing agent identity before reading it', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        const agentConfigPath = path.join(cacheDir, 'agent.json');
        const encodedIdentity = `${JSON.stringify(agentSignupResponse, null, 2)}\n`;
        yield* fs.writeFileString(agentConfigPath, encodedIdentity);
        yield* fs.chmod(agentConfigPath, 0o644);
        expect((yield* fs.stat(agentConfigPath)).mode & 0o777).toBe(0o644);

        const identity = yield* readStoredAgentIdentity;

        expect(Option.getOrThrow(identity).composio_agent_key).toBe('cak_test_agent');
        expect(yield* fs.readFileString(agentConfigPath, 'utf8')).toBe(encodedIdentity);
        expect((yield* fs.stat(agentConfigPath)).mode & 0o777).toBe(0o600);
      })
    );

    it.effect('exposes agent signup as a subcommand', () =>
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
    it.effect('agent signup works when the CLI is not signed in', () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () => jsonResponse(agentSignupResponse));

        yield* cli(['agent', 'signup']);

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          expect.stringContaining('/api/signup'),
          expect.objectContaining({ method: 'POST' })
        );
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
    it.effect('top-level signup makes clear it signs up an agent', () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () => jsonResponse(agentSignupResponse));

        yield* cli(['signup']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          expect.stringContaining('/api/signup'),
          expect.objectContaining({ method: 'POST' })
        );

        expect(output).toContain('composio signup signs you up as a Composio agent');
      })
    );
  });

  layer(TestLive())(it => {
    it.effect('agent inbox prints only JSON', () =>
      Effect.gen(function* () {
        yield* writeStoredAgentIdentity(agentSignupResponse);
        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        expect((yield* fs.stat(path.join(cacheDir, 'agent.json'))).mode & 0o777).toBe(0o600);
        const inbox = {
          count: 1,
          messages: [
            {
              id: 'msg_123',
              from: 'person@example.com',
              subject: 'Hello',
              preview: 'Hi agent',
            },
          ],
        };
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () => jsonResponse(inbox));

        yield* cli(['agent', 'inbox']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          expect.stringContaining('/api/mail'),
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({ Authorization: 'Bearer cak_test_agent' }),
          })
        );
        expect(lines).toEqual([JSON.stringify(inbox)]);
      })
    );
  });

  layer(TestLive({ fixture: 'user-config-example' }))(it => {
    it.effect('agent signup shows a soft auth warning when signed in as a human user', () =>
      Effect.gen(function* () {
        yield* cli(['agent', 'signup']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('currently signed in to Composio as a regular user');
        expect(output).toContain('composio signup');
        expect(process.exitCode).toBe(1);
      })
    );
  });
});
