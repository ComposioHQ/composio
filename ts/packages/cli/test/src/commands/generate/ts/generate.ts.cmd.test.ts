import path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import * as FileSystem from 'effect/FileSystem';
import { cli, liveEnvConfigProvider, TestLive } from 'test/__utils__';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import { NodeProcess } from 'src/services/node-process';
import {
  assertTranspiledTypeScriptIsValid,
  assertTypeScriptIsValid,
} from 'test/__utils__/typescript-compiler';
import { ComposioCorePkgNotFound } from 'src/effects/find-composio-core-generated';
import { CommandInputError } from 'src/commands/errors';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import { TRIGGER_TYPES_GMAIL } from 'test/__mocks__/trigger-types-gmail';
import { TOOLS_TYPES_GMAIL } from 'test/__mocks__/tools-types-gmail';

describe('CLI: composio generate ts', () => {
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

  const setupMockComposioCorePackage = ({
    cwd,
    fs,
    withGenerated = false,
  }: {
    cwd: string;
    fs: FileSystem.FileSystem;
    withGenerated?: boolean;
  }) =>
    Effect.gen(function* () {
      const nodeModulesRoot = path.join(cwd, 'node_modules');
      const nodeModulesDir = path.join(nodeModulesRoot, '@composio', 'core');

      // Some fixtures may carry broken node_modules links after copying; reset to a real directory.
      yield* fs.remove(nodeModulesRoot, { recursive: true }).pipe(Effect.catch(() => Effect.void));
      yield* fs.makeDirectory(nodeModulesDir, { recursive: true });

      if (withGenerated) {
        yield* fs.makeDirectory(path.join(nodeModulesDir, 'generated'), { recursive: true });
      }

      // Create a mock package.json to resolve @composio/core imports in transpilation paths.
      yield* fs.writeFileString(
        path.join(nodeModulesDir, 'package.json'),
        JSON.stringify(
          {
            name: '@composio/core',
            type: 'module',
            exports: {
              '.': {
                types: './index.d.ts',
                default: './index.js',
              },
              './generated': {
                types: './generated/index.d.ts',
                default: './generated/index.js',
              },
            },
          },
          null,
          2
        )
      );

      yield* fs.writeFileString(
        path.join(nodeModulesDir, 'index.d.ts'),
        'export type TriggerEvent<T> = { payload: T };'
      );
      yield* fs.writeFileString(path.join(nodeModulesDir, 'index.js'), 'export {};');
    });

  const readGeneratedTypeScriptFiles = ({
    fs,
    outputDir,
  }: {
    fs: FileSystem.FileSystem;
    outputDir: string;
  }) =>
    Effect.gen(function* () {
      const files = yield* fs.readDirectory(outputDir);
      const tsFiles = files
        .map(file => path.basename(file))
        .filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts'));

      const sources = yield* Effect.all(
        tsFiles.map(file =>
          fs
            .readFileString(path.join(outputDir, file))
            .pipe(Effect.map(content => [`./${file}`, content] as const))
        ),
        { concurrency: 'unbounded' }
      );

      return Object.fromEntries(sources);
    });

  describe('[Given] valid fetched app data', () => {
    layer(
      TestLive({
        fixture: 'typescript-project-with-composio-core',
        toolkitsData: appClientData,
      })
    )(it => {
      describe('[Given] `@composio/core` already installed', () => {
        it.effect(
          '[Given] no args [Then] it generates types + JS in `node_modules/@composio/core/generated`',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;

              yield* setupMockComposioCorePackage({ cwd, fs, withGenerated: true });

              const outputDir = path.join(cwd, 'node_modules', '@composio', 'core', 'generated');
              const args = ['generate', 'ts'];
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
                   */
                  attachment_list?: unknown[];
                  /**
                   * Id
                   * @description The raw Gmail message ID
                   */
                  id?: string;
                  /**
                   * Label Ids
                   * @description The Gmail label IDs applied to the message
                   */
                  label_ids?: string[];
                  /**
                   * Message Id
                   * @description The message ID of the message
                   */
                  message_id?: string;
                  /**
                   * Message Text
                   * @description The text of the message
                   */
                  message_text?: string;
                  /**
                   * Message Timestamp
                   * @description The timestamp of the message
                   */
                  message_timestamp?: string;
                  /**
                   * Payload
                   * @description The payload of the message
                   */
                  payload?: {
                      [key: string]: unknown;
                  };
                  /**
                   * Preview
                   * @description The preview payload of the message
                   */
                  preview?: {
                      [key: string]: unknown;
                  };
                  /**
                   * Sender
                   * @description The sender of the message
                   */
                  sender?: string;
                  /**
                   * Subject
                   * @description The subject of the message
                   */
                  subject?: string;
                  /**
                   * Thread Id
                   * @description The thread ID of the message
                   */
                  thread_id?: string;
                  /**
                   * To
                   * @description The recipient of the message
                   */
                  to?: string;
                };

                /**
                 * Map of Composio's GMAIL toolkit.
                 */
                export const GMAIL = {
                  slug: "gmail",
                  tools: {
                    ADD_LABEL_TO_EMAIL: "GMAIL_ADD_LABEL_TO_EMAIL",
                    BATCH_DELETE_MESSAGES: "GMAIL_BATCH_DELETE_MESSAGES",
                    BATCH_MODIFY_MESSAGES: "GMAIL_BATCH_MODIFY_MESSAGES",
                  },
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

        it.effect('[Given] --type-tools [Then] it generates types for tools as well', () =>
          Effect.gen(function* () {
            const process = yield* NodeProcess;
            const cwd = process.cwd;
            const fs = yield* FileSystem.FileSystem;

            yield* setupMockComposioCorePackage({ cwd, fs, withGenerated: true });

            const outputDir = path.join(cwd, 'node_modules', '@composio', 'core', 'generated');
            const args = ['generate', 'ts', '--type-tools'];
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
               * Type of GMAIL's GMAIL_ADD_LABEL_TO_EMAIL tool input.
               */
              type GMAIL_ADD_LABEL_TO_EMAIL_INPUT = {
                /**
                 * User Id
                 * @description User's email address or 'me' for the authenticated user.
                 * @default me
                 * @example me
                 * @example user@example.com
                 */
                user_id: string;
                /**
                 * Message Id
                 * @description Immutable ID of the message to modify. Gmail message IDs are hexadecimal strings (e.g., '1a2b3c4d5e6f7890'). IMPORTANT: Do NOT use UUIDs (32-character strings like '093ca4662b214d5eba8f4ceeaad63433'), thread IDs, or internal system IDs - these will cause 'Invalid id value' errors. Obtain valid message IDs from: (1) 'GMAIL_FETCH_EMAILS' response 'messageId' field, (2) 'GMAIL_FETCH_MESSAGE_BY_THREAD_ID' response, or (3) 'GMAIL_LIST_THREADS' and then fetching thread messages.
                 * @example 1a2b3c4d5e6f7890
                 * @example abcd1234efab5678
                 */
                message_id?: string;
                /**
                 * Add Label Ids
                 * @description Label IDs to add (IDs, not display names). System labels: INBOX, SPAM, TRASH, UNREAD, STARRED, IMPORTANT, CATEGORY_PERSONAL, CATEGORY_SOCIAL, CATEGORY_PROMOTIONS, CATEGORY_UPDATES, CATEGORY_FORUMS. Use full CATEGORY_ prefix (e.g., 'CATEGORY_UPDATES' not 'UPDATES'). Custom labels: call 'listLabels' first to get the ID (format: 'Label_<number>'). Do NOT use the label display name; the API requires the ID. SENT, DRAFT, CHAT are immutable and cannot be added or removed. A label cannot appear in both add_label_ids and remove_label_ids.
                 * @default []
                 * @example STARRED
                 * @example IMPORTANT
                 * @example CATEGORY_UPDATES
                 * @example Label_1
                 */
                add_label_ids: string[];
                /**
                 * Remove Label Ids
                 * @description Label IDs to remove (IDs, not display names). System labels: INBOX, SPAM, TRASH, UNREAD, STARRED, IMPORTANT, CATEGORY_PERSONAL, CATEGORY_SOCIAL, CATEGORY_PROMOTIONS, CATEGORY_UPDATES, CATEGORY_FORUMS. Use full CATEGORY_ prefix (e.g., 'CATEGORY_UPDATES' not 'UPDATES'). Custom labels: call 'listLabels' first to get the ID (format: 'Label_<number>'). SENT, DRAFT, CHAT are immutable and cannot be removed. Common operations: to mark as read, remove 'UNREAD'; to archive, remove 'INBOX'. A label cannot appear in both add_label_ids and remove_label_ids.
                 * @default []
                 * @example UNREAD
                 * @example INBOX
                 * @example CATEGORY_UPDATES
                 * @example Label_1
                 */
                remove_label_ids: string[];
              };

              /**
               * Type of GMAIL's GMAIL_ADD_LABEL_TO_EMAIL tool output.
               */
              type GMAIL_ADD_LABEL_TO_EMAIL_OUTPUT = {
                /**
                 * Data
                 * @description Data from the action execution
                 */
                data?: {
                    /**
                     * Id
                     * @description The immutable ID of the sent message.
                     */
                    id?: string;
                    /**
                     * Raw
                     * @description The entire email message in RFC 2822 format, base64url-encoded.
                     */
                    raw?: string;
                    /**
                     * Payload
                     * @description The parsed email structure, including headers and body parts.
                     */
                    payload?: {
                        [key: string]: unknown;
                    };
                    /**
                     * Snippet
                     * @description A short extract of the message text.
                     */
                    snippet?: string;
                    /**
                     * Label Ids
                     * @description List of IDs of labels applied to this message.
                     */
                    labelIds?: string[];
                    /**
                     * Thread Id
                     * @description The ID of the thread the message belongs to.
                     */
                    threadId?: string;
                    /**
                     * History Id
                     * @description The ID of the last history record that modified this message.
                     */
                    historyId?: string;
                    /**
                     * Display Url
                     * @description Web UI link for this resource - set by each action's execute().
                     */
                    display_url?: string;
                    /**
                     * Internal Date
                     * @description The internal timestamp of the message in milliseconds since epoch.
                     */
                    internalDate?: string;
                    /**
                     * Size Estimate
                     * @description Estimated size of the message in bytes.
                     */
                    sizeEstimate?: number;
                };
                /**
                 * Error
                 * @description Error if any occurred during the execution of the action
                 */
                error?: string;
                /**
                 * Successful
                 * @description Whether or not the action execution was successful or not
                 */
                successful?: boolean;
              };

              /**
               * Type of GMAIL's GMAIL_BATCH_DELETE_MESSAGES tool input.
               */
              type GMAIL_BATCH_DELETE_MESSAGES_INPUT = {
                /**
                 * User Id
                 * @description User's email address or 'me' for the authenticated user.
                 * @default me
                 * @example me
                 * @example user@example.com
                 */
                userId: string;
                /**
                 * Message Ids
                 * @description List of Gmail message IDs to delete. Each ID must be a hexadecimal string (e.g., '18c5f5d1a2b3c4d5'). Obtain IDs from actions like GMAIL_FETCH_EMAILS or GMAIL_LIST_THREADS - do not use human-readable descriptions.
                 * @example [
                 *       "18c5f5d1a2b3c4d5",
                 *       "18c5f5d1a2b3c4d6"
                 *     ]
                 */
                messageIds?: string[];
              };

              /**
               * Type of GMAIL's GMAIL_BATCH_DELETE_MESSAGES tool output.
               */
              type GMAIL_BATCH_DELETE_MESSAGES_OUTPUT = {
                /**
                 * Data
                 * @description Data from the action execution
                 */
                data?: {
                    /**
                     * Message
                     * @description Details about the deletion operation
                     */
                    message: string;
                    /**
                     * Success
                     * @description Whether the bulk deletion was successful
                     */
                    success: boolean;
                    /**
                     * Display Url
                     * @description Web UI link for this resource - clickable URL pointing to the Gmail web interface
                     */
                    display_url?: string;
                };
                /**
                 * Error
                 * @description Error if any occurred during the execution of the action
                 */
                error?: string;
                /**
                 * Successful
                 * @description Whether or not the action execution was successful or not
                 */
                successful?: boolean;
              };

              /**
               * Type of GMAIL's GMAIL_BATCH_MODIFY_MESSAGES tool input.
               */
              type GMAIL_BATCH_MODIFY_MESSAGES_INPUT = {
                /**
                 * User Id
                 * @description User's email address or 'me' for the authenticated user.
                 * @default me
                 * @example me
                 * @example user@example.com
                 */
                userId: string;
                /**
                 * Message Ids
                 * @description List of message IDs to modify. Maximum 1,000 message IDs per request. Get message IDs from GMAIL_FETCH_EMAILS or GMAIL_LIST_THREADS actions. Accepts 'messageIds', 'ids', or 'message_ids' as the parameter name.
                 * @example [
                 *       "18c5f5d1a2b3c4d5",
                 *       "18c5f5d1a2b3c4d6"
                 *     ]
                 * @example [
                 *       "msg_id_1",
                 *       "msg_id_2",
                 *       "msg_id_3"
                 *     ]
                 */
                messageIds?: string[];
                /**
                 * Add Label Ids
                 * @description List of label IDs to add to the messages. IMPORTANT: Use label IDs, NOT label display names. System labels use their name as ID: INBOX, STARRED, IMPORTANT, SENT, DRAFT, SPAM, TRASH, UNREAD, CATEGORY_PERSONAL, CATEGORY_SOCIAL, CATEGORY_PROMOTIONS, CATEGORY_UPDATES, CATEGORY_FORUMS. Custom labels MUST use their ID (format: 'Label_XXX', e.g., 'Label_1', 'Label_25'), NOT the display name (e.g., do NOT use 'Work' or 'Projects'). Call GMAIL_LIST_LABELS first to get the 'id' field for custom labels. At least one of add_label_ids or remove_label_ids must be provided. CONSTRAINT: Label IDs must NOT overlap with remove_label_ids - cannot add and remove the same label.
                 * @example [
                 *       "INBOX",
                 *       "STARRED"
                 *     ]
                 * @example [
                 *       "Label_1",
                 *       "Label_25"
                 *     ]
                 * @example [
                 *       "IMPORTANT",
                 *       "Label_10"
                 *     ]
                 */
                addLabelIds?: string[];
                /**
                 * Remove Label Ids
                 * @description List of label IDs to remove from the messages. IMPORTANT: Use label IDs, NOT label display names. System labels use their name as ID: INBOX, STARRED, IMPORTANT, SENT, SPAM, TRASH, UNREAD. Custom labels MUST use their ID (format: 'Label_XXX', e.g., 'Label_1', 'Label_25'), NOT the display name (e.g., do NOT use 'Work' or 'Projects'). Call GMAIL_LIST_LABELS first to get the 'id' field for custom labels. Common use cases: Remove 'UNREAD' to mark as read, remove 'INBOX' to archive. Note: 'DRAFT' cannot be removed - use GMAIL_DELETE_DRAFT instead. At least one of add_label_ids or remove_label_ids must be provided. CONSTRAINT: Label IDs must NOT overlap with add_label_ids - cannot add and remove the same label.
                 * @example [
                 *       "UNREAD"
                 *     ]
                 * @example [
                 *       "INBOX",
                 *       "UNREAD"
                 *     ]
                 * @example [
                 *       "Label_1",
                 *       "SPAM"
                 *     ]
                 */
                removeLabelIds?: string[];
              };

              /**
               * Type of GMAIL's GMAIL_BATCH_MODIFY_MESSAGES tool output.
               */
              type GMAIL_BATCH_MODIFY_MESSAGES_OUTPUT = {
                /**
                 * Data
                 * @description Data from the action execution
                 */
                data?: {
                    /**
                     * Message
                     * @description Status message
                     */
                    message: string;
                    /**
                     * Success
                     * @description Whether the batch modification was successful
                     */
                    success: boolean;
                    /**
                     * Display Url
                     * @description Web UI link for this resource - set by each action's execute().
                     */
                    display_url?: string;
                };
                /**
                 * Error
                 * @description Error if any occurred during the execution of the action
                 */
                error?: string;
                /**
                 * Successful
                 * @description Whether or not the action execution was successful or not
                 */
                successful?: boolean;
              };

              /**
               * Type map of all available tool input types for toolkit "GMAIL".
               */
              export type GMAIL_TOOL_INPUTS = {
                ADD_LABEL_TO_EMAIL: GMAIL_ADD_LABEL_TO_EMAIL_INPUT
                BATCH_DELETE_MESSAGES: GMAIL_BATCH_DELETE_MESSAGES_INPUT
                BATCH_MODIFY_MESSAGES: GMAIL_BATCH_MODIFY_MESSAGES_INPUT
              }

              /**
               * Type map of all available tool input types for toolkit "GMAIL".
               */
              export type GMAIL_TOOL_OUTPUTS = {
                ADD_LABEL_TO_EMAIL: GMAIL_ADD_LABEL_TO_EMAIL_OUTPUT
                BATCH_DELETE_MESSAGES: GMAIL_BATCH_DELETE_MESSAGES_OUTPUT
                BATCH_MODIFY_MESSAGES: GMAIL_BATCH_MODIFY_MESSAGES_OUTPUT
              }

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
                 */
                attachment_list?: unknown[];
                /**
                 * Id
                 * @description The raw Gmail message ID
                 */
                id?: string;
                /**
                 * Label Ids
                 * @description The Gmail label IDs applied to the message
                 */
                label_ids?: string[];
                /**
                 * Message Id
                 * @description The message ID of the message
                 */
                message_id?: string;
                /**
                 * Message Text
                 * @description The text of the message
                 */
                message_text?: string;
                /**
                 * Message Timestamp
                 * @description The timestamp of the message
                 */
                message_timestamp?: string;
                /**
                 * Payload
                 * @description The payload of the message
                 */
                payload?: {
                    [key: string]: unknown;
                };
                /**
                 * Preview
                 * @description The preview payload of the message
                 */
                preview?: {
                    [key: string]: unknown;
                };
                /**
                 * Sender
                 * @description The sender of the message
                 */
                sender?: string;
                /**
                 * Subject
                 * @description The subject of the message
                 */
                subject?: string;
                /**
                 * Thread Id
                 * @description The thread ID of the message
                 */
                thread_id?: string;
                /**
                 * To
                 * @description The recipient of the message
                 */
                to?: string;
              };

              /**
               * Map of Composio's GMAIL toolkit.
               */
              export const GMAIL = {
                slug: "gmail",
                tools: {
                  /**
                   * Adds and/or removes specified Gmail labels for a message; ensure \`message_id\` and all \`label_ids\` are valid (use 'listLabels' for custom label IDs).
                   */
                  ADD_LABEL_TO_EMAIL: "GMAIL_ADD_LABEL_TO_EMAIL",
                  /**
                   * Permanently deletes multiple Gmail messages by ID, bypassing Trash. A successful request does not confirm individual messages existed or were deleted.
                   */
                  BATCH_DELETE_MESSAGES: "GMAIL_BATCH_DELETE_MESSAGES",
                  /**
                   * Adds or removes labels on up to 1,000 Gmail messages in one request, supporting operations such as archiving and marking messages read or unread. A successful response confirms request acceptance, not individual message status.
                   */
                  BATCH_MODIFY_MESSAGES: "GMAIL_BATCH_MODIFY_MESSAGES",
                },
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

        it.effect(
          '[Given] --output-dir [Then] it generates type stubs relative to the given output directory',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;

              const outputDir = path.join(cwd, '.generated', 'composio-ts');

              const args = ['generate', 'ts', '--output-dir', outputDir];
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
                   */
                  attachment_list?: unknown[];
                  /**
                   * Id
                   * @description The raw Gmail message ID
                   */
                  id?: string;
                  /**
                   * Label Ids
                   * @description The Gmail label IDs applied to the message
                   */
                  label_ids?: string[];
                  /**
                   * Message Id
                   * @description The message ID of the message
                   */
                  message_id?: string;
                  /**
                   * Message Text
                   * @description The text of the message
                   */
                  message_text?: string;
                  /**
                   * Message Timestamp
                   * @description The timestamp of the message
                   */
                  message_timestamp?: string;
                  /**
                   * Payload
                   * @description The payload of the message
                   */
                  payload?: {
                      [key: string]: unknown;
                  };
                  /**
                   * Preview
                   * @description The preview payload of the message
                   */
                  preview?: {
                      [key: string]: unknown;
                  };
                  /**
                   * Sender
                   * @description The sender of the message
                   */
                  sender?: string;
                  /**
                   * Subject
                   * @description The subject of the message
                   */
                  subject?: string;
                  /**
                   * Thread Id
                   * @description The thread ID of the message
                   */
                  thread_id?: string;
                  /**
                   * To
                   * @description The recipient of the message
                   */
                  to?: string;
                };

                /**
                 * Map of Composio's GMAIL toolkit.
                 */
                export const GMAIL = {
                  slug: "gmail",
                  tools: {
                    ADD_LABEL_TO_EMAIL: "GMAIL_ADD_LABEL_TO_EMAIL",
                    BATCH_DELETE_MESSAGES: "GMAIL_BATCH_DELETE_MESSAGES",
                    BATCH_MODIFY_MESSAGES: "GMAIL_BATCH_MODIFY_MESSAGES",
                  },
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

        it.effect('[Given] --compact [Then] it generates type stubs in a single file', () =>
          Effect.gen(function* () {
            const process = yield* NodeProcess;
            const cwd = process.cwd;
            const fs = yield* FileSystem.FileSystem;
            const outputDir = path.join(cwd, 'generated-single');

            const args = ['generate', 'ts', '--compact', '--output-dir', outputDir];
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

        it.effect('[Given] --transpiled [Then] it generates both .ts and .mjs files', () =>
          Effect.gen(function* () {
            const process = yield* NodeProcess;
            const cwd = process.cwd;
            const fs = yield* FileSystem.FileSystem;
            const outputDir = path.join(cwd, 'generated-compiled');

            yield* setupMockComposioCorePackage({ cwd, fs });

            const args = ['generate', 'ts', '--transpiled', '--output-dir', outputDir];
            yield* cli(args);

            // Check if the output directory contains both .ts and .js files
            const files = yield* fs.readDirectory(outputDir);
            const fileNames = files.map(file => path.basename(file));

            // Should have both .ts and .js files
            const tsFiles = fileNames.filter(
              name => name.endsWith('.ts') && !name.endsWith('.d.ts')
            );
            const jsFiles = fileNames.filter(name => name.endsWith('.js'));
            const dtsFiles = fileNames.filter(name => name.endsWith('.d.ts'));

            expect(tsFiles.length).toBeGreaterThan(0);
            expect(jsFiles.length).toBeGreaterThan(0);
            expect(dtsFiles.length).toBeGreaterThan(0);

            const filesByPath = yield* readGeneratedTypeScriptFiles({ fs, outputDir });
            assertTypeScriptIsValid({ files: filesByPath });
          })
        );

        it.effect('[Given] no `--output-dir` [Then] it compiles by default', () =>
          Effect.gen(function* () {
            const process = yield* NodeProcess;
            const cwd = process.cwd;
            const fs = yield* FileSystem.FileSystem;
            const generatedDir = path.join(cwd, 'node_modules', '@composio', 'core', 'generated');

            yield* setupMockComposioCorePackage({ cwd, fs, withGenerated: true });

            const args = ['generate', 'ts'];
            yield* cli(args);

            // Check if the output directory contains both .ts and .js files
            const files = yield* fs.readDirectory(generatedDir);
            const fileNames = files.map(file => path.basename(file));

            // Should have both .ts and .js files since compiled is true by default for @composio/core/generated
            const tsFiles = fileNames.filter(
              name => name.endsWith('.ts') && !name.endsWith('.d.ts')
            );
            const jsFiles = fileNames.filter(name => name.endsWith('.js'));
            const dtsFiles = fileNames.filter(name => name.endsWith('.d.ts'));

            expect(tsFiles.length).toBeGreaterThan(0);
            expect(jsFiles.length).toBeGreaterThan(0);
            expect(dtsFiles.length).toBeGreaterThan(0);
          })
        );

        it.effect(
          '[Given] `--output-dir` with no `--transpiled` [Then] it does not generate .js files',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-no-compile');

              const args = ['generate', 'ts', '--output-dir', outputDir];
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

        it.effect('[Given] `--compact` [Then] it generates in the correct location', () =>
          Effect.gen(function* () {
            const process = yield* NodeProcess;
            const cwd = process.cwd;
            const fs = yield* FileSystem.FileSystem;
            yield* setupMockComposioCorePackage({ cwd, fs });

            // Run the command
            const args = ['generate', 'ts', '--compact'];
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

            const generatedFiles = yield* readGeneratedTypeScriptFiles({ fs, outputDir });
            assertTypeScriptIsValid({ files: generatedFiles });
          })
        );

        it.effect(
          '[Given] --type-tools [Then] the generated types carry the schema doc comments',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(process.cwd, 'generated-with-comments');

              yield* cli(['generate', 'ts', '--type-tools', '--output-dir', outputDir]);

              const gmail = yield* fs.readFileString(path.join(outputDir, 'gmail.ts'));
              expect(gmail).toContain('* @description');
            })
        );

        it.effect(
          '[Given] --type-tools --no-comments [Then] it leaves out the schema doc comments only',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(process.cwd, 'generated-no-comments');

              yield* cli([
                'generate',
                'ts',
                '--type-tools',
                '--no-comments',
                '--output-dir',
                outputDir,
              ]);

              const gmail = yield* fs.readFileString(path.join(outputDir, 'gmail.ts'));
              expect(gmail).not.toContain('@description');
              expect(gmail).not.toContain('@example');
              // The toolkit's own docs stay: they do not come from a schema.
              expect(gmail).toContain(`Type of GMAIL's ${TOOLS_TYPES_GMAIL[0]!.slug} tool input.`);
              expect(gmail).toContain("Map of Composio's GMAIL toolkit.");

              const generatedFiles = yield* readGeneratedTypeScriptFiles({ fs, outputDir });
              assertTypeScriptIsValid({ files: generatedFiles });
            })
        );

        it.effect(
          '[Given] --toolkits gmail [Then] it generates type stubs only for the gmail toolkit',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-filtered');

              const args = ['generate', 'ts', '--toolkits', 'gmail', '--output-dir', outputDir];
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

              const generatedFiles = yield* readGeneratedTypeScriptFiles({ fs, outputDir });
              assertTypeScriptIsValid({ files: generatedFiles });
            })
        );

        it.effect(
          '[Given] --toolkits gmail --toolkits slack [Then] it generates type stubs for both toolkits',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-multi-filtered');

              const args = [
                'generate',
                'ts',
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

              const generatedFiles = yield* readGeneratedTypeScriptFiles({ fs, outputDir });
              assertTypeScriptIsValid({ files: generatedFiles });
            })
        );

        it.effect('[Given] --toolkits with invalid toolkit [Then] it fails with an error', () =>
          Effect.gen(function* () {
            const process = yield* NodeProcess;
            const cwd = process.cwd;
            const outputDir = path.join(cwd, 'generated-invalid');

            const args = ['generate', 'ts', '--toolkits', 'nonexistent', '--output-dir', outputDir];
            const failure = yield* cli(args).pipe(Effect.flip);

            expect(failure).toBeInstanceOf(CommandInputError);
            expect(failure).toMatchObject({
              option: '--toolkits',
              message: expect.stringContaining('Invalid toolkit(s): nonexistent'),
            });
          })
        );

        it.effect(
          '[Given] --toolkits GMAIL (uppercase) [Then] it handles case-insensitive matching',
          () =>
            Effect.gen(function* () {
              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-uppercase');

              const args = ['generate', 'ts', '--toolkits', 'GMAIL', '--output-dir', outputDir];
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

    describe('[Given] COMPOSIO_TOOLKIT_VERSION_* env vars', () => {
      layer(
        TestLive({
          fixture: 'typescript-project-with-composio-core',
          toolkitsData: appClientData,
          baseConfigProvider: liveEnvConfigProvider,
        })
      )(it => {
        it.effect(
          '[Given] --type-tools and COMPOSIO_TOOLKIT_VERSION_GMAIL env var [Then] it adds version comment to generated file',
          () =>
            Effect.gen(function* () {
              const { vi } = yield* Effect.promise(() => import('vitest'));
              vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_GMAIL', '20250901_00');

              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-version-override');

              const args = ['generate', 'ts', '--type-tools', '--output-dir', outputDir];
              yield* cli(args);

              // Check that gmail.ts contains the version comment
              const gmailSourceCode = yield* fs.readFileString(path.join(outputDir, 'gmail.ts'));
              expect(gmailSourceCode).toContain('@toolkit-version: 20250901_00');

              // Check that slack.ts does NOT contain a version comment (no override for it)
              const slackSourceCode = yield* fs.readFileString(path.join(outputDir, 'slack.ts'));
              expect(slackSourceCode).not.toContain('@toolkit-version');

              vi.unstubAllEnvs();
            })
        );

        it.effect(
          '[Given] --type-tools and multiple COMPOSIO_TOOLKIT_VERSION_* env vars [Then] it adds version comments to both generated files',
          () =>
            Effect.gen(function* () {
              const { vi } = yield* Effect.promise(() => import('vitest'));
              vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_GMAIL', '20250901_00');
              vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_SLACK', '20250815_00');

              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-multi-version-override');

              const args = ['generate', 'ts', '--type-tools', '--output-dir', outputDir];
              yield* cli(args);

              // Check that gmail.ts contains the version comment
              const gmailSourceCode = yield* fs.readFileString(path.join(outputDir, 'gmail.ts'));
              expect(gmailSourceCode).toContain('@toolkit-version: 20250901_00');

              // Check that slack.ts contains the version comment
              const slackSourceCode = yield* fs.readFileString(path.join(outputDir, 'slack.ts'));
              expect(slackSourceCode).toContain('@toolkit-version: 20250815_00');

              vi.unstubAllEnvs();
            })
        );

        it.effect(
          '[Given] --type-tools and COMPOSIO_TOOLKIT_VERSION_GMAIL=latest [Then] it treats same as no override (no version comment)',
          () =>
            Effect.gen(function* () {
              const { vi } = yield* Effect.promise(() => import('vitest'));
              vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_GMAIL', 'latest');

              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-latest-version');

              const args = ['generate', 'ts', '--type-tools', '--output-dir', outputDir];
              yield* cli(args);

              // Check that gmail.ts does NOT contain a version comment
              const gmailSourceCode = yield* fs.readFileString(path.join(outputDir, 'gmail.ts'));
              expect(gmailSourceCode).not.toContain('@toolkit-version');

              vi.unstubAllEnvs();
            })
        );

        it.effect(
          '[Given] --toolkits gmail and COMPOSIO_TOOLKIT_VERSION_SLACK env var [Then] it ignores env var for non-requested toolkit',
          () =>
            Effect.gen(function* () {
              const { vi } = yield* Effect.promise(() => import('vitest'));
              // Set env var for SLACK, but only request GMAIL toolkit
              vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_SLACK', '20250815_00');

              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-filtered-env-ignored');

              const args = [
                'generate',
                'ts',
                '--type-tools',
                '--toolkits',
                'gmail',
                '--output-dir',
                outputDir,
              ];
              yield* cli(args);

              // Check generated files - only gmail.ts should exist
              const files = yield* fs.readDirectory(outputDir);
              const fileNames = files.map(file => path.basename(file));
              expect(fileNames).toContain('gmail.ts');
              expect(fileNames).toContain('index.ts');
              expect(fileNames).not.toContain('slack.ts');

              // gmail.ts should NOT have version comment (no GMAIL override set)
              const gmailSourceCode = yield* fs.readFileString(path.join(outputDir, 'gmail.ts'));
              expect(gmailSourceCode).not.toContain('@toolkit-version');

              vi.unstubAllEnvs();
            })
        );

        it.effect(
          '[Given] --toolkits gmail and COMPOSIO_TOOLKIT_VERSION_GMAIL env var [Then] it applies version override to filtered toolkit',
          () =>
            Effect.gen(function* () {
              const { vi } = yield* Effect.promise(() => import('vitest'));
              vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_GMAIL', '20250901_00');

              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-filtered-with-version');

              const args = [
                'generate',
                'ts',
                '--type-tools',
                '--toolkits',
                'gmail',
                '--output-dir',
                outputDir,
              ];
              yield* cli(args);

              // Check generated files - only gmail.ts should exist
              const files = yield* fs.readDirectory(outputDir);
              const fileNames = files.map(file => path.basename(file));
              expect(fileNames).toContain('gmail.ts');
              expect(fileNames).not.toContain('slack.ts');

              // gmail.ts should have version comment
              const gmailSourceCode = yield* fs.readFileString(path.join(outputDir, 'gmail.ts'));
              expect(gmailSourceCode).toContain('@toolkit-version: 20250901_00');

              vi.unstubAllEnvs();
            })
        );

        it.effect(
          '[Given] no --type-tools and COMPOSIO_TOOLKIT_VERSION_GMAIL env var [Then] it still adds version comment for documentation purposes',
          () =>
            Effect.gen(function* () {
              const { vi } = yield* Effect.promise(() => import('vitest'));
              vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_GMAIL', '20250901_00');

              const process = yield* NodeProcess;
              const cwd = process.cwd;
              const fs = yield* FileSystem.FileSystem;
              const outputDir = path.join(cwd, 'generated-no-type-tools');

              // Note: no --type-tools flag
              const args = ['generate', 'ts', '--output-dir', outputDir];
              yield* cli(args);

              // Version comment is still added for documentation purposes,
              // even though the version override only affects tool schema fetching with --type-tools
              const gmailSourceCode = yield* fs.readFileString(path.join(outputDir, 'gmail.ts'));
              expect(gmailSourceCode).toContain('@toolkit-version: 20250901_00');

              vi.unstubAllEnvs();
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
        it.effect('[Given] no custom output dir [Then] [Then] it raises an error', () =>
          Effect.gen(function* () {
            const args = ['generate', 'ts'];

            const failure = yield* cli(args).pipe(Effect.flip);

            expect(failure).toEqual(
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
