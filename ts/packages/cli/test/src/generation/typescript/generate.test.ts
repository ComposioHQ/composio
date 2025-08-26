import { describe, expect, it } from '@effect/vitest';
import { createToolkitIndex } from 'src/generation/create-toolkit-index';
import { generateTypeScriptSources } from 'src/generation/typescript/generate';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import path from 'path';
import { assertTypeScriptIsValid } from 'test/__utils__/typescript-compiler';
import { TOOLS_GITHUB } from 'test/__mocks__/tools_github';
import { TRIGGER_TYPES_GITHUB } from 'test/__mocks__/trigger-types-github';
import { TRIGGER_TYPES_GMAIL } from 'test/__mocks__/trigger-types-gmail';
import { TOOLS_GMAIL } from 'test/__mocks__/tools_gmail';
import { Effect } from 'effect';

describe('generateTypeScriptSources', () => {
  describe('with multiple emitted files', () => {
    const _params = {
      outputDir: '<cwd>',
      emitSingleFile: false,
      importExtension: 'ts',
    } as const satisfies Omit<Parameters<typeof generateTypeScriptSources>[0], 'banner'>;

    describe('with banner', () => {
      const params = {
        ..._params,
        banner: 'Some banner that will appear in a comment',
      };

      it.effect(
        '[Given] empty toolkits, tools, triggerTypes [Then] it returns just the index map',
        Effect.fn(function* () {
          const index = createToolkitIndex({
            toolkits: [],
            typeableTools: { withTypes: false, tools: [] },
            triggerTypes: [],
          });

          const sources = yield* generateTypeScriptSources(params)(index);

          expect(sources).toHaveLength(1);
          const [[filename, source]] = sources;

          expect(filename).toBe(path.join(params.outputDir, 'index.ts'));
          expect(source).toMatchInlineSnapshot(`
          "/**
           * Some banner that will appear in a comment
           */

          /**
           * Map of Composio toolkits to actions.
           */
          export const Toolkits = {}

          /**
           * Type declarations
           */

          /**
           * Union of all available toolkits.
           */
          export type Toolkit = never

          /**
           * Given a toolkit, returns the tools available for that toolkit.
           */
          export type ToolsByToolkit<$Toolkit extends keyof (typeof Toolkits)> = typeof Toolkits[$Toolkit]

          "
        `);

          assertTypeScriptIsValid({ files: { './index.ts': source } });
        })
      );

      it.effect(
        '[Given] a single toolkit with no tools or triggerTypes [Then] it returns a single toolkit source file + the index map',
        Effect.fn(function* () {
          const toolkits = makeTestToolkits([
            {
              name: 'Slack Helper',
              slug: 'slack',
            },
          ]);

          const index = createToolkitIndex({
            toolkits,
            typeableTools: { withTypes: false, tools: [] },
            triggerTypes: [],
          });

          const sources = yield* generateTypeScriptSources(params)(index);
          expect(sources).toHaveLength(2);
          expect(sources[0]).toHaveLength(2);
          expect(sources[0][0]).toBe(path.join(params.outputDir, 'slack.ts'));
          expect(sources[0][1]).toMatchInlineSnapshot(`
            "// ------------------- //
            //    Trigger types    //
            // ------------------- //



            /**
             * Map of Composio's SLACK toolkit.
             */
            export const SLACK = {
              slug: "slack",
              tools: {},
              triggerTypes: {},
            }

            /**
             * Type map of all available trigger payloads for toolkit "SLACK".
             */
            export type SLACK_TRIGGER_PAYLOADS = {}

            /**
             * Type map of all available trigger events for toolkit "SLACK".
             */
            export type SLACK_TRIGGER_EVENTS = {}
            "
          `);
          assertTypeScriptIsValid({ files: { './slack.ts': sources[0][1] } });

          expect(sources[1]).toHaveLength(2);
          expect(sources[1][0]).toBe(path.join(params.outputDir, 'index.ts'));
          expect(sources[1][1]).toMatchInlineSnapshot(`
          "/**
           * Some banner that will appear in a comment
           */

          import { SLACK } from "./slack.ts"

          /**
           * Map of Composio toolkits to actions.
           */
          export const Toolkits = {
            SLACK: SLACK,
          }

          /**
           * Type declarations
           */

          /**
           * Union of all available toolkits.
           */
          export type Toolkit = 
            | "SLACK"
            
          /**
           * Given a toolkit, returns the tools available for that toolkit.
           */
          export type ToolsByToolkit<$Toolkit extends keyof (typeof Toolkits)> = typeof Toolkits[$Toolkit]

          "
        `);

          assertTypeScriptIsValid({
            files: { './index.ts': sources[1][1], './slack.ts': sources[0][1] },
          });
        })
      );

      it.effect(
        '[Given] toolkits with tools and triggerTypes [Then] it returns a TypeScript source file for each toolkit + the index map',
        Effect.fn(function* () {
          const toolkits = makeTestToolkits([
            {
              name: 'Slack Helper',
              slug: 'slack',
            },
          ]);

          const index = createToolkitIndex({
            toolkits,
            typeableTools: {
              withTypes: false,
              tools: [...TOOLS_GMAIL.slice(0, 3), ...TOOLS_GITHUB.slice(0, 3)],
            },
            triggerTypes: [...TRIGGER_TYPES_GMAIL, ...TRIGGER_TYPES_GITHUB],
          });

          const sources = yield* generateTypeScriptSources(params)(index);
          expect(sources).toHaveLength(2);
          expect(sources[0]).toHaveLength(2);
          expect(sources[0][0]).toBe(path.join(params.outputDir, './slack.ts'));
          expect(sources[0][1]).toMatchInlineSnapshot(`
            "// ------------------- //
            //    Trigger types    //
            // ------------------- //



            /**
             * Map of Composio's SLACK toolkit.
             */
            export const SLACK = {
              slug: "slack",
              tools: {},
              triggerTypes: {},
            }

            /**
             * Type map of all available trigger payloads for toolkit "SLACK".
             */
            export type SLACK_TRIGGER_PAYLOADS = {}

            /**
             * Type map of all available trigger events for toolkit "SLACK".
             */
            export type SLACK_TRIGGER_EVENTS = {}
            "
          `);
          assertTypeScriptIsValid({ files: { './slack.ts': sources[0][1] } });

          expect(sources[1]).toHaveLength(2);
          expect(sources[1][0]).toBe(path.join(params.outputDir, 'index.ts'));
          expect(sources[1][1]).toMatchInlineSnapshot(`
          "/**
           * Some banner that will appear in a comment
           */

          import { SLACK } from "./slack.ts"

          /**
           * Map of Composio toolkits to actions.
           */
          export const Toolkits = {
            SLACK: SLACK,
          }

          /**
           * Type declarations
           */

          /**
           * Union of all available toolkits.
           */
          export type Toolkit = 
            | "SLACK"
            
          /**
           * Given a toolkit, returns the tools available for that toolkit.
           */
          export type ToolsByToolkit<$Toolkit extends keyof (typeof Toolkits)> = typeof Toolkits[$Toolkit]

          "
        `);
          assertTypeScriptIsValid({ files: { './index.ts': sources[1][1] } });
        })
      );
    });
  });
});
