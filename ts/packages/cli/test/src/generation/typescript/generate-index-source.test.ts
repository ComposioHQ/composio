import { describe, expect, it } from 'vitest';
import {
  generateIndexSource,
  type GenerateTypeScriptIndexMapSourceParams,
} from 'src/generation/typescript/generate-index-source';
import { createToolkitIndex } from 'src/generation/create-toolkit-index';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import { assertTypeScriptIsValid } from 'test/__utils__/typescript-compiler';

describe('generateTypeScriptToolkitSources', () => {
  describe('with a single emitted file', () => {
    const _params = {
      emitSingleFile: true,
      banner: '<BANNER>',
      importExtension: 'ts' as const,
    } satisfies GenerateTypeScriptIndexMapSourceParams;

    describe('with banner', () => {
      const params = {
        ..._params,
        banner: '<<< Some banner that will appear in a comment >>>',
      };

      it('[Given] empty toolkits, tools, triggerTypes [Then] it creates a valid but empty index map', () => {
        const index = createToolkitIndex({
          toolkits: [],
          tools: [],
          triggerTypes: [],
        });

        const source = generateIndexSource(params)(index);

        expect(source).not.includes(params.banner);
        expect(source).toMatchInlineSnapshot(`
          "/**
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

        assertTypeScriptIsValid({ files: { 'index.ts': source } });
      });

      it('[Given] a single toolkit with no tools or triggerTypes [Then] it creates an index map with no imports, with unrelesolved references, and with no banner', () => {
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

        const source = generateIndexSource(params)(index);

        expect(source).not.includes(params.banner);
        expect(source).toMatchInlineSnapshot(`
          "/**
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
      });

      it('[Given] multiple toolkits with tools and triggerTypes [Then] it creates an index map with no imports, with unrelesolved references, and with no banner', () => {
        const toolkits = makeTestToolkits([
          {
            name: 'Gmail',
            slug: 'gmail',
          },
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

        const source = generateIndexSource(params)(index);

        expect(source).not.includes(params.banner);
        expect(source).toMatchInlineSnapshot(`
          "/**
           * Map of Composio toolkits to actions.
           */
          export const Toolkits = {
            GMAIL: GMAIL,
            SLACK: SLACK,
          }

          /**
           * Type declarations
           */

          /**
           * Union of all available toolkits.
           */
          export type Toolkit = 
            | "GMAIL"
            | "SLACK"
            
          /**
           * Given a toolkit, returns the tools available for that toolkit.
           */
          export type ToolsByToolkit<$Toolkit extends keyof (typeof Toolkits)> = typeof Toolkits[$Toolkit]

          "
        `);
      });
    });
  });

  describe('with multiple emitted files', () => {
    const _params = {
      emitSingleFile: false,
      banner: '<BANNER>',
      importExtension: 'ts' as const,
    };

    describe('with banner', () => {
      const params = {
        ..._params,
        banner: 'Some banner that will appear in a comment',
      };

      it('[Given] empty toolkits, tools, triggerTypes [Then] it creates a valid but empty index map', () => {
        const index = createToolkitIndex({
          toolkits: [],
          tools: [],
          triggerTypes: [],
        });

        const source = generateIndexSource(params)(index);

        expect(source).includes(params.banner);
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

        assertTypeScriptIsValid({ files: { 'index.ts': source } });
      });

      it('[Given] a single toolkit with no tools or triggerTypes [Then] it creates the index map with imports', () => {
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

        const source = generateIndexSource(params)(index);

        expect(source).includes(params.banner);
        expect(source).toMatchInlineSnapshot(`
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
      });

      it('[Given] multiple toolkits with tools and triggerTypes [Then] it creates the index map with imports', () => {
        const toolkits = makeTestToolkits([
          {
            name: 'Gmail',
            slug: 'gmail',
          },
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

        const source = generateIndexSource(params)(index);

        expect(source).includes(params.banner);
        expect(source).toMatchInlineSnapshot(`
          "/**
           * Some banner that will appear in a comment
           */

          import { GMAIL } from "./gmail.ts"
          import { SLACK } from "./slack.ts"

          /**
           * Map of Composio toolkits to actions.
           */
          export const Toolkits = {
            GMAIL: GMAIL,
            SLACK: SLACK,
          }

          /**
           * Type declarations
           */

          /**
           * Union of all available toolkits.
           */
          export type Toolkit = 
            | "GMAIL"
            | "SLACK"
            
          /**
           * Given a toolkit, returns the tools available for that toolkit.
           */
          export type ToolsByToolkit<$Toolkit extends keyof (typeof Toolkits)> = typeof Toolkits[$Toolkit]

          "
        `);
      });
    });
  });
});
