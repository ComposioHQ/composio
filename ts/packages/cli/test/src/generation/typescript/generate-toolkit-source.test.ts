import { describe, expect, it } from 'vitest';
import { generateTypeScriptToolkitSources } from 'src/generation/typescript/generate-toolkit-sources';
import { createToolkitIndex } from 'src/generation/create-toolkit-index';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';

describe('generateTypeScriptToolkitSources', () => {
  describe('with a single emitted file', () => {
    const _params = {
      outputDir: '<cwd>',
      emitSingleFile: true,
    };

    describe('with banner', () => {
      const params = {
        ..._params,
        banner: 'Some banner that will appear in a comment',
      };

      it('[Given] empty toolkits, tools, triggerTypes [Then] it returns an empty array', () => {
        const index = createToolkitIndex({
          toolkits: [],
          tools: [],
          triggerTypes: [],
        });

        const sources = generateTypeScriptToolkitSources(params)(index);

        expect(sources).toEqual([]);
      });

      it('[Given] a single toolkit with no tools or triggerTypes [Then] it returns a single toolkit source file', () => {
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

        const sources = generateTypeScriptToolkitSources(params)(index);
        expect(sources).toHaveLength(1);
        expect(sources[0]).toHaveLength(2);
        expect(sources[0][0]).toBe('slack.ts');
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
      });

      it('[Given] toolkits with tools and triggerTypes [Then] it returns a TypeScript source file for each toolkit + the index map', () => {
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

        const sources = generateTypeScriptToolkitSources(params)(index);
        expect(sources).toHaveLength(2);

        expect(sources[0]).toHaveLength(2);
        expect(sources[0][0]).toBe('gmail.ts');
        expect(sources[0][1]).toMatchInlineSnapshot(`
          "/**
           * Map of Composio's GMAIL toolkit.
           */
          export const GMAIL = {
            slug: "gmail",
            tools: {
              CREATE_EMAIL_DRAFT: "GMAIL_CREATE_EMAIL_DRAFT",
              DELETE_MESSAGE: "GMAIL_DELETE_MESSAGE",
              FETCH_EMAILS: "GMAIL_FETCH_EMAILS",
            },
            triggerTypes: {
              NEW_GMAIL_MESSAGE: "GMAIL_NEW_GMAIL_MESSAGE",
            },
          }
          "
        `);

        expect(sources[1]).toHaveLength(2);
        expect(sources[1][0]).toBe('slack.ts');
        expect(sources[1][1]).toMatchInlineSnapshot(`
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
      });
    });
  });

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

      it('[Given] empty toolkits, tools, triggerTypes [Then] it returns an empty array', () => {
        const index = createToolkitIndex({
          toolkits: [],
          tools: [],
          triggerTypes: [],
        });

        const sources = generateTypeScriptToolkitSources(params)(index);

        expect(sources).toEqual([]);
      });

      it('[Given] a single toolkit with no tools or triggerTypes [Then] it returns a single toolkit source file', () => {
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

        const sources = generateTypeScriptToolkitSources(params)(index);
        expect(sources).toHaveLength(1);
        expect(sources[0]).toHaveLength(2);
        expect(sources[0][0]).toBe('slack.ts');
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
      });

      it('[Given] toolkits with tools and triggerTypes [Then] it returns a TypeScript source file for each toolkit + the index map', () => {
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

        const sources = generateTypeScriptToolkitSources(params)(index);
        expect(sources).toHaveLength(2);

        expect(sources[0]).toHaveLength(2);
        expect(sources[0][0]).toBe('gmail.ts');
        expect(sources[0][1]).toMatchInlineSnapshot(`
          "/**
           * Map of Composio's GMAIL toolkit.
           */
          export const GMAIL = {
            slug: "gmail",
            tools: {
              CREATE_EMAIL_DRAFT: "GMAIL_CREATE_EMAIL_DRAFT",
              DELETE_MESSAGE: "GMAIL_DELETE_MESSAGE",
              FETCH_EMAILS: "GMAIL_FETCH_EMAILS",
            },
            triggerTypes: {
              NEW_GMAIL_MESSAGE: "GMAIL_NEW_GMAIL_MESSAGE",
            },
          }
          "
        `);

        expect(sources[1]).toHaveLength(2);
        expect(sources[1][0]).toBe('slack.ts');
        expect(sources[1][1]).toMatchInlineSnapshot(`
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
      });
    });
  });
});
