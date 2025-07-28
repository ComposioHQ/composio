import path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { FileSystem } from '@effect/platform';
import { cli, TestLive } from 'test/__utils__';
import { makeTestToolkit } from 'test/__utils__/models/toolkits';
import { NodeProcess } from 'src/services/node-process';
import {
  assertTranspiledTypeScriptIsValid,
  assertTypeScriptIsValid,
} from 'test/__utils__/typescript-compiler';
import { ComposioCorePkgNotFound } from 'src/effects/find-composio-core-generated';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

describe('CLI: composio ts generate', () => {
  const TOOLKIT_GMAIL = makeTestToolkit({
    name: 'Gmail',
    slug: 'gmail',
  });
  const TOOLKIT_SLACK = makeTestToolkit({
    name: 'Slack',
    slug: 'slack',
  });

  const appClientData = {
    toolkits: [TOOLKIT_GMAIL, TOOLKIT_SLACK],
    tools: ['GMAIL_CREATE_EMAIL_DRAFT', 'GMAIL_DELETE_MESSAGE', 'GMAIL_FETCH_EMAILS'],
    triggerTypesAsEnums: ['GMAIL_NEW_GMAIL_MESSAGE'],
    triggerTypes: [
      {
        config: {
          properties: {
            interval: {
              default: 1,
              description: 'Periodic Interval to Check for Updates & Send a Trigger in Minutes',
              title: 'Interval',
              type: 'number',
            },
            labelIds: {
              default: 'INBOX',
              description:
                "Filter messages by a single label ID. Labels identify the status or category of messages. Supported labels include 'INBOX', 'SPAM', 'TRASH', 'UNREAD', 'STARRED', 'IMPORTANT', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', and 'CATEGORY_FORUMS'. For complex label filtering, use the 'query' parameter instead.",
              examples: ['INBOX', 'UNREAD', 'STARRED'],
              title: 'Labelids',
              type: 'string',
            },
            query: {
              default: '',
              description:
                "Advanced Gmail search using the same syntax as Gmail's search box. Use 'AND' for messages that match all conditions, 'OR' for any condition. Search by sender (from:email@domain.com), labels (label:inbox), status (is:unread), attachments (has:attachment), dates (after:2023/1/1), and more. If specified, this takes precedence over labelIds.",
              examples: [
                'label:inbox OR label:sent',
                'from:example@gmail.com is:unread',
                'has:attachment after:2023/1/1',
                'is:important is:unread',
              ],
              title: 'Query',
              type: 'string',
            },
            userId: {
              default: 'me',
              description: "The user's email address or 'me' for the authenticated user.",
              examples: ['me'],
              title: 'Userid',
              type: 'string',
            },
          },
          title: 'NewMessageConfig',
          type: 'object',
        },
        description: 'Triggers when a new message is received in Gmail.',
        instructions:
          "\n    **Instructions for Setting Up the Trigger:**\n\n    - Ensure that the Gmail API is enabled for your Google account.\n    - Provide the user ID (usually 'me' for the authenticated user).\n    - Optionally, provide label IDs to filter messages.\n    ",
        name: 'New Gmail Message Received Trigger',
        payload: {
          properties: {
            attachment_list: {
              anyOf: [
                {
                  items: {},
                  type: 'array',
                },
                {
                  type: 'null',
                },
              ],
              default: null,
              description: 'The list of attachments in the message',
              title: 'Attachment List',
            },
            message_id: {
              anyOf: [
                {
                  type: 'string',
                },
                {
                  type: 'null',
                },
              ],
              default: null,
              description: 'The message ID of the message',
              title: 'Message ID',
            },
            message_text: {
              anyOf: [
                {
                  type: 'string',
                },
                {
                  type: 'null',
                },
              ],
              default: null,
              description: 'The text of the message',
              title: 'Message Text',
            },
            message_timestamp: {
              anyOf: [
                {
                  type: 'string',
                },
                {
                  type: 'null',
                },
              ],
              default: null,
              description: 'The timestamp of the message',
              title: 'Message Timestamp',
            },
            payload: {
              anyOf: [
                {
                  type: 'object',
                },
                {
                  type: 'null',
                },
              ],
              default: null,
              description: 'The payload of the message',
              title: 'Payload',
            },
            sender: {
              anyOf: [
                {
                  type: 'string',
                },
                {
                  type: 'null',
                },
              ],
              default: null,
              description: 'The sender of the message',
              title: 'Sender',
            },
            subject: {
              anyOf: [
                {
                  type: 'string',
                },
                {
                  type: 'null',
                },
              ],
              default: null,
              description: 'The subject of the message',
              title: 'Subject',
            },
            thread_id: {
              anyOf: [
                {
                  type: 'string',
                },
                {
                  type: 'null',
                },
              ],
              default: null,
              description: 'The thread ID of the message',
              title: 'Thread ID',
            },
            to: {
              anyOf: [
                {
                  type: 'string',
                },
                {
                  type: 'null',
                },
              ],
              default: null,
              description: 'The recipient of the message',
              title: 'To',
            },
          },
          title: 'NewMessagePayload',
          type: 'object',
        },
        slug: 'GMAIL_NEW_GMAIL_MESSAGE',
        type: 'poll',
      },
    ],
  } satisfies TestLiveInput['toolkitsData'];

  describe('[Given] valid fetched app data', () => {
    layer(
      TestLive({
        fixture: 'typescript-project-with-composio-core',
        toolkitsData: appClientData,
      })
    )(it => {
      describe('[Given] `@composio/core` already installed', () => {
        it.scoped(
          '[Given] no args [Then] it generates types + JS in `node_modules/@composio/core/generated`',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;

              // Create the @composio/core/generated directory structure as if installed
              const nodeModulesDir = path.join(cwd, 'node_modules', '@composio', 'core');
              const generatedDir = path.join(nodeModulesDir, 'generated');
              yield* fs.makeDirectory(nodeModulesDir, { recursive: true });
              yield* fs.makeDirectory(generatedDir, { recursive: true });

              const outputDir = path.join(cwd, 'node_modules', '@composio', 'core', 'generated');
              const args = ['ts', 'generate'];
              yield* cli(args);

              const gmailSourceCode = yield* fs.readFileString(path.join(outputDir, 'gmail.ts'));
              const slackSourceCode = yield* fs.readFileString(path.join(outputDir, 'slack.ts'));
              const indexSourceCode = yield* fs.readFileString(path.join(outputDir, 'index.ts'));

              expect(gmailSourceCode).toMatchInlineSnapshot(`
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
              expect(slackSourceCode).toMatchInlineSnapshot(`
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
              expect(indexSourceCode).toMatchInlineSnapshot(`
                "/**
                 * Auto-generated by Composio CLI. Do not modify manually.
                 */

                import { GMAIL } from "./gmail.js"
                import { SLACK } from "./slack.js"

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

              assertTypeScriptIsValid({ files: { './gmail.ts': gmailSourceCode } });
              assertTypeScriptIsValid({ files: { './slack.ts': slackSourceCode } });
              assertTypeScriptIsValid({
                files: {
                  './index.ts': indexSourceCode,
                  './gmail.ts': gmailSourceCode,
                  './slack.ts': slackSourceCode,
                },
              });

              const testSourceCodePath = path.join(cwd, 'src', 'index.js');
              const testSourceCode = yield* fs.readFileString(testSourceCodePath);
              expect(testSourceCode).toMatchInlineSnapshot(`
                "import { Toolkits } from '@composio/core/generated';

                console.log('Test: Using generated Composio types');
                console.log(Toolkits.GMAIL.tools.CREATE_EMAIL_DRAFT);
                "
              `);

              const stdout = yield* assertTranspiledTypeScriptIsValid({ cwd, testSourceCodePath });
              expect(stdout).toMatchInlineSnapshot(`
                "Test: Using generated Composio types
                GMAIL_CREATE_EMAIL_DRAFT
                "
              `);
            })
        );

        it.scoped(
          '[Given] --output-dir [Then] it generates type stubs relative to the given output directory',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;

              const outputDir = path.join(cwd, '.generated', 'composio-ts');

              const args = ['ts', 'generate', '--output-dir', outputDir];
              yield* cli(args);

              const gmailSourceCode = yield* fs.readFileString(path.join(outputDir, 'gmail.ts'));
              const slackSourceCode = yield* fs.readFileString(path.join(outputDir, 'slack.ts'));
              const indexSourceCode = yield* fs.readFileString(path.join(outputDir, 'index.ts'));

              expect(gmailSourceCode).toMatchInlineSnapshot(`
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
              expect(slackSourceCode).toMatchInlineSnapshot(`
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
              expect(indexSourceCode).toMatchInlineSnapshot(`
                "/**
                 * Auto-generated by Composio CLI. Do not modify manually.
                 */

                import { GMAIL } from "./gmail.js"
                import { SLACK } from "./slack.js"

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

              assertTypeScriptIsValid({ files: { './gmail.ts': gmailSourceCode } });
              assertTypeScriptIsValid({ files: { './slack.ts': slackSourceCode } });
              assertTypeScriptIsValid({
                files: {
                  './index.ts': indexSourceCode,
                  './gmail.ts': gmailSourceCode,
                  './slack.ts': slackSourceCode,
                },
              });
            })
        );

        it.scoped('[Given] --compact [Then] it generates type stubs in a single file', () =>
          Effect.gen(function* () {
            const process = yield* NodeProcess;
            const cwd = process.cwd;
            const fs = yield* FileSystem.FileSystem;
            const outputDir = path.join(cwd, 'generated-single');

            const args = ['ts', 'generate', '--compact', '--output-dir', outputDir];
            yield* cli(args);

            // Check if the output directory contains the expected files
            const files = yield* fs.readDirectory(outputDir);
            const fileNames = files.map(file => path.basename(file));

            // Should only have index.ts and no other .ts files
            const tsFiles = fileNames.filter(name => name.endsWith('.ts'));
            expect(tsFiles).toContain('index.ts');
            expect(tsFiles.length).toBe(1);

            // Verify the file content
            const content = yield* fs.readFileString(path.join(outputDir, 'index.ts'));
            expect(content).toContain('Auto-generated by Composio CLI');
            expect(content).toContain('export const GMAIL');
            expect(content).toContain('export const SLACK');
          })
        );

        it.scoped('[Given] --transpiled [Then] it generates both .ts and .js files', () =>
          Effect.gen(function* () {
            const process = yield* NodeProcess;
            const cwd = process.cwd;
            const fs = yield* FileSystem.FileSystem;
            const outputDir = path.join(cwd, 'generated-compiled');

            const args = ['ts', 'generate', '--transpiled', '--output-dir', outputDir];
            yield* cli(args);

            // Check if the output directory contains both .ts and .js files
            const files = yield* fs.readDirectory(outputDir);
            const fileNames = files.map(file => path.basename(file));

            // Should have both .ts and .js files
            const tsFiles = fileNames.filter(name => name.endsWith('.ts'));
            const jsFiles = fileNames.filter(name => name.endsWith('.js'));
            const dtsFiles = fileNames.filter(name => name.endsWith('.d.ts'));

            expect(tsFiles.length).toBeGreaterThan(0);
            expect(jsFiles.length).toBeGreaterThan(0);
            expect(dtsFiles.length).toBeGreaterThan(0);

            // Verify the files are valid TypeScript
            for (const file of tsFiles) {
              const filePath = path.join(outputDir, file);
              assertTypeScriptIsValid({ files: { './index.ts': filePath } });
            }
          })
        );

        it.scoped('[Given] no `--output-dir` [Then] it compiles by default', () =>
          Effect.gen(function* () {
            const process = yield* NodeProcess;
            const cwd = process.cwd;
            const fs = yield* FileSystem.FileSystem;

            // Set up @composio/core/generated directory
            const nodeModulesDir = path.join(cwd, 'node_modules', '@composio', 'core');
            const generatedDir = path.join(nodeModulesDir, 'generated');
            yield* fs.makeDirectory(nodeModulesDir, { recursive: true });
            yield* fs.makeDirectory(generatedDir, { recursive: true });

            const args = ['ts', 'generate'];
            yield* cli(args);

            // Check if the output directory contains both .ts and .js files
            const files = yield* fs.readDirectory(generatedDir);
            const fileNames = files.map(file => path.basename(file));

            // Should have both .ts and .js files since compiled is true by default for @composio/core/generated
            const tsFiles = fileNames.filter(name => name.endsWith('.ts'));
            const jsFiles = fileNames.filter(name => name.endsWith('.js'));
            const dtsFiles = fileNames.filter(name => name.endsWith('.d.ts'));

            expect(tsFiles.length).toBeGreaterThan(0);
            expect(jsFiles.length).toBeGreaterThan(0);
            expect(dtsFiles.length).toBeGreaterThan(0);
          })
        );

        it.scoped(
          '[Given] `--output-dir` with no `--transpiled` [Then] it does not generate .js files',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-no-compile');

              const args = ['ts', 'generate', '--output-dir', outputDir];
              yield* cli(args);

              // Check if the output directory contains only .ts files
              const files = yield* fs.readDirectory(outputDir);
              const fileNames = files.map(file => path.basename(file));

              // Should have .ts files but no .js files
              const tsFiles = fileNames.filter(name => name.endsWith('.ts'));
              const jsFiles = fileNames.filter(name => name.endsWith('.js'));

              expect(tsFiles.length).toBeGreaterThan(0);
              expect(jsFiles.length).toBe(0);
            })
        );

        it.scoped('[Given] `--compact` [Then] it generates in the correct location', () =>
          Effect.gen(function* () {
            const process = yield* NodeProcess;
            const cwd = process.cwd;
            const fs = yield* FileSystem.FileSystem;

            // Run the command
            const args = ['ts', 'generate', '--compact'];
            yield* cli(args);

            // Verify the output
            const outputDir = path.join(cwd, '.generated', 'composio-ts');
            const fileExists = yield* fs.exists(path.join(outputDir, 'index.ts'));
            expect(fileExists).toBe(true);

            const indexSourceCode = yield* fs.readFileString(path.join(outputDir, 'index.ts'));
            expect(indexSourceCode).toMatchInlineSnapshot(`
              "/**
               * Auto-generated by Composio CLI. Do not modify manually.
               */

              import { GMAIL } from "./gmail.js"
              import { SLACK } from "./slack.js"

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

            assertTypeScriptIsValid({ files: { './index.ts': indexSourceCode } });
          })
        );
      });
    });

    describe('[Given] `@composio/core` not installed', () => {
      layer(
        TestLive({
          fixture: 'typescript-project',
          toolkitsData: appClientData,
        })
      )(it => {
        it.scoped('[Given] no custom output dir [Then] [Then] it raises an error', () =>
          Effect.gen(function* () {
            const args = ['ts', 'generate'];

            const result = yield* cli(args).pipe(Effect.catchAll(e => Effect.succeed(e)));

            expect(result).toEqual(
              new ComposioCorePkgNotFound({
                message: '@composio/core not found',
                cause: '@composio/core not installed',
                fix: 'Install @composio/core with `npm install -S @composio/core`, or specify an output directory using `--output-dir`',
              })
            );
          })
        );
      });
    });
  });
});
