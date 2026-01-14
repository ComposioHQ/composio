import path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { FileSystem } from '@effect/platform';
import { cli, TestLive } from 'test/__utils__';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import { NodeProcess } from 'src/services/node-process';
import {
  assertTranspiledTypeScriptIsValid,
  assertTypeScriptIsValid,
} from 'test/__utils__/typescript-compiler';
import { ComposioCorePkgNotFound } from 'src/effects/find-composio-core-generated';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import { TRIGGER_TYPES_GMAIL } from 'test/__mocks__/trigger-types-gmail';
import { TOOLS_TYPES_GMAIL } from 'test/__mocks__/tools-types-gmail';

describe('CLI: composio ts generate', () => {
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
                "import { type TriggerEvent } from "@composio/core"

                // ------------------- //
                //    Trigger types    //
                // ------------------- //



                /**
                 * Type of GMAIL's NEW_GMAIL_MESSAGE trigger payload.
                 */
                type GMAIL_NEW_GMAIL_MESSAGE_PAYLOAD = {
                  /**
                   * Attachment List
                   * @description The list of attachments in the message
                   * @default null
                   */
                  attachment_list: unknown[] | null;
                  /**
                   * Message ID
                   * @description The message ID of the message
                   * @default null
                   */
                  message_id: string | null;
                  /**
                   * Message Text
                   * @description The text of the message
                   * @default null
                   */
                  message_text: string | null;
                  /**
                   * Message Timestamp
                   * @description The timestamp of the message
                   * @default null
                   */
                  message_timestamp: string | null;
                  /**
                   * Payload
                   * @description The payload of the message
                   * @default null
                   */
                  payload: Record<string, never> | null;
                  /**
                   * Sender
                   * @description The sender of the message
                   * @default null
                   */
                  sender: string | null;
                  /**
                   * Subject
                   * @description The subject of the message
                   * @default null
                   */
                  subject: string | null;
                  /**
                   * Thread ID
                   * @description The thread ID of the message
                   * @default null
                   */
                  thread_id: string | null;
                  /**
                   * To
                   * @description The recipient of the message
                   * @default null
                   */
                  to: string | null;
                };

                /**
                 * Map of Composio's GMAIL toolkit.
                 */
                export const GMAIL = {
                  slug: "gmail",
                  tools: {},
                  triggerTypes: {
                    /**
                     * Triggers when a new message is received in Gmail.
                     */
                    NEW_GMAIL_MESSAGE: "GMAIL_NEW_GMAIL_MESSAGE",
                  },
                }

                /**
                 * Type map of all available trigger payloads for toolkit "GMAIL".
                 */
                export type GMAIL_TRIGGER_PAYLOADS = {
                  NEW_GMAIL_MESSAGE: GMAIL_NEW_GMAIL_MESSAGE_PAYLOAD
                }

                /**
                 * Type map of all available trigger events for toolkit "GMAIL".
                 */
                export type GMAIL_TRIGGER_EVENTS = {
                  NEW_GMAIL_MESSAGE: TriggerEvent<GMAIL_NEW_GMAIL_MESSAGE_PAYLOAD>
                }
                "
              `);
              expect(slackSourceCode).toMatchInlineSnapshot(`
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
              expect(indexSourceCode).toMatchInlineSnapshot(`
                "/**
                 * Auto-generated by Composio CLI. Do not modify manually.
                 */

                import { GMAIL } from "./gmail.mjs"
                import { SLACK } from "./slack.mjs"

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

              const testSourceCodePath = path.join(cwd, 'src', 'index.mjs');
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
                undefined
                "
              `);
            })
        );

        it.scoped('[Given] --type-tools [Then] it generates types for tools as well', () =>
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
            const args = ['ts', 'generate', '--type-tools'];
            yield* cli(args);

            const gmailSourceCode = yield* fs.readFileString(path.join(outputDir, 'gmail.ts'));
            const slackSourceCode = yield* fs.readFileString(path.join(outputDir, 'slack.ts'));
            const indexSourceCode = yield* fs.readFileString(path.join(outputDir, 'index.ts'));

            expect(gmailSourceCode).toMatchInlineSnapshot(`
              "import { type TriggerEvent } from "@composio/core"

              // --------------- //
              //    Tool types   //
              // --------------- //



              /**
               * Type map of all available tool input types for toolkit "GMAIL".
               */
              export type GMAIL_TOOL_INPUTS = {}

              /**
               * Type map of all available tool input types for toolkit "GMAIL".
               */
              export type GMAIL_TOOL_OUTPUTS = {}

              // ------------------- //
              //    Trigger types    //
              // ------------------- //



              /**
               * Type of GMAIL's NEW_GMAIL_MESSAGE trigger payload.
               */
              type GMAIL_NEW_GMAIL_MESSAGE_PAYLOAD = {
                /**
                 * Attachment List
                 * @description The list of attachments in the message
                 * @default null
                 */
                attachment_list: unknown[] | null;
                /**
                 * Message ID
                 * @description The message ID of the message
                 * @default null
                 */
                message_id: string | null;
                /**
                 * Message Text
                 * @description The text of the message
                 * @default null
                 */
                message_text: string | null;
                /**
                 * Message Timestamp
                 * @description The timestamp of the message
                 * @default null
                 */
                message_timestamp: string | null;
                /**
                 * Payload
                 * @description The payload of the message
                 * @default null
                 */
                payload: Record<string, never> | null;
                /**
                 * Sender
                 * @description The sender of the message
                 * @default null
                 */
                sender: string | null;
                /**
                 * Subject
                 * @description The subject of the message
                 * @default null
                 */
                subject: string | null;
                /**
                 * Thread ID
                 * @description The thread ID of the message
                 * @default null
                 */
                thread_id: string | null;
                /**
                 * To
                 * @description The recipient of the message
                 * @default null
                 */
                to: string | null;
              };

              /**
               * Map of Composio's GMAIL toolkit.
               */
              export const GMAIL = {
                slug: "gmail",
                tools: {},
                triggerTypes: {
                  /**
                   * Triggers when a new message is received in Gmail.
                   */
                  NEW_GMAIL_MESSAGE: "GMAIL_NEW_GMAIL_MESSAGE",
                },
              }

              /**
               * Type map of all available trigger payloads for toolkit "GMAIL".
               */
              export type GMAIL_TRIGGER_PAYLOADS = {
                NEW_GMAIL_MESSAGE: GMAIL_NEW_GMAIL_MESSAGE_PAYLOAD
              }

              /**
               * Type map of all available trigger events for toolkit "GMAIL".
               */
              export type GMAIL_TRIGGER_EVENTS = {
                NEW_GMAIL_MESSAGE: TriggerEvent<GMAIL_NEW_GMAIL_MESSAGE_PAYLOAD>
              }
              "
            `);
            expect(slackSourceCode).toMatchInlineSnapshot(`
                "// --------------- //
                //    Tool types   //
                // --------------- //



                /**
                 * Type map of all available tool input types for toolkit "SLACK".
                 */
                export type SLACK_TOOL_INPUTS = {}

                /**
                 * Type map of all available tool input types for toolkit "SLACK".
                 */
                export type SLACK_TOOL_OUTPUTS = {}

                // ------------------- //
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
            expect(indexSourceCode).toMatchInlineSnapshot(`
                "/**
                 * Auto-generated by Composio CLI. Do not modify manually.
                 */

                import { GMAIL } from "./gmail.mjs"
                import { SLACK } from "./slack.mjs"

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

            const testSourceCodePath = path.join(cwd, 'src', 'index.mjs');
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
              undefined
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
                "import { type TriggerEvent } from "@composio/core"

                // ------------------- //
                //    Trigger types    //
                // ------------------- //



                /**
                 * Type of GMAIL's NEW_GMAIL_MESSAGE trigger payload.
                 */
                type GMAIL_NEW_GMAIL_MESSAGE_PAYLOAD = {
                  /**
                   * Attachment List
                   * @description The list of attachments in the message
                   * @default null
                   */
                  attachment_list: unknown[] | null;
                  /**
                   * Message ID
                   * @description The message ID of the message
                   * @default null
                   */
                  message_id: string | null;
                  /**
                   * Message Text
                   * @description The text of the message
                   * @default null
                   */
                  message_text: string | null;
                  /**
                   * Message Timestamp
                   * @description The timestamp of the message
                   * @default null
                   */
                  message_timestamp: string | null;
                  /**
                   * Payload
                   * @description The payload of the message
                   * @default null
                   */
                  payload: Record<string, never> | null;
                  /**
                   * Sender
                   * @description The sender of the message
                   * @default null
                   */
                  sender: string | null;
                  /**
                   * Subject
                   * @description The subject of the message
                   * @default null
                   */
                  subject: string | null;
                  /**
                   * Thread ID
                   * @description The thread ID of the message
                   * @default null
                   */
                  thread_id: string | null;
                  /**
                   * To
                   * @description The recipient of the message
                   * @default null
                   */
                  to: string | null;
                };

                /**
                 * Map of Composio's GMAIL toolkit.
                 */
                export const GMAIL = {
                  slug: "gmail",
                  tools: {},
                  triggerTypes: {
                    /**
                     * Triggers when a new message is received in Gmail.
                     */
                    NEW_GMAIL_MESSAGE: "GMAIL_NEW_GMAIL_MESSAGE",
                  },
                }

                /**
                 * Type map of all available trigger payloads for toolkit "GMAIL".
                 */
                export type GMAIL_TRIGGER_PAYLOADS = {
                  NEW_GMAIL_MESSAGE: GMAIL_NEW_GMAIL_MESSAGE_PAYLOAD
                }

                /**
                 * Type map of all available trigger events for toolkit "GMAIL".
                 */
                export type GMAIL_TRIGGER_EVENTS = {
                  NEW_GMAIL_MESSAGE: TriggerEvent<GMAIL_NEW_GMAIL_MESSAGE_PAYLOAD>
                }
                "
              `);
              expect(slackSourceCode).toMatchInlineSnapshot(`
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
              expect(indexSourceCode).toMatchInlineSnapshot(`
                "/**
                 * Auto-generated by Composio CLI. Do not modify manually.
                 */

                import { GMAIL } from "./gmail.mjs"
                import { SLACK } from "./slack.mjs"

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

            // Should have both .ts and .mjs files
            const tsFiles = fileNames.filter(
              name => name.endsWith('.ts') && !name.endsWith('.d.ts')
            );
            const mjsFiles = fileNames.filter(name => name.endsWith('.mjs'));
            const dtsFiles = fileNames.filter(name => name.endsWith('.d.ts'));

            expect(tsFiles.length).toBeGreaterThan(0);
            expect(mjsFiles.length).toBeGreaterThan(0);
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

            // Should have both .ts and .mjs files since compiled is true by default for @composio/core/generated
            const tsFiles = fileNames.filter(
              name => name.endsWith('.ts') && !name.endsWith('.d.ts')
            );
            const mjsFiles = fileNames.filter(name => name.endsWith('.mjs'));
            const dtsFiles = fileNames.filter(name => name.endsWith('.d.ts'));

            expect(tsFiles.length).toBeGreaterThan(0);
            expect(mjsFiles.length).toBeGreaterThan(0);
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
              const mjsFiles = fileNames.filter(name => name.endsWith('.mjs'));

              expect(tsFiles.length).toBeGreaterThan(0);
              expect(mjsFiles.length).toBe(0);
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

              import { GMAIL } from "./gmail.mjs"
              import { SLACK } from "./slack.mjs"

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

        it.scoped(
          '[Given] --toolkits gmail [Then] it generates type stubs only for the gmail toolkit',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-filtered');

              const args = ['ts', 'generate', '--toolkits', 'gmail', '--output-dir', outputDir];
              yield* cli(args);

              // Check generated files - only gmail.ts and index.ts should exist
              const files = yield* fs.readDirectory(outputDir);
              const fileNames = files.map(file => path.basename(file));

              expect(fileNames).toContain('gmail.ts');
              expect(fileNames).toContain('index.ts');
              expect(fileNames).not.toContain('slack.ts');

              // Verify index only references gmail
              const indexSourceCode = yield* fs.readFileString(path.join(outputDir, 'index.ts'));
              expect(indexSourceCode).toContain('GMAIL');
              expect(indexSourceCode).not.toContain('SLACK');

              assertTypeScriptIsValid({ files: { './index.ts': indexSourceCode } });
            })
        );

        it.scoped(
          '[Given] --toolkits gmail --toolkits slack [Then] it generates type stubs for both toolkits',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-multi-filtered');

              const args = [
                'ts',
                'generate',
                '--toolkits',
                'gmail',
                '--toolkits',
                'slack',
                '--output-dir',
                outputDir,
              ];
              yield* cli(args);

              // Check generated files - both gmail.ts and slack.ts should exist
              const files = yield* fs.readDirectory(outputDir);
              const fileNames = files.map(file => path.basename(file));

              expect(fileNames).toContain('gmail.ts');
              expect(fileNames).toContain('slack.ts');
              expect(fileNames).toContain('index.ts');

              // Verify index references both
              const indexSourceCode = yield* fs.readFileString(path.join(outputDir, 'index.ts'));
              expect(indexSourceCode).toContain('GMAIL');
              expect(indexSourceCode).toContain('SLACK');

              assertTypeScriptIsValid({ files: { './index.ts': indexSourceCode } });
            })
        );

        it.scoped('[Given] --toolkits with invalid toolkit [Then] it fails with an error', () =>
          Effect.gen(function* () {
            const process = yield* NodeProcess;
            const cwd = process.cwd;
            const outputDir = path.join(cwd, 'generated-invalid');

            const args = ['ts', 'generate', '--toolkits', 'nonexistent', '--output-dir', outputDir];
            const result = yield* cli(args).pipe(Effect.catchAll(e => Effect.succeed(e)));

            expect(result).toBeInstanceOf(Error);
            expect((result as Error).message).toContain('Invalid toolkit(s): nonexistent');
          })
        );

        it.scoped(
          '[Given] --toolkits GMAIL (uppercase) [Then] it handles case-insensitive matching',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-uppercase');

              const args = ['ts', 'generate', '--toolkits', 'GMAIL', '--output-dir', outputDir];
              yield* cli(args);

              // Check generated files - only gmail.ts should exist
              const files = yield* fs.readDirectory(outputDir);
              const fileNames = files.map(file => path.basename(file));

              expect(fileNames).toContain('gmail.ts');
              expect(fileNames).not.toContain('slack.ts');
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
