import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from '@effect/vitest';
import * as BunPath from '@effect/platform-bun/BunPath';
import { Effect } from 'effect';
import { createToolkitIndex } from 'src/generation/create-toolkit-index';
import { generateTypeScriptSources } from 'src/generation/typescript/generate';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import { assertTypeScriptIsValid } from 'test/__utils__/typescript-compiler';
import { TOOLS_TYPES_GITHUB } from 'test/__mocks__/tools-types-github';
import { TRIGGER_TYPES_GITHUB } from 'test/__mocks__/trigger-types-github';
import { TRIGGER_TYPES_GMAIL } from 'test/__mocks__/trigger-types-gmail';

/**
 * `--transpiled` output: the generator writes each file's JavaScript and
 * declaration file itself, without the TypeScript compiler.
 */
const index = createToolkitIndex({
  toolkits: makeTestToolkits([
    { name: 'Github', slug: 'github' },
    { name: 'Gmail', slug: 'gmail' },
  ]),
  typeableTools: { withTypes: true, tools: TOOLS_TYPES_GITHUB.slice(0, 2) },
  // Both toolkits have triggers, so both need the `TriggerEvent` import.
  triggerTypes: [TRIGGER_TYPES_GITHUB[0]!, TRIGGER_TYPES_GMAIL[0]!],
  versionMap: new Map([['gmail', '20250901_00']]),
});

const [firstTool] = TOOLS_TYPES_GITHUB;
const toolName = firstTool!.slug.replace(/^GITHUB_/, '');

const generate = (emitSingleFile: boolean) =>
  generateTypeScriptSources({
    banner: 'Generated for a test',
    emitSingleFile,
    outputDir: '/out',
    importExtension: 'js',
    transpiled: true,
  })(index).pipe(Effect.provide(BunPath.layer));

/** The generated files keyed `./<basename>`, as `assertTypeScriptIsValid` takes them. */
const byBasename = (sources: ReadonlyArray<readonly [string, string]>) =>
  Object.fromEntries(
    sources.map(([filePath, content]) => [`./${path.basename(filePath)}`, content])
  );

const declarationsOnly = (files: Record<string, string>) =>
  Object.fromEntries(Object.entries(files).filter(([name]) => name.endsWith('.d.ts')));

/** Imports the generated JavaScript from a temporary directory and returns `Toolkits`. */
const importToolkits = async (files: Record<string, string>) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-generated-js-'));
  Object.entries(files)
    .filter(([name]) => name.endsWith('.js'))
    .forEach(([name, content]) => fs.writeFileSync(path.join(directory, name), content));
  const module: {
    Toolkits: Record<
      string,
      { slug: string; tools: Record<string, string>; triggerTypes: Record<string, string> }
    >;
  } = await import(pathToFileURL(path.join(directory, 'index.js')).href);
  return module.Toolkits;
};

const consumer = (toolkitModule: string) => `
  import { Toolkits, type Toolkit, type ToolsByToolkit } from './index.js';
  import type { GITHUB_TOOL_INPUTS, GITHUB_TRIGGER_EVENTS } from '${toolkitModule}';

  const slug: string = Toolkits.GITHUB.slug;
  const toolkit: Toolkit = 'GMAIL';
  const tool: string = Toolkits.GITHUB.tools.${toolName};
  type GithubTools = ToolsByToolkit<'GITHUB'>['tools'];
  const sameTool: GithubTools['${toolName}'] = tool;
  type Input = GITHUB_TOOL_INPUTS['${toolName}'];
  type Event = GITHUB_TRIGGER_EVENTS[keyof GITHUB_TRIGGER_EVENTS];
  export const used = { slug, toolkit, sameTool, input: null as unknown as Input, event: null as unknown as Event };
`;

describe('generateTypeScriptSources with transpiled output', () => {
  it.effect('[Given] one file per toolkit [Then] it emits .ts, .js and .d.ts for each', () =>
    Effect.gen(function* () {
      const sources = yield* generate(false);
      expect(sources.map(([filePath]) => path.basename(filePath)).sort()).toEqual([
        'github.d.ts',
        'github.js',
        'github.ts',
        'gmail.d.ts',
        'gmail.js',
        'gmail.ts',
        'index.d.ts',
        'index.js',
        'index.ts',
      ]);
    })
  );

  it.effect(
    '[Given] one file per toolkit [Then] the JavaScript evaluates to the toolkit maps',
    () =>
      Effect.gen(function* () {
        const files = byBasename(yield* generate(false));
        const toolkits = yield* Effect.promise(() => importToolkits(files));
        expect(Object.keys(toolkits)).toEqual(['GITHUB', 'GMAIL']);
        expect(toolkits['GITHUB']!.slug).toBe('github');
        expect(toolkits['GITHUB']!.tools[toolName]).toBe(firstTool!.slug);
        expect(toolkits['GMAIL']!.triggerTypes).toEqual({
          [TRIGGER_TYPES_GMAIL[0]!.slug.replace(/^GMAIL_/, '')]: TRIGGER_TYPES_GMAIL[0]!.slug,
        });
        // A type-only import has no place in JavaScript.
        expect(files['./github.js']).not.toContain('import');
      })
  );

  it.effect('[Given] one file per toolkit [Then] the declarations type-check for a consumer', () =>
    Effect.gen(function* () {
      const files = byBasename(yield* generate(false));
      assertTypeScriptIsValid({
        files: { ...declarationsOnly(files), './consumer.ts': consumer('./github.js') },
      });
    })
  );

  it.effect(
    '[Given] one file per toolkit [Then] the per-tool types stay private to the declaration file',
    () =>
      Effect.gen(function* () {
        const files = byBasename(yield* generate(false));
        assertTypeScriptIsValid({
          files: {
            ...declarationsOnly(files),
            './consumer.ts': `
            // @ts-expect-error not exported
            import type { ${firstTool!.slug}_INPUT } from './github.js';
            export {};
          `,
          },
        });
      })
  );

  it.effect('[Given] a single file [Then] it emits index.ts, index.js and index.d.ts', () =>
    Effect.gen(function* () {
      const sources = yield* generate(true);
      expect(sources.map(([filePath]) => path.basename(filePath))).toEqual([
        'index.ts',
        'index.js',
        'index.d.ts',
      ]);
    })
  );

  it.effect(
    '[Given] a single file with triggers in two toolkits [Then] it imports TriggerEvent once and type-checks',
    () =>
      Effect.gen(function* () {
        const files = byBasename(yield* generate(true));
        const typescript = files['./index.ts']!;
        expect(typescript.match(/import \{ type TriggerEvent \}/g)).toHaveLength(1);
        assertTypeScriptIsValid({ files: { './index.ts': typescript } });
        assertTypeScriptIsValid({
          files: {
            './index.d.ts': files['./index.d.ts']!,
            './consumer.ts': consumer('./index.js'),
          },
        });
        const toolkits = yield* Effect.promise(() => importToolkits(files));
        expect(toolkits['GITHUB']!.tools[toolName]).toBe(firstTool!.slug);
      })
  );
});
