import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { generateTypeScriptToolkitSources } from 'src/generation/typescript/generate-toolkit-sources';
import { createToolkitIndex } from 'src/generation/create-toolkit-index';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import { TOOLS_GITHUB } from 'test/__mocks__/tools-github';
import { TOOLS_GOOGLEDRIVE } from 'test/__mocks__/tools-googledrive';
import { TOOLS_GMAIL } from 'test/__mocks__/tools-gmail';
import { TOOLS_TYPES_GITHUB } from 'test/__mocks__/tools-types-github';
import { TOOLS_TYPES_GOOGLEDRIVE } from 'test/__mocks__/tools-types-googledrive';
import { TOOLS_TYPES_GMAIL } from 'test/__mocks__/tools-types-gmail';
import { TRIGGER_TYPES_GITHUB } from 'test/__mocks__/trigger-types-github';
import { TRIGGER_TYPES_GMAIL } from 'test/__mocks__/trigger-types-gmail';
import { TRIGGER_TYPES_GOOGLEDRIVE } from 'test/__mocks__/trigger-types-googledrive';
import { assertTypeScriptIsValid } from 'test/__utils__/typescript-compiler';

describe('generateTypeScriptToolkitSources', () => {
  describe('with a single emitted file', () => {
    describe('with banner', () => {
      const banner = 'Some banner that will appear in a comment';

      it.effect(
        '[Given] empty toolkits, tools, triggerTypes [Then] it returns an empty array',
        Effect.fn(function* () {
          const index = createToolkitIndex({
            toolkits: [],
            typeableTools: { withTypes: false, tools: [] },
            triggerTypes: [],
          });

          const sources = yield* generateTypeScriptToolkitSources(banner)(index);

          expect(sources).toEqual([]);
        })
      );

      it.effect(
        '[Given] a single toolkit with no tools or triggerTypes [Then] it returns a single toolkit source file',
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

          const sources = yield* generateTypeScriptToolkitSources(banner)(index);
          expect(sources).toHaveLength(1);
          expect(sources[0]).toHaveLength(2);
          expect(sources[0][0]).toBe('slack.ts');
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
        })
      );

      it.effect(
        '[Given] a tool description containing a comment terminator [Then] it remains inside the comment',
        Effect.fn(function* () {
          const toolkits = makeTestToolkits([
            {
              name: 'Github',
              slug: 'github',
            },
          ]);
          const maliciousDescription =
            'Sends an email. */ [(globalThis.compromised = true)]: 1, /*';
          const maliciousTool = {
            ...TOOLS_TYPES_GITHUB[0],
            description: maliciousDescription,
          };

          const index = createToolkitIndex({
            toolkits,
            typeableTools: { withTypes: true, tools: [maliciousTool] },
            triggerTypes: [],
          });

          const sources = yield* generateTypeScriptToolkitSources(banner)(index);
          const source = sources[0][1];

          expect(source).toContain('Sends an email. *\\/');
          assertTypeScriptIsValid({ files: { 'github.ts': source } });
        })
      );

      describe('without type tools', () => {
        const withTypeTools = false;

        it.effect(
          '[Given] toolkits with tools and triggerTypes [Then] it returns a TypeScript source file for each toolkit + the index map',
          Effect.fn(function* () {
            const toolkits = makeTestToolkits([
              {
                name: 'Gmail',
                slug: 'gmail',
              },
              {
                name: 'Github',
                slug: 'github',
              },
              {
                name: 'Slack Helper',
                slug: 'slack',
              },
              {
                name: 'Google Drive',
                slug: 'googledrive',
              },
            ]);

            const index = createToolkitIndex({
              toolkits,
              typeableTools: {
                withTypes: withTypeTools,
                tools: [
                  ...TOOLS_GITHUB.slice(0, 3),
                  ...TOOLS_GMAIL.slice(0, 3),
                  ...TOOLS_GOOGLEDRIVE.slice(0, 3),
                ],
              },
              triggerTypes: [
                ...TRIGGER_TYPES_GITHUB,
                ...TRIGGER_TYPES_GMAIL,
                ...TRIGGER_TYPES_GOOGLEDRIVE,
              ],
            });

            const sources = yield* generateTypeScriptToolkitSources(banner)(index);
            expect(sources).toHaveLength(4);

            expect(sources[0]).toHaveLength(2);
            expect(sources[0][0]).toBe('gmail.ts');
            expect(sources[0][1]).toMatchInlineSnapshot(`
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
                  CREATE_EMAIL_DRAFT: "GMAIL_CREATE_EMAIL_DRAFT",
                  CREATE_LABEL: "GMAIL_CREATE_LABEL",
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

            expect(sources[1]).toHaveLength(2);
            expect(sources[1][0]).toBe('github.ts');
            expect(sources[1][1]).toMatchInlineSnapshot(`
              "import { type TriggerEvent } from "@composio/core"

              // ------------------- //
              //    Trigger types    //
              // ------------------- //



              /**
               * Type of GITHUB's COMMIT_EVENT trigger payload.
               */
              type GITHUB_COMMIT_EVENT_PAYLOAD = {
                /**
                 * Author
                 * @description The GitHub username of the commit author
                 * @example octocat
                 */
                author?: string;
                /**
                 * Id
                 * @description The SHA of the commit
                 * @example 7638417db6d59f3c431d3e1f261cc637155684cd
                 */
                id?: string;
                /**
                 * Message
                 * @description The commit message
                 * @example Fix typo in README
                 */
                message?: string;
                /**
                 * Timestamp
                 * @description The timestamp of the commit
                 * @example 2021-04-14T02:15:15Z
                 */
                timestamp?: string;
                /**
                 * Url
                 * @description The GitHub URL of the commit
                 * @example https://github.com/octocat/Hello-World/commit/7638417db6d59f3c431d3e1f261cc637155684cd
                 */
                url?: string;
              };

              /**
               * Type of GITHUB's FOLLOWER_EVENT trigger payload.
               */
              type GITHUB_FOLLOWER_EVENT_PAYLOAD = {
                /**
                 * Username
                 * @description Username of the github follower
                 */
                username?: string;
              };

              /**
               * Type of GITHUB's ISSUE_ADDED_EVENT trigger payload.
               */
              type GITHUB_ISSUE_ADDED_EVENT_PAYLOAD = {
                /**
                 * Action
                 * @description The action that was performed on the issue
                 * @example opened
                 */
                action?: string;
                /**
                 * Created At
                 * @description The timestamp when the issue was created
                 * @example 2021-04-14T02:15:15Z
                 */
                createdAt?: string;
                /**
                 * Created By
                 * @description The GitHub username of the user who created the issue
                 * @example octocat
                 */
                createdBy?: string;
                /**
                 * Description
                 * @description A detailed description of the issue
                 * @default
                 * @example There is a bug in the code that needs to be fixed.
                 */
                description: string;
                /**
                 * Issue Id
                 * @description The unique ID assigned to the issue
                 * @example 101
                 */
                issue_id?: number;
                /**
                 * Number
                 * @description The unique number assigned to the issue
                 * @example 42
                 */
                number?: number;
                /**
                 * Title
                 * @description The title of the issue
                 * @example Bug in code
                 */
                title?: string;
                /**
                 * Url
                 * @description The GitHub URL of the issue
                 * @example https://github.com/octocat/Hello-World/issues/42
                 */
                url?: string;
              };

              /**
               * Type of GITHUB's LABEL_ADDED_EVENT trigger payload.
               */
              type GITHUB_LABEL_ADDED_EVENT_PAYLOAD = {
                /**
                 * Action
                 * @description The action that was performed on the label
                 * @example labeled
                 */
                action?: string;
                /**
                 * Label
                 * @description The name of the label that was added
                 * @example bug
                 * @example enhancement
                 */
                label?: string;
                /**
                 * Labeled At
                 * @description The timestamp when the label was added
                 * @example 2021-04-14T02:15:15Z
                 */
                labeled_at?: string;
                /**
                 * Labeled By
                 * @description The GitHub username of the user who added the label
                 * @example octocat
                 */
                labeled_by?: string;
                /**
                 * Pull Request Number
                 * @description The unique number assigned to the pull request
                 * @example 42
                 */
                pull_request_number?: number;
                /**
                 * Pull Request Title
                 * @description The title of the pull request
                 * @example Fix typo in README
                 */
                pull_request_title?: string;
                /**
                 * Pull Request Url
                 * @description The GitHub URL of the pull request
                 * @example https://github.com/octocat/Hello-World/pull/42
                 */
                pull_request_url?: string;
              };

              /**
               * Type of GITHUB's PULL_REQUEST_EVENT trigger payload.
               */
              type GITHUB_PULL_REQUEST_EVENT_PAYLOAD = {
                /**
                 * Action
                 * @description The action that was performed on the pull request
                 * @example opened
                 * @example closed
                 * @example synchronize
                 */
                action?: string;
                /**
                 * Created At
                 * @description The timestamp when the pull request was created
                 * @example 2021-04-14T02:15:15Z
                 */
                createdAt?: string;
                /**
                 * Created By
                 * @description The GitHub username of the user who created the pull request
                 * @example octocat
                 */
                createdBy?: string;
                /**
                 * Description
                 * @description A detailed description of the pull request
                 * @default
                 * @example This pull request fixes a typo found in the README file under the 'Installation' section.
                 */
                description: string;
                /**
                 * Number
                 * @description The unique number assigned to the pull request
                 * @example 42
                 */
                number?: number;
                /**
                 * Title
                 * @description The title of the pull request
                 * @example Fix typo in README
                 */
                title?: string;
                /**
                 * Url
                 * @description The GitHub URL of the pull request
                 * @example https://github.com/octocat/Hello-World/pull/42
                 */
                url?: string;
              };

              /**
               * Type of GITHUB's STAR_ADDED_EVENT trigger payload.
               */
              type GITHUB_STAR_ADDED_EVENT_PAYLOAD = {
                /**
                 * Action
                 * @description The action that was performed on the star
                 * @example created
                 */
                action?: string;
                /**
                 * Repository Id
                 * @description The unique ID assigned to the repository
                 * @example 101
                 */
                repository_id?: number;
                /**
                 * Repository Name
                 * @description The name of the repository
                 * @example Hello-World
                 */
                repository_name?: string;
                /**
                 * Repository Url
                 * @description The GitHub URL of the repository
                 * @example https://github.com/octocat/Hello-World
                 */
                repository_url?: string;
                /**
                 * Starred At
                 * @description The timestamp when the star was added
                 * @example 2021-04-14T02:15:15Z
                 */
                starred_at?: string;
                /**
                 * Starred By
                 * @description The GitHub username of the user who added the star
                 * @example octocat
                 */
                starred_by?: string;
              };

              /**
               * Map of Composio's GITHUB toolkit.
               */
              export const GITHUB = {
                slug: "github",
                tools: {
                  ACCEPT_A_REPOSITORY_INVITATION: "GITHUB_ACCEPT_A_REPOSITORY_INVITATION",
                  ACTIVITY_LIST_REPO_S_STARRED_BY_AUTHENTICATED_USER: "GITHUB_ACTIVITY_LIST_REPO_S_STARRED_BY_AUTHENTICATED_USER",
                  ACTIVITY_LIST_STARGAZERS_FOR_REPO: "GITHUB_ACTIVITY_LIST_STARGAZERS_FOR_REPO",
                },
                triggerTypes: {
                  /**
                   * Triggered when a new commit is pushed to a repository.
                   */
                  COMMIT_EVENT: "GITHUB_COMMIT_EVENT",
                  /**
                   * Triggers when new followers are detected on your GitHub account.
                   */
                  FOLLOWER_EVENT: "GITHUB_FOLLOWER_EVENT",
                  /**
                   * Triggered when a new issue is added to the repository.
                   */
                  ISSUE_ADDED_EVENT: "GITHUB_ISSUE_ADDED_EVENT",
                  /**
                   * Triggered when a new label is added to a pull request.
                   */
                  LABEL_ADDED_EVENT: "GITHUB_LABEL_ADDED_EVENT",
                  /**
                   * Triggered when a pull request is opened, closed, or synchronized.
                   */
                  PULL_REQUEST_EVENT: "GITHUB_PULL_REQUEST_EVENT",
                  /**
                   * Triggered when a new star is added to the repository.
                   */
                  STAR_ADDED_EVENT: "GITHUB_STAR_ADDED_EVENT",
                },
              }

              /**
               * Type map of all available trigger payloads for toolkit "GITHUB".
               */
              export type GITHUB_TRIGGER_PAYLOADS = {
                COMMIT_EVENT: GITHUB_COMMIT_EVENT_PAYLOAD
                FOLLOWER_EVENT: GITHUB_FOLLOWER_EVENT_PAYLOAD
                ISSUE_ADDED_EVENT: GITHUB_ISSUE_ADDED_EVENT_PAYLOAD
                LABEL_ADDED_EVENT: GITHUB_LABEL_ADDED_EVENT_PAYLOAD
                PULL_REQUEST_EVENT: GITHUB_PULL_REQUEST_EVENT_PAYLOAD
                STAR_ADDED_EVENT: GITHUB_STAR_ADDED_EVENT_PAYLOAD
              }

              /**
               * Type map of all available trigger events for toolkit "GITHUB".
               */
              export type GITHUB_TRIGGER_EVENTS = {
                COMMIT_EVENT: TriggerEvent<GITHUB_COMMIT_EVENT_PAYLOAD>
                FOLLOWER_EVENT: TriggerEvent<GITHUB_FOLLOWER_EVENT_PAYLOAD>
                ISSUE_ADDED_EVENT: TriggerEvent<GITHUB_ISSUE_ADDED_EVENT_PAYLOAD>
                LABEL_ADDED_EVENT: TriggerEvent<GITHUB_LABEL_ADDED_EVENT_PAYLOAD>
                PULL_REQUEST_EVENT: TriggerEvent<GITHUB_PULL_REQUEST_EVENT_PAYLOAD>
                STAR_ADDED_EVENT: TriggerEvent<GITHUB_STAR_ADDED_EVENT_PAYLOAD>
              }
              "
            `);

            expect(sources[2]).toHaveLength(2);
            expect(sources[2][0]).toBe('slack.ts');
            expect(sources[2][1]).toMatchInlineSnapshot(`
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

            expect(sources[3]).toHaveLength(2);
            expect(sources[3][0]).toBe('googledrive.ts');
            expect(sources[3][1]).toMatchInlineSnapshot(`
              "import { type TriggerEvent } from "@composio/core"

              // ------------------- //
              //    Trigger types    //
              // ------------------- //



              /**
               * Type of GOOGLEDRIVE's GOOGLE_DRIVE_CHANGES trigger payload.
               */
              type GOOGLEDRIVE_GOOGLE_DRIVE_CHANGES_PAYLOAD = object;

              /**
               * Map of Composio's GOOGLEDRIVE toolkit.
               */
              export const GOOGLEDRIVE = {
                slug: "googledrive",
                tools: {
                  ADD_FILE_SHARING_PREFERENCE: "GOOGLEDRIVE_ADD_FILE_SHARING_PREFERENCE",
                  COPY_FILE: "GOOGLEDRIVE_COPY_FILE",
                  CREATE_COMMENT: "GOOGLEDRIVE_CREATE_COMMENT",
                },
                triggerTypes: {
                  /**
                   * Triggers when changes are detected in a Google Drive.
                   */
                  GOOGLE_DRIVE_CHANGES: "GOOGLEDRIVE_GOOGLE_DRIVE_CHANGES",
                },
              }

              /**
               * Type map of all available trigger payloads for toolkit "GOOGLEDRIVE".
               */
              export type GOOGLEDRIVE_TRIGGER_PAYLOADS = {
                GOOGLE_DRIVE_CHANGES: GOOGLEDRIVE_GOOGLE_DRIVE_CHANGES_PAYLOAD
              }

              /**
               * Type map of all available trigger events for toolkit "GOOGLEDRIVE".
               */
              export type GOOGLEDRIVE_TRIGGER_EVENTS = {
                GOOGLE_DRIVE_CHANGES: TriggerEvent<GOOGLEDRIVE_GOOGLE_DRIVE_CHANGES_PAYLOAD>
              }
              "
            `);
          })
        );
      });

      describe('with type tools', () => {
        const withTypeTools = true;

        it.effect(
          '[Given] toolkits with tools and triggerTypes [Then] it returns a TypeScript source file for each toolkit + the index map',
          Effect.fn(function* () {
            const toolkits = makeTestToolkits([
              {
                name: 'Gmail',
                slug: 'gmail',
              },
              {
                name: 'Github',
                slug: 'github',
              },
              {
                name: 'Slack Helper',
                slug: 'slack',
              },
              {
                name: 'Google Drive',
                slug: 'googledrive',
              },
            ]);

            const index = createToolkitIndex({
              toolkits,
              typeableTools: {
                withTypes: withTypeTools,
                tools: [
                  ...TOOLS_TYPES_GITHUB.slice(0, 3),
                  ...TOOLS_TYPES_GMAIL.slice(0, 3),
                  ...TOOLS_TYPES_GOOGLEDRIVE.slice(0, 3),
                ],
              },
              triggerTypes: [
                ...TRIGGER_TYPES_GITHUB,
                ...TRIGGER_TYPES_GMAIL,
                ...TRIGGER_TYPES_GOOGLEDRIVE,
              ],
            });

            const sources = yield* generateTypeScriptToolkitSources(banner)(index);
            expect(sources).toHaveLength(4);

            expect(sources[0]).toHaveLength(2);
            expect(sources[0][0]).toBe('gmail.ts');
            expect(sources[0][1]).toMatchInlineSnapshot(`
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

            expect(sources[1]).toHaveLength(2);
            expect(sources[1][0]).toBe('github.ts');
            expect(sources[1][1]).toMatchInlineSnapshot(`
              "import { type TriggerEvent } from "@composio/core"

              // --------------- //
              //    Tool types   //
              // --------------- //



              /**
               * Type of GITHUB's GITHUB_ABORT_REPOSITORY_MIGRATION tool input.
               */
              type GITHUB_ABORT_REPOSITORY_MIGRATION_INPUT = {
                /**
                 * Migration Id
                 * @description The ID of the repository migration to abort. This is the migration ID returned when a migration was queued (e.g., 'RM_kgDOABCDEF').
                 * @example RM_kgDOABCDEF
                 * @example RM_kgDOGw8pTA
                 */
                migrationId?: string;
                /**
                 * Client Mutation Id
                 * @description A unique identifier for the client performing the mutation. This can be used to track the mutation in logs or for idempotency purposes.
                 * @example mutation-12345
                 * @example abort-migration-xyz
                 */
                clientMutationId?: string;
              };

              /**
               * Type of GITHUB's GITHUB_ABORT_REPOSITORY_MIGRATION tool output.
               */
              type GITHUB_ABORT_REPOSITORY_MIGRATION_OUTPUT = {
                /**
                 * Data
                 * @description Data from the action execution
                 */
                data?: {
                    /**
                     * Data
                     * @description The result of the mutation. Contains 'abortRepositoryMigration' key with success status and optional clientMutationId. May be null if execution prevented a valid response.
                     */
                    data?: {
                        [key: string]: unknown;
                    };
                    /**
                     * Errors
                     * @description Present only if execution raised errors. A non-empty list of error objects describing issues encountered during mutation execution.
                     */
                    errors?: {
                        /**
                         * Path
                         * @description Response path uniquely identifying where the error occurred in the result. Contains field response names (as strings) and list indices (as 0-indexed integers). Aliased fields use their alias in the path.
                         */
                        path?: (string | number)[];
                        /**
                         * Message
                         * @description A string description of the error intended to guide developers in understanding and correcting the error.
                         */
                        message: string;
                        /**
                         * Locations
                         * @description List of locations in the GraphQL document where the error originated, specified by line and column numbers (both starting from 1).
                         */
                        locations?: {
                            /**
                             * Line
                             * @description The line number in the GraphQL document where the error occurred (starting from 1).
                             */
                            line: number;
                            /**
                             * Column
                             * @description The column number in the GraphQL document where the error occurred (starting from 1).
                             */
                            column: number;
                        }[];
                        /**
                         * Extensions
                         * @description Map containing custom error information. Reserved for implementers to add additional context to errors. Preferred location for implementation-specific error details.
                         */
                        extensions?: {
                            [key: string]: unknown;
                        };
                    }[];
                    /**
                     * Extensions
                     * @description Optional map reserved for implementers to extend the protocol with custom information such as performance metrics, tracing information, or rate limit data.
                     */
                    extensions?: {
                        [key: string]: unknown;
                    };
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
               * Type of GITHUB's GITHUB_ACCEPT_REPOSITORY_INVITATION tool input.
               */
              type GITHUB_ACCEPT_REPOSITORY_INVITATION_INPUT = {
                /**
                 * Invitation Id
                 * @description Unique identifier of the repository invitation sent TO the authenticated user. Get this ID by listing your pending invitations using the 'List repository invitations for the authenticated user' action.
                 */
                invitation_id?: number;
              };

              /**
               * Type of GITHUB's GITHUB_ACCEPT_REPOSITORY_INVITATION tool output.
               */
              type GITHUB_ACCEPT_REPOSITORY_INVITATION_OUTPUT = {
                /**
                 * Data
                 * @description Data from the action execution
                 */
                data?: Record<string, never>;
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
               * Type of GITHUB's GITHUB_ADD_APP_ACCESS_RESTRICTIONS tool input.
               */
              type GITHUB_ADD_APP_ACCESS_RESTRICTIONS_INPUT = {
                /**
                 * Apps
                 * @description The list of GitHub App slugs with push access to grant. Apps must be installed on the repository and have 'contents' write permissions. The app slug is the URL-friendly name of the GitHub App (e.g., 'github-actions', 'dependabot').
                 * @example [
                 *       "github-actions",
                 *       "dependabot"
                 *     ]
                 */
                apps?: string[];
                /**
                 * Repo
                 * @description The name of the repository, without the \`.git\` extension. This field is not case-sensitive.
                 * @example hello-world
                 */
                repo?: string;
                /**
                 * Owner
                 * @description The organization name that owns the repository. This field is not case-sensitive. Note: This endpoint only works for organization-owned repositories.
                 * @example my-org
                 */
                owner?: string;
                /**
                 * Branch
                 * @description The name of the branch to which restrictions will be applied. Wildcard characters (e.g., '*') are not allowed in the branch name when using this REST API endpoint. For operations involving wildcard branch names, consult the GitHub GraphQL API.
                 * @example main
                 */
                branch?: string;
              };

              /**
               * Type of GITHUB's GITHUB_ADD_APP_ACCESS_RESTRICTIONS tool output.
               */
              type GITHUB_ADD_APP_ACCESS_RESTRICTIONS_OUTPUT = {
                /**
                 * Data
                 * @description Data from the action execution
                 */
                data?: {
                    /**
                     * Apps
                     * @description Array of GitHub App objects that have push access to the protected branch
                     */
                    apps: {
                        /**
                         * Id
                         * @description Unique identifier of the GitHub App
                         */
                        id: number;
                        /**
                         * Name
                         * @description The name of the GitHub App
                         */
                        name: string;
                        /**
                         * Slug
                         * @description The slug name of the GitHub App
                         */
                        slug: string;
                        /**
                         * Owner
                         * @description Owner of the GitHub App (user or organization)
                         */
                        owner: {
                            /**
                             * Id
                             * @description Unique identifier of the owner
                             */
                            id: number;
                            /**
                             * Url
                             * @description API URL for the owner
                             */
                            url: string;
                            /**
                             * Type
                             * @description Type of the owner account (e.g., 'User', 'Organization')
                             */
                            type: string;
                            /**
                             * Login
                             * @description Username of the owner
                             */
                            login: string;
                            /**
                             * Node Id
                             * @description GraphQL node ID of the owner
                             */
                            node_id: string;
                            /**
                             * Html Url
                             * @description GitHub profile URL of the owner
                             */
                            html_url: string;
                            /**
                             * Gists Url
                             * @description API URL template for the owner's gists
                             */
                            gists_url: string;
                            /**
                             * Repos Url
                             * @description API URL for the owner's repositories
                             */
                            repos_url: string;
                            /**
                             * Avatar Url
                             * @description URL to the owner's avatar image
                             */
                            avatar_url: string;
                            /**
                             * Events Url
                             * @description API URL template for the owner's events
                             */
                            events_url: string;
                            /**
                             * Site Admin
                             * @description Whether the owner is a site administrator
                             */
                            site_admin: boolean;
                            /**
                             * Gravatar Id
                             * @description Gravatar ID of the owner
                             */
                            gravatar_id?: string;
                            /**
                             * Starred Url
                             * @description API URL template for the owner's starred repositories
                             */
                            starred_url: string;
                            /**
                             * Followers Url
                             * @description API URL for the owner's followers
                             */
                            followers_url: string;
                            /**
                             * Following Url
                             * @description API URL template for the owner's following
                             */
                            following_url: string;
                            /**
                             * Organizations Url
                             * @description API URL for the owner's organizations
                             */
                            organizations_url: string;
                            /**
                             * Subscriptions Url
                             * @description API URL for the owner's subscriptions
                             */
                            subscriptions_url: string;
                            /**
                             * Received Events Url
                             * @description API URL for events received by the owner
                             */
                            received_events_url: string;
                        };
                        /**
                         * Events
                         * @description List of webhook events the GitHub App is subscribed to
                         */
                        events: string[];
                        /**
                         * Node Id
                         * @description GraphQL global node ID for the App
                         */
                        node_id: string;
                        /**
                         * Html Url
                         * @description GitHub profile page URL for the App
                         */
                        html_url: string;
                        /**
                         * Created At
                         * @description Timestamp when the App was created (ISO 8601 format)
                         */
                        created_at: string;
                        /**
                         * Updated At
                         * @description Timestamp when the App was last updated (ISO 8601 format)
                         */
                        updated_at: string;
                        /**
                         * Description
                         * @description Description of the GitHub App
                         */
                        description?: string;
                        /**
                         * Permissions
                         * @description The set of permissions granted to the GitHub App
                         */
                        permissions: {
                            [key: string]: string;
                        };
                        /**
                         * External Url
                         * @description External website URL for the application
                         */
                        external_url: string;
                    }[];
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
               * Type map of all available tool input types for toolkit "GITHUB".
               */
              export type GITHUB_TOOL_INPUTS = {
                ABORT_REPOSITORY_MIGRATION: GITHUB_ABORT_REPOSITORY_MIGRATION_INPUT
                ACCEPT_REPOSITORY_INVITATION: GITHUB_ACCEPT_REPOSITORY_INVITATION_INPUT
                ADD_APP_ACCESS_RESTRICTIONS: GITHUB_ADD_APP_ACCESS_RESTRICTIONS_INPUT
              }

              /**
               * Type map of all available tool input types for toolkit "GITHUB".
               */
              export type GITHUB_TOOL_OUTPUTS = {
                ABORT_REPOSITORY_MIGRATION: GITHUB_ABORT_REPOSITORY_MIGRATION_OUTPUT
                ACCEPT_REPOSITORY_INVITATION: GITHUB_ACCEPT_REPOSITORY_INVITATION_OUTPUT
                ADD_APP_ACCESS_RESTRICTIONS: GITHUB_ADD_APP_ACCESS_RESTRICTIONS_OUTPUT
              }

              // ------------------- //
              //    Trigger types    //
              // ------------------- //



              /**
               * Type of GITHUB's COMMIT_EVENT trigger payload.
               */
              type GITHUB_COMMIT_EVENT_PAYLOAD = {
                /**
                 * Author
                 * @description The GitHub username of the commit author
                 * @example octocat
                 */
                author?: string;
                /**
                 * Id
                 * @description The SHA of the commit
                 * @example 7638417db6d59f3c431d3e1f261cc637155684cd
                 */
                id?: string;
                /**
                 * Message
                 * @description The commit message
                 * @example Fix typo in README
                 */
                message?: string;
                /**
                 * Timestamp
                 * @description The timestamp of the commit
                 * @example 2021-04-14T02:15:15Z
                 */
                timestamp?: string;
                /**
                 * Url
                 * @description The GitHub URL of the commit
                 * @example https://github.com/octocat/Hello-World/commit/7638417db6d59f3c431d3e1f261cc637155684cd
                 */
                url?: string;
              };

              /**
               * Type of GITHUB's FOLLOWER_EVENT trigger payload.
               */
              type GITHUB_FOLLOWER_EVENT_PAYLOAD = {
                /**
                 * Username
                 * @description Username of the github follower
                 */
                username?: string;
              };

              /**
               * Type of GITHUB's ISSUE_ADDED_EVENT trigger payload.
               */
              type GITHUB_ISSUE_ADDED_EVENT_PAYLOAD = {
                /**
                 * Action
                 * @description The action that was performed on the issue
                 * @example opened
                 */
                action?: string;
                /**
                 * Created At
                 * @description The timestamp when the issue was created
                 * @example 2021-04-14T02:15:15Z
                 */
                createdAt?: string;
                /**
                 * Created By
                 * @description The GitHub username of the user who created the issue
                 * @example octocat
                 */
                createdBy?: string;
                /**
                 * Description
                 * @description A detailed description of the issue
                 * @default
                 * @example There is a bug in the code that needs to be fixed.
                 */
                description: string;
                /**
                 * Issue Id
                 * @description The unique ID assigned to the issue
                 * @example 101
                 */
                issue_id?: number;
                /**
                 * Number
                 * @description The unique number assigned to the issue
                 * @example 42
                 */
                number?: number;
                /**
                 * Title
                 * @description The title of the issue
                 * @example Bug in code
                 */
                title?: string;
                /**
                 * Url
                 * @description The GitHub URL of the issue
                 * @example https://github.com/octocat/Hello-World/issues/42
                 */
                url?: string;
              };

              /**
               * Type of GITHUB's LABEL_ADDED_EVENT trigger payload.
               */
              type GITHUB_LABEL_ADDED_EVENT_PAYLOAD = {
                /**
                 * Action
                 * @description The action that was performed on the label
                 * @example labeled
                 */
                action?: string;
                /**
                 * Label
                 * @description The name of the label that was added
                 * @example bug
                 * @example enhancement
                 */
                label?: string;
                /**
                 * Labeled At
                 * @description The timestamp when the label was added
                 * @example 2021-04-14T02:15:15Z
                 */
                labeled_at?: string;
                /**
                 * Labeled By
                 * @description The GitHub username of the user who added the label
                 * @example octocat
                 */
                labeled_by?: string;
                /**
                 * Pull Request Number
                 * @description The unique number assigned to the pull request
                 * @example 42
                 */
                pull_request_number?: number;
                /**
                 * Pull Request Title
                 * @description The title of the pull request
                 * @example Fix typo in README
                 */
                pull_request_title?: string;
                /**
                 * Pull Request Url
                 * @description The GitHub URL of the pull request
                 * @example https://github.com/octocat/Hello-World/pull/42
                 */
                pull_request_url?: string;
              };

              /**
               * Type of GITHUB's PULL_REQUEST_EVENT trigger payload.
               */
              type GITHUB_PULL_REQUEST_EVENT_PAYLOAD = {
                /**
                 * Action
                 * @description The action that was performed on the pull request
                 * @example opened
                 * @example closed
                 * @example synchronize
                 */
                action?: string;
                /**
                 * Created At
                 * @description The timestamp when the pull request was created
                 * @example 2021-04-14T02:15:15Z
                 */
                createdAt?: string;
                /**
                 * Created By
                 * @description The GitHub username of the user who created the pull request
                 * @example octocat
                 */
                createdBy?: string;
                /**
                 * Description
                 * @description A detailed description of the pull request
                 * @default
                 * @example This pull request fixes a typo found in the README file under the 'Installation' section.
                 */
                description: string;
                /**
                 * Number
                 * @description The unique number assigned to the pull request
                 * @example 42
                 */
                number?: number;
                /**
                 * Title
                 * @description The title of the pull request
                 * @example Fix typo in README
                 */
                title?: string;
                /**
                 * Url
                 * @description The GitHub URL of the pull request
                 * @example https://github.com/octocat/Hello-World/pull/42
                 */
                url?: string;
              };

              /**
               * Type of GITHUB's STAR_ADDED_EVENT trigger payload.
               */
              type GITHUB_STAR_ADDED_EVENT_PAYLOAD = {
                /**
                 * Action
                 * @description The action that was performed on the star
                 * @example created
                 */
                action?: string;
                /**
                 * Repository Id
                 * @description The unique ID assigned to the repository
                 * @example 101
                 */
                repository_id?: number;
                /**
                 * Repository Name
                 * @description The name of the repository
                 * @example Hello-World
                 */
                repository_name?: string;
                /**
                 * Repository Url
                 * @description The GitHub URL of the repository
                 * @example https://github.com/octocat/Hello-World
                 */
                repository_url?: string;
                /**
                 * Starred At
                 * @description The timestamp when the star was added
                 * @example 2021-04-14T02:15:15Z
                 */
                starred_at?: string;
                /**
                 * Starred By
                 * @description The GitHub username of the user who added the star
                 * @example octocat
                 */
                starred_by?: string;
              };

              /**
               * Map of Composio's GITHUB toolkit.
               */
              export const GITHUB = {
                slug: "github",
                tools: {
                  /**
                   * Tool to abort a repository migration that is queued or in progress. Use when you need to cancel an ongoing migration operation.
                   */
                  ABORT_REPOSITORY_MIGRATION: "GITHUB_ABORT_REPOSITORY_MIGRATION",
                  /**
                   * Accepts a PENDING repository invitation that has been issued to the authenticated user.
                   */
                  ACCEPT_REPOSITORY_INVITATION: "GITHUB_ACCEPT_REPOSITORY_INVITATION",
                  /**
                   * Adds GitHub Apps to the list of apps allowed to push to a protected branch. The branch must already have protection rules with restrictions enabled. This endpoint only works for organization repositories, not personal repositories. Apps must be installed on the repository with 'contents' write permissions.
                   */
                  ADD_APP_ACCESS_RESTRICTIONS: "GITHUB_ADD_APP_ACCESS_RESTRICTIONS",
                },
                triggerTypes: {
                  /**
                   * Triggered when a new commit is pushed to a repository.
                   */
                  COMMIT_EVENT: "GITHUB_COMMIT_EVENT",
                  /**
                   * Triggers when new followers are detected on your GitHub account.
                   */
                  FOLLOWER_EVENT: "GITHUB_FOLLOWER_EVENT",
                  /**
                   * Triggered when a new issue is added to the repository.
                   */
                  ISSUE_ADDED_EVENT: "GITHUB_ISSUE_ADDED_EVENT",
                  /**
                   * Triggered when a new label is added to a pull request.
                   */
                  LABEL_ADDED_EVENT: "GITHUB_LABEL_ADDED_EVENT",
                  /**
                   * Triggered when a pull request is opened, closed, or synchronized.
                   */
                  PULL_REQUEST_EVENT: "GITHUB_PULL_REQUEST_EVENT",
                  /**
                   * Triggered when a new star is added to the repository.
                   */
                  STAR_ADDED_EVENT: "GITHUB_STAR_ADDED_EVENT",
                },
              }

              /**
               * Type map of all available trigger payloads for toolkit "GITHUB".
               */
              export type GITHUB_TRIGGER_PAYLOADS = {
                COMMIT_EVENT: GITHUB_COMMIT_EVENT_PAYLOAD
                FOLLOWER_EVENT: GITHUB_FOLLOWER_EVENT_PAYLOAD
                ISSUE_ADDED_EVENT: GITHUB_ISSUE_ADDED_EVENT_PAYLOAD
                LABEL_ADDED_EVENT: GITHUB_LABEL_ADDED_EVENT_PAYLOAD
                PULL_REQUEST_EVENT: GITHUB_PULL_REQUEST_EVENT_PAYLOAD
                STAR_ADDED_EVENT: GITHUB_STAR_ADDED_EVENT_PAYLOAD
              }

              /**
               * Type map of all available trigger events for toolkit "GITHUB".
               */
              export type GITHUB_TRIGGER_EVENTS = {
                COMMIT_EVENT: TriggerEvent<GITHUB_COMMIT_EVENT_PAYLOAD>
                FOLLOWER_EVENT: TriggerEvent<GITHUB_FOLLOWER_EVENT_PAYLOAD>
                ISSUE_ADDED_EVENT: TriggerEvent<GITHUB_ISSUE_ADDED_EVENT_PAYLOAD>
                LABEL_ADDED_EVENT: TriggerEvent<GITHUB_LABEL_ADDED_EVENT_PAYLOAD>
                PULL_REQUEST_EVENT: TriggerEvent<GITHUB_PULL_REQUEST_EVENT_PAYLOAD>
                STAR_ADDED_EVENT: TriggerEvent<GITHUB_STAR_ADDED_EVENT_PAYLOAD>
              }
              "
            `);

            expect(sources[2]).toHaveLength(2);
            expect(sources[2][0]).toBe('slack.ts');
            expect(sources[2][1]).toMatchInlineSnapshot(`
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
          })
        );
      });

      describe('[Given] versionMap with toolkit version overrides', () => {
        describe('without type tools', () => {
          it.effect(
            '[Given] a toolkit with version override [Then] it includes version comment in generated file',
            Effect.fn(function* () {
              const toolkits = makeTestToolkits([
                {
                  name: 'Gmail',
                  slug: 'gmail',
                },
              ]);

              const versionMap = new Map([['gmail', '20250901_00']]) as Map<
                Lowercase<string>,
                string
              >;

              const index = createToolkitIndex({
                toolkits,
                typeableTools: { withTypes: false, tools: [] },
                triggerTypes: [],
                versionMap,
              });

              const sources = yield* generateTypeScriptToolkitSources(banner)(index);
              expect(sources).toHaveLength(1);
              expect(sources[0][0]).toBe('gmail.ts');
              expect(sources[0][1]).toContain('@toolkit-version: 20250901_00');
            })
          );

          it.effect(
            '[Given] multiple toolkits with different version overrides [Then] each file includes its version comment',
            Effect.fn(function* () {
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

              const versionMap = new Map([
                ['gmail', '20250901_00'],
                ['slack', '20250815_00'],
              ]) as Map<Lowercase<string>, string>;

              const index = createToolkitIndex({
                toolkits,
                typeableTools: { withTypes: false, tools: [] },
                triggerTypes: [],
                versionMap,
              });

              const sources = yield* generateTypeScriptToolkitSources(banner)(index);
              expect(sources).toHaveLength(2);

              // Gmail should have its version comment
              expect(sources[0][0]).toBe('gmail.ts');
              expect(sources[0][1]).toContain('@toolkit-version: 20250901_00');
              expect(sources[0][1]).toMatchSnapshot();

              // Slack should have its version comment
              expect(sources[1][0]).toBe('slack.ts');
              expect(sources[1][1]).toContain('@toolkit-version: 20250815_00');
              expect(sources[1][1]).toMatchSnapshot();
            })
          );

          it.effect(
            '[Given] only some toolkits with version override [Then] only those files include version comment',
            Effect.fn(function* () {
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

              // Only gmail has a version override
              const versionMap = new Map([['gmail', '20250901_00']]) as Map<
                Lowercase<string>,
                string
              >;

              const index = createToolkitIndex({
                toolkits,
                typeableTools: { withTypes: false, tools: [] },
                triggerTypes: [],
                versionMap,
              });

              const sources = yield* generateTypeScriptToolkitSources(banner)(index);
              expect(sources).toHaveLength(2);

              // Gmail should have version comment
              expect(sources[0][0]).toBe('gmail.ts');
              expect(sources[0][1]).toContain('@toolkit-version: 20250901_00');

              // Slack should NOT have version comment
              expect(sources[1][0]).toBe('slack.ts');
              expect(sources[1][1]).not.toContain('@toolkit-version');
              expect(sources[1][1]).toMatchSnapshot();
            })
          );

          it.effect(
            '[Given] empty versionMap [Then] no files include version comment',
            Effect.fn(function* () {
              const toolkits = makeTestToolkits([
                {
                  name: 'Gmail',
                  slug: 'gmail',
                },
              ]);

              const versionMap = new Map() as Map<Lowercase<string>, string>;

              const index = createToolkitIndex({
                toolkits,
                typeableTools: { withTypes: false, tools: [] },
                triggerTypes: [],
                versionMap,
              });

              const sources = yield* generateTypeScriptToolkitSources(banner)(index);
              expect(sources).toHaveLength(1);
              expect(sources[0][0]).toBe('gmail.ts');
              expect(sources[0][1]).not.toContain('@toolkit-version');
            })
          );
        });

        describe('with type tools', () => {
          it.effect(
            '[Given] a toolkit with version override [Then] it includes version comment in generated file',
            Effect.fn(function* () {
              const toolkits = makeTestToolkits([
                {
                  name: 'Gmail',
                  slug: 'gmail',
                },
              ]);

              const versionMap = new Map([['gmail', '20250901_00']]) as Map<
                Lowercase<string>,
                string
              >;

              const index = createToolkitIndex({
                toolkits,
                typeableTools: {
                  withTypes: true,
                  tools: [...TOOLS_TYPES_GMAIL.slice(0, 1)],
                },
                triggerTypes: [],
                versionMap,
              });

              const sources = yield* generateTypeScriptToolkitSources(banner)(index);
              expect(sources).toHaveLength(1);
              expect(sources[0][0]).toBe('gmail.ts');
              expect(sources[0][1]).toContain('@toolkit-version: 20250901_00');
            })
          );

          it.effect(
            '[Given] multiple toolkits with different version overrides [Then] each file includes its version comment',
            Effect.fn(function* () {
              const toolkits = makeTestToolkits([
                {
                  name: 'Gmail',
                  slug: 'gmail',
                },
                {
                  name: 'Github',
                  slug: 'github',
                },
              ]);

              const versionMap = new Map([
                ['gmail', '20250901_00'],
                ['github', '20250815_00'],
              ]) as Map<Lowercase<string>, string>;

              const index = createToolkitIndex({
                toolkits,
                typeableTools: {
                  withTypes: true,
                  tools: [...TOOLS_TYPES_GMAIL.slice(0, 1), ...TOOLS_TYPES_GITHUB.slice(0, 1)],
                },
                triggerTypes: [],
                versionMap,
              });

              const sources = yield* generateTypeScriptToolkitSources(banner)(index);
              expect(sources).toHaveLength(2);

              // Gmail should have its version comment
              expect(sources[0][0]).toBe('gmail.ts');
              expect(sources[0][1]).toContain('@toolkit-version: 20250901_00');
              expect(sources[0][1]).toMatchSnapshot();

              // Github should have its version comment
              expect(sources[1][0]).toBe('github.ts');
              expect(sources[1][1]).toContain('@toolkit-version: 20250815_00');
              expect(sources[1][1]).toMatchSnapshot();
            })
          );

          it.effect(
            '[Given] only some toolkits with version override [Then] only those files include version comment',
            Effect.fn(function* () {
              const toolkits = makeTestToolkits([
                {
                  name: 'Gmail',
                  slug: 'gmail',
                },
                {
                  name: 'Github',
                  slug: 'github',
                },
              ]);

              // Only gmail has a version override
              const versionMap = new Map([['gmail', '20250901_00']]) as Map<
                Lowercase<string>,
                string
              >;

              const index = createToolkitIndex({
                toolkits,
                typeableTools: {
                  withTypes: true,
                  tools: [...TOOLS_TYPES_GMAIL.slice(0, 1), ...TOOLS_TYPES_GITHUB.slice(0, 1)],
                },
                triggerTypes: [],
                versionMap,
              });

              const sources = yield* generateTypeScriptToolkitSources(banner)(index);
              expect(sources).toHaveLength(2);

              // Gmail should have version comment
              expect(sources[0][0]).toBe('gmail.ts');
              expect(sources[0][1]).toContain('@toolkit-version: 20250901_00');

              // Github should NOT have version comment
              expect(sources[1][0]).toBe('github.ts');
              expect(sources[1][1]).not.toContain('@toolkit-version');
            })
          );

          it.effect(
            '[Given] empty versionMap [Then] no files include version comment',
            Effect.fn(function* () {
              const toolkits = makeTestToolkits([
                {
                  name: 'Gmail',
                  slug: 'gmail',
                },
              ]);

              const versionMap = new Map() as Map<Lowercase<string>, string>;

              const index = createToolkitIndex({
                toolkits,
                typeableTools: {
                  withTypes: true,
                  tools: [...TOOLS_TYPES_GMAIL.slice(0, 1)],
                },
                triggerTypes: [],
                versionMap,
              });

              const sources = yield* generateTypeScriptToolkitSources(banner)(index);
              expect(sources).toHaveLength(1);
              expect(sources[0][0]).toBe('gmail.ts');
              expect(sources[0][1]).not.toContain('@toolkit-version');
            })
          );
        });
      });
    });
  });
});
