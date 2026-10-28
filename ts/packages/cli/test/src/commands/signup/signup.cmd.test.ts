import { describe, expect, layer } from '@effect/vitest';
import * as FileSystem from 'effect/FileSystem';
import { Effect, Option } from 'effect';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import * as constants from 'src/constants';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import type { AgentIdentity } from 'src/services/agents';
import { ComposioUserContext } from 'src/services/user-context';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';

const readyIdentity: AgentIdentity = {
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

const pendingIdentity: AgentIdentity = {
  ...readyIdentity,
  status: 'PENDING',
  composio: undefined,
};

/** Answers every agents API request with `body`. */
const stubAgentsApi = (body: AgentIdentity) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
  );

describe('CLI: composio signup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  layer(TestLive())('[Given] no login', it => {
    it.effect('[Then] signs up an agent, waits for it, and logs the CLI in', () =>
      Effect.gen(function* () {
        const fetchSpy = stubAgentsApi(readyIdentity);

        yield* cli(['signup']);

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          expect.stringMatching(/\/api\/signup$/),
          expect.objectContaining({ method: 'POST' })
        );
        const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
        expect(stderr).toContain('-- composio signup --');
        expect(stderr).toContain(
          'composio signup signs you up as a Composio agent. This flow is fully non-interactive and does not open a browser.'
        );
        const stdout = yield* MockConsole.getLines({ stream: 'stdout' });
        expect(JSON.parse(stdout.at(-1) ?? '')).toMatchObject({
          status: 'READY',
          org_id: 'org_agent',
          logged_in: true,
        });

        const ctx = yield* ComposioUserContext;
        expect(Option.getOrUndefined(ctx.data.apiKey)).toBe('uak_agent');
        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        const userConfig = yield* fs.readFileString(
          path.join(cacheDir, constants.USER_CONFIG_FILE_NAME),
          'utf8'
        );
        expect(JSON.parse(userConfig)).toMatchObject({ api_key: 'uak_agent', org_id: 'org_agent' });
      })
    );
  });

  layer(TestLive())('[Given] --no-wait -f', it => {
    it.effect('[Then] starts a fresh signup without waiting and stays logged out', () =>
      Effect.gen(function* () {
        const fetchSpy = stubAgentsApi(pendingIdentity);

        yield* cli(['signup', '--no-wait', '-f']);

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          expect.stringMatching(/\/api\/signup\?wait=0$/),
          expect.objectContaining({ method: 'POST' })
        );
        const stdout = yield* MockConsole.getLines({ stream: 'stdout' });
        expect(JSON.parse(stdout.at(-1) ?? '')).toMatchObject({
          status: 'PENDING',
          logged_in: false,
        });
        const ctx = yield* ComposioUserContext;
        expect(Option.isNone(ctx.data.apiKey)).toBe(true);
      })
    );
  });

  layer(TestLive())('[Given] --no-login', it => {
    it.effect('[Then] signs up a ready agent but leaves the CLI logged out', () =>
      Effect.gen(function* () {
        stubAgentsApi(readyIdentity);

        yield* cli(['signup', '--no-login']);

        const stdout = yield* MockConsole.getLines({ stream: 'stdout' });
        expect(JSON.parse(stdout.at(-1) ?? '')).toMatchObject({
          status: 'READY',
          logged_in: false,
        });
        const ctx = yield* ComposioUserContext;
        expect(Option.isNone(ctx.data.apiKey)).toBe(true);
      })
    );
  });

  layer(TestLive({ fixture: 'user-config-example' }))('[Given] a human login', it => {
    it.effect('[Then] warns, exits 1, and signs nothing up', () =>
      Effect.gen(function* () {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        const exit = yield* Effect.exit(cli(['signup']));

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('currently signed in to Composio as a regular user');
        expect(exitCodeOf(exit)).toBe(1);
        expect(fetchSpy).not.toHaveBeenCalled();
      })
    );
  });
});
