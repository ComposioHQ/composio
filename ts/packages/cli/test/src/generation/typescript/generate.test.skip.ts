import { describe, expect, it } from 'vitest';
import { createToolkitIndex } from 'src/generation/create-toolkit-index';
import { generateTypeScriptSources } from 'src/generation/typescript/generate';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import path from 'path';
import { assertTypeScriptIsValid } from 'test/__utils__/typescript-compiler';

describe('generateTypeScriptSources', () => {
  describe('with multiple emitted files', () => {
    const _params = {
      outputDir: '<cwd>',
      emitSingleFile: false,
    };

    describe('with banner', () => {
      const params = {
        ..._params,
        banner: 'Some banner that will appear in a comment',
      };

      it('[Given] empty toolkits, tools, triggerTypes [Then] it returns just the index map', () => {
        const index = createToolkitIndex({
          toolkits: [],
          tools: [],
          triggerTypes: [],
        });

        const sources = generateTypeScriptSources(params)(index);

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
          export const composio = {}

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
          export type ToolsByToolkit<Toolkit extends keyof (typeof composio)> = typeof composio[Toolkit]

          "
        `);

        assertTypeScriptIsValid({ files: { 'index.ts': source } });
      });

      it('[Given] a single toolkit with no tools or triggerTypes [Then] it returns a single toolkit source file + the index map', () => {
        const toolkits = makeTestToolkits([
          {
            name: 'Slack Helper',
            slug: 'slack',
          },
        ]);

        const index = createToolkitIndex({
          toolkits,
          tools: [],
          triggerTypes: [],
        });

        const sources = generateTypeScriptSources(params)(index);
        expect(sources).toHaveLength(2);
        expect(sources[0]).toHaveLength(2);
        expect(sources[0][0]).toBe(path.join(params.outputDir, 'slack.ts'));
        expect(sources[0][1]).toMatchInlineSnapshot(`
          "/**
           * Map of Composio's SLACK toolkit.
           */
          export const SLACK = {
            slug: "slack",
            tools: {},
            triggerTypes: {},
          }
          "
        `);
        assertTypeScriptIsValid({ files: { 'slack.ts': sources[0][1] } });

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
          export const composio = {
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
          export type ToolsByToolkit<Toolkit extends keyof (typeof composio)> = typeof composio[Toolkit]

          "
        `);

        assertTypeScriptIsValid({
          files: { 'index.ts': sources[1][1], 'slack.ts': sources[0][1] },
        });
      });

      it('[Given] toolkits with tools and triggerTypes [Then] it returns a TypeScript source file for each toolkit + the index map', () => {
        const toolkits = makeTestToolkits([
          {
            name: 'Slack Helper',
            slug: 'slack',
          },
        ]);

        const index = createToolkitIndex({
          toolkits,
          tools: ['GMAIL_CREATE_EMAIL_DRAFT', 'GMAIL_DELETE_MESSAGE', 'GMAIL_FETCH_EMAILS'],
          triggerTypes: ['GMAIL_NEW_GMAIL_MESSAGE'],
        });

        const sources = generateTypeScriptSources(params)(index);
        expect(sources).toHaveLength(2);
        expect(sources[0]).toHaveLength(2);
        expect(sources[0][0]).toBe(path.join(params.outputDir, 'slack.ts'));
        expect(sources[0][1]).toMatchInlineSnapshot(`
          "/**
           * Map of Composio's SLACK toolkit.
           */
          export const SLACK = {
            slug: "slack",
            tools: {},
            triggerTypes: {},
          }
          "
        `);
        assertTypeScriptIsValid({ files: { 'slack.ts': sources[0][1] } });

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
          export const composio = {
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
          export type ToolsByToolkit<Toolkit extends keyof (typeof composio)> = typeof composio[Toolkit]

          "
        `);
        assertTypeScriptIsValid({ files: { 'index.ts': sources[1][1] } });
      });
    });
  });
});
