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
  });
});
