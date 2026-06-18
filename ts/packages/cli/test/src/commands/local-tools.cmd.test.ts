import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const withLocalToolsPath = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env.COMPOSIO_LOCAL_TOOLS_PATH;
      process.env.COMPOSIO_LOCAL_TOOLS_PATH = path.join(
        os.tmpdir(),
        `composio-local-tools-${Date.now()}.json`
      );
      return previous;
    }),
    () => effect,
    previous =>
      Effect.sync(() => {
        if (previous === undefined) {
          delete process.env.COMPOSIO_LOCAL_TOOLS_PATH;
        } else {
          process.env.COMPOSIO_LOCAL_TOOLS_PATH = previous;
        }
      })
  );

describe('CLI: composio local-tools', () => {
  layer(TestLive())(it => {
    it.scoped('[Given] --json [Then] lists bundled local toolkits', () =>
      Effect.gen(function* () {
        yield* cli(['local-tools', 'list', '--json', '--all-platforms']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const payload = JSON.parse(lines.at(-1) ?? '') as {
          currentPlatform: string;
          metadataPath: string;
          toolkits: Array<{ slug: string }>;
        };

        expect(payload.currentPlatform).toBeTruthy();
        expect(payload.metadataPath).toContain('local_tools.json');
        expect(payload.toolkits.map(toolkit => toolkit.slug)).toEqual(
          expect.arrayContaining(['BEEPER_IMESSAGE', 'CHROME_DEVTOOLS', 'PEEKABOO'])
        );
      })
    );

    it.scoped('[Given] doctor --json [Then] reports local toolkit readiness', () =>
      Effect.gen(function* () {
        yield* cli(['local-tools', 'doctor', '--json', '--all-platforms']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const payload = JSON.parse(lines.at(-1) ?? '') as {
          metadataPath: string;
          toolkits: Array<{ slug: string }>;
        };

        expect(payload.metadataPath).toContain('local_tools.json');
        expect(payload.toolkits.map(toolkit => toolkit.slug)).toEqual(
          expect.arrayContaining(['BEEPER_IMESSAGE', 'CHROME_DEVTOOLS', 'PEEKABOO'])
        );
      })
    );

    it.scoped('[Given] meta --init --json [Then] writes local metadata file', () =>
      withLocalToolsPath(
        Effect.gen(function* () {
          yield* cli(['local-tools', 'meta', '--init', '--json']);

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const payload = JSON.parse(lines.at(-1) ?? '') as {
            metadataPath: string;
            version: number;
            toolkits: Record<string, unknown>;
            tools: Record<string, unknown>;
          };
          const file = JSON.parse(
            yield* Effect.tryPromise(() => fs.readFile(payload.metadataPath, 'utf8'))
          ) as typeof payload;

          expect(payload.version).toBe(1);
          expect(payload.toolkits).toEqual({});
          expect(payload.tools).toEqual({});
          expect(file.version).toBe(1);
        })
      )
    );
  });
});
