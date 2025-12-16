import path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { FileSystem } from '@effect/platform';
import { NodeProcess } from 'src/services/node-process';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import { TRIGGER_TYPES_GMAIL } from 'test/__mocks__/trigger-types-gmail';
import { TOOLS_TYPES_GMAIL } from 'test/__mocks__/tools-types-gmail';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

describe('CLI: composio generate', () => {
  const appClientData = {
    toolkits: makeTestToolkits([
      {
        name: 'Gmail',
        slug: 'gmail',
      },
      {
        name: 'Slack',
        slug: 'slack',
      },
    ]),
    tools: [...TOOLS_TYPES_GMAIL.slice(0, 3)],
    triggerTypes: [...TRIGGER_TYPES_GMAIL.slice(0, 3)],
    triggerTypesAsEnums: [...TRIGGER_TYPES_GMAIL.slice(0, 3).map(triggerType => triggerType.slug)],
  } satisfies TestLiveInput['toolkitsData'];

  layer(
    TestLive({
      fixture: 'python-project',
    })
  )(it => {
    it.scoped('[Given] a valid Python project in cwd [Then] it detects its language', () =>
      Effect.gen(function* () {
        const process = yield* NodeProcess;
        const cwd = process.cwd;

        const args = ['generate', '--output-dir', cwd];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Project type detected: Python');
      })
    );
  });

  layer(
    TestLive({
      fixture: 'typescript-project',
    })
  )(it => {
    it.scoped('[Given] a valid TypeScript project in cwd [Then] it detects its language', () =>
      Effect.gen(function* () {
        const process = yield* NodeProcess;
        const cwd = process.cwd;

        const args = ['generate', '--output-dir', cwd];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Project type detected: TypeScript');
      })
    );
  });

  layer(
    TestLive({
      fixture: 'typescript-project',
      toolkitsData: appClientData,
    })
  )(it => {
    it.scoped(
      '[Given] TypeScript project with --toolkits [Then] it filters output to specified toolkits',
      () =>
        Effect.gen(function* () {
          const process = yield* NodeProcess;
          const cwd = process.cwd;
          const fs = yield* FileSystem.FileSystem;
          const outputDir = path.join(cwd, '.generated', 'composio-filtered');

          const args = ['generate', '--toolkits', 'gmail', '--output-dir', outputDir];
          yield* cli(args);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('Project type detected: TypeScript');
          expect(output).toContain('Filtering to 1 toolkit(s): gmail');

          // Check generated files - only gmail.ts should exist
          const files = yield* fs.readDirectory(outputDir);
          const fileNames = files.map(file => path.basename(file));

          expect(fileNames).toContain('gmail.ts');
          expect(fileNames).not.toContain('slack.ts');
        })
    );
  });

  layer(
    TestLive({
      fixture: 'python-project',
      toolkitsData: appClientData,
    })
  )(it => {
    it.scoped(
      '[Given] Python project with --toolkits [Then] it filters output to specified toolkits',
      () =>
        Effect.gen(function* () {
          const process = yield* NodeProcess;
          const cwd = process.cwd;
          const fs = yield* FileSystem.FileSystem;
          const outputDir = path.join(cwd, '.generated', 'composio-filtered');

          const args = ['generate', '--toolkits', 'gmail', '--output-dir', outputDir];
          yield* cli(args);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('Project type detected: Python');
          expect(output).toContain('Filtering to 1 toolkit(s): gmail');

          // Check generated files - only gmail.py should exist
          const files = yield* fs.readDirectory(outputDir);
          const fileNames = files.map(file => path.basename(file));

          expect(fileNames).toContain('gmail.py');
          expect(fileNames).not.toContain('slack.py');
        })
    );
  });
});
