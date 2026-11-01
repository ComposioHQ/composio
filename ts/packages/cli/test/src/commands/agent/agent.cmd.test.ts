import { describe, expect, layer } from '@effect/vitest';
import * as FileSystem from 'effect/FileSystem';
import { Effect, Option } from 'effect';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { readStoredAgentIdentity } from 'src/services/agents';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { makeAgentIdentity } from 'test/__utils__/models/agent';

describe('CLI: composio agent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  layer(TestLive())(it => {
    it.effect('repairs permissions on an existing agent identity before reading it', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        const agentConfigPath = path.join(cacheDir, 'agent.json');
        const encodedIdentity = `${JSON.stringify(makeAgentIdentity(), null, 2)}\n`;
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
});
