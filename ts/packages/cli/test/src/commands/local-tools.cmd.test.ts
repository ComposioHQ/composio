import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';

describe('CLI: composio local-tools', () => {
  layer(TestLive())(it => {
    it.scoped('[Given] --json [Then] lists bundled local toolkits', () =>
      Effect.gen(function* () {
        yield* cli(['local-tools', 'list', '--json', '--all-platforms']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const payload = JSON.parse(lines.at(-1) ?? '') as {
          currentPlatform: string;
          metadataPath: string;
          toolkits: Array<{
            slug: string;
            tools: Array<{ finalSlug: string; executionKind: string }>;
          }>;
        };

        expect(payload.currentPlatform).toBeTruthy();
        expect(payload.metadataPath).toContain('local_tools.json');
        expect(payload.toolkits.map(toolkit => toolkit.slug)).toEqual(
          expect.arrayContaining(['BEEPER_IMESSAGE', 'CHROME_DEVTOOLS', 'PEEKABOO'])
        );
        expect(
          payload.toolkits.flatMap(toolkit => toolkit.tools.map(tool => tool.finalSlug))
        ).toEqual(
          expect.arrayContaining(['LOCAL_CHROME_DEVTOOLS_LIST_TOOLS', 'LOCAL_PEEKABOO_HELP'])
        );
      })
    );

    it.scoped(
      '[Given] toolkit filter [Then] only returns matching local toolkit declarations',
      () =>
        Effect.gen(function* () {
          yield* cli([
            'local-tools',
            'list',
            '--json',
            '--all-platforms',
            '--toolkits',
            'chrome_devtools',
          ]);

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const payload = JSON.parse(lines.at(-1) ?? '') as { toolkits: Array<{ slug: string }> };

          expect(payload.toolkits.map(toolkit => toolkit.slug)).toEqual(['CHROME_DEVTOOLS']);
        })
    );

    it.scoped('[Given] doctor --json [Then] reports local readiness statuses', () =>
      Effect.gen(function* () {
        yield* cli(['local-tools', 'doctor', '--json', '--all-platforms']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const payload = JSON.parse(lines.at(-1) ?? '') as {
          metadataPath: string;
          toolkits: Array<{
            slug: string;
            status: string;
            tools: Array<{ finalSlug: string; status: string; command?: { command: string } }>;
          }>;
        };

        expect(payload.metadataPath).toContain('local_tools.json');
        expect(payload.toolkits.map(toolkit => toolkit.slug)).toEqual(
          expect.arrayContaining(['BEEPER_IMESSAGE', 'CHROME_DEVTOOLS', 'PEEKABOO'])
        );
        expect(payload.toolkits.flatMap(toolkit => toolkit.tools.map(tool => tool.status))).toEqual(
          expect.arrayContaining([expect.any(String)])
        );
        expect(
          payload.toolkits.flatMap(toolkit => toolkit.tools.map(tool => tool.finalSlug))
        ).toContain('LOCAL_CHROME_DEVTOOLS_CALL_TOOL');
      })
    );

    it.scoped('[Given] configure --json [Then] writes local metadata overrides', () =>
      Effect.acquireUseRelease(
        Effect.sync(() => {
          const previous = process.env.COMPOSIO_LOCAL_TOOLS_PATH;
          process.env.COMPOSIO_LOCAL_TOOLS_PATH = path.join(
            os.tmpdir(),
            `composio-local-tools-${Date.now()}.json`
          );
          return previous;
        }),
        () =>
          Effect.gen(function* () {
            yield* cli([
              'local-tools',
              'configure',
              'peekaboo',
              '--command',
              '/tmp/peekaboo',
              '--authenticated',
              '--json',
            ]);

            const lines = yield* MockConsole.getLines({ stripAnsi: true });
            const payload = JSON.parse(lines.at(-1) ?? '') as {
              metadataPath: string;
              target: { kind: string; key: string };
              entry: { installation?: { command?: string }; authenticated?: boolean };
            };
            const file = JSON.parse(
              yield* Effect.tryPromise(() => fs.readFile(payload.metadataPath, 'utf8'))
            ) as {
              toolkits: Record<
                string,
                { installation?: { command?: string }; authenticated?: boolean }
              >;
            };

            expect(payload.target).toMatchObject({ kind: 'toolkit', key: 'peekaboo' });
            expect(payload.entry.installation?.command).toBe('/tmp/peekaboo');
            expect(payload.entry.authenticated).toBe(true);
            expect(file.toolkits.peekaboo?.installation?.command).toBe('/tmp/peekaboo');
          }),
        previous =>
          Effect.sync(() => {
            if (previous === undefined) {
              delete process.env.COMPOSIO_LOCAL_TOOLS_PATH;
            } else {
              process.env.COMPOSIO_LOCAL_TOOLS_PATH = previous;
            }
          })
      )
    );
  });
});
