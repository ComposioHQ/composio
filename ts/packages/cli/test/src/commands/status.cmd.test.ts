import * as path from 'node:path';
import { FileSystem } from '@effect/platform';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { NodeOs } from 'src/services/node-os';
import { pkg } from 'test/__utils__';

const extractJson = (output: string): Record<string, unknown> => {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  expect(start).toBeGreaterThanOrEqual(0);
  return JSON.parse(output.slice(start, end + 1)) as Record<string, unknown>;
};

describe('CLI: composio status', () => {
  layer(TestLive())('[Given] a fresh machine', it => {
    it.scoped('[Then] reports version, no login, and uninstalled skills as JSON', () =>
      Effect.gen(function* () {
        const os = yield* NodeOs;
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(path.join(os.homedir, '.claude'), { recursive: true });
        yield* fs.makeDirectory(path.join(os.homedir, '.agents', 'skills', 'composio-docs'), {
          recursive: true,
        });

        yield* cli(['status']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        const status = extractJson(output);
        expect(status.version).toBe(pkg.version);
        expect(status.logged_in).toBe(false);
        expect(status.detected_agents).toContain('claude');
        expect(status.skills).toEqual({ 'composio-cli': false, 'composio-docs': true });
        expect(output).toContain('composio login');
      })
    );
  });
});
