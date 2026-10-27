import { describe, expect, layer } from '@effect/vitest';
import * as FileSystem from 'effect/FileSystem';
import { Effect, Option } from 'effect';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import * as constants from 'src/constants';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { ComposioUserContext } from 'src/services/user-context';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { agentsJsonResponse, makeAgentIdentity } from 'test/__utils__/models/agent';
import { exitCodeOf } from 'test/__utils__/exit-code';

describe('CLI: composio agent signup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  layer(TestLive())(it => {
    it.effect('agent signup works when the CLI is not signed in', () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () => agentsJsonResponse(makeAgentIdentity()));

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
    it.effect('[Given] --no-wait -f [Then] starts a fresh signup and stays logged out', () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () =>
            agentsJsonResponse(makeAgentIdentity({ status: 'PENDING', composio: undefined }))
          );

        yield* cli(['agent', 'signup', '--no-wait', '-f']);

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          expect.stringContaining('/api/signup?wait=0'),
          expect.objectContaining({ method: 'POST' })
        );
        const stdout = yield* MockConsole.getLines({ stream: 'stdout', stripAnsi: true });
        expect(JSON.parse(stdout.at(-1) ?? '')).toMatchObject({
          status: 'PENDING',
          logged_in: false,
        });
        const ctx = yield* ComposioUserContext;
        expect(Option.getOrUndefined(ctx.data.apiKey)).toBeUndefined();
      })
    );
  });

  layer(TestLive({ fixture: 'user-config-example' }))(it => {
    it.effect('agent signup shows a soft auth warning when signed in as a human user', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['agent', 'signup']));
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('currently signed in to Composio as a regular user');
        expect(output).toContain('composio signup');
        expect(exitCodeOf(exit)).toBe(1);
      })
    );
  });
});
