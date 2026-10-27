import { describe, expect, layer } from '@effect/vitest';
import * as FileSystem from 'effect/FileSystem';
import { Effect } from 'effect';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { writeStoredAgentIdentity } from 'src/services/agents';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { agentsJsonResponse, makeAgentIdentity } from 'test/__utils__/models/agent';

describe('CLI: composio agent inbox', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  layer(TestLive())(it => {
    it.effect('agent inbox prints only JSON', () =>
      Effect.gen(function* () {
        yield* writeStoredAgentIdentity(makeAgentIdentity());
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
          .mockImplementation(async () => agentsJsonResponse(inbox));

        yield* cli(['agent', 'inbox']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          expect.stringContaining('/api/mail?limit=50'),
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({ Authorization: 'Bearer cak_test_agent' }),
          })
        );
        expect(lines).toEqual([JSON.stringify(inbox)]);
      })
    );

    it.effect('[Given] --limit [Then] asks the agents API for that many messages', () =>
      Effect.gen(function* () {
        yield* writeStoredAgentIdentity(makeAgentIdentity());
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () => agentsJsonResponse({ count: 0, messages: [] }));

        yield* cli(['agent', 'inbox', '--limit', '5']);

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          expect.stringContaining('/api/mail?limit=5'),
          expect.anything()
        );
      })
    );
  });
});
