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
                 */
                author?: string;
                /**
                 * Id
                 * @description The SHA of the commit
                 */
                id?: string;
                /**
                 * Message
                 * @description The commit message
                 */
                message?: string;
                /**
                 * Timestamp
                 * @description The timestamp of the commit
                 */
                timestamp?: string;
                /**
                 * Url
                 * @description The GitHub URL of the commit
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
                 */
                action?: string;
                /**
                 * Createdat
                 * @description The timestamp when the issue was created
                 */
                createdAt?: string;
                /**
                 * Createdby
                 * @description The GitHub username of the user who created the issue
                 */
                createdBy?: string;
                /**
                 * Description
                 * @description A detailed description of the issue
                 * @default
                 */
                description: string;
                /**
                 * Issue Id
                 * @description The unique ID assigned to the issue
                 */
                issue_id?: number;
                /**
                 * Number
                 * @description The unique number assigned to the issue
                 */
                number?: number;
                /**
                 * Title
                 * @description The title of the issue
                 */
                title?: string;
                /**
                 * Url
                 * @description The GitHub URL of the issue
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
                 */
                action?: string;
                /**
                 * Label
                 * @description The name of the label that was added
                 */
                label?: string;
                /**
                 * Labeled At
                 * @description The timestamp when the label was added
                 */
                labeled_at?: string;
                /**
                 * Labeled By
                 * @description The GitHub username of the user who added the label
                 */
                labeled_by?: string;
                /**
                 * Pull Request Number
                 * @description The unique number assigned to the pull request
                 */
                pull_request_number?: number;
                /**
                 * Pull Request Title
                 * @description The title of the pull request
                 */
                pull_request_title?: string;
                /**
                 * Pull Request Url
                 * @description The GitHub URL of the pull request
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
                 */
                action?: string;
                /**
                 * Createdat
                 * @description The timestamp when the pull request was created
                 */
                createdAt?: string;
                /**
                 * Createdby
                 * @description The GitHub username of the user who created the pull request
                 */
                createdBy?: string;
                /**
                 * Description
                 * @description A detailed description of the pull request
                 * @default
                 */
                description: string;
                /**
                 * Number
                 * @description The unique number assigned to the pull request
                 */
                number?: number;
                /**
                 * Title
                 * @description The title of the pull request
                 */
                title?: string;
                /**
                 * Url
                 * @description The GitHub URL of the pull request
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
                 */
                action?: string;
                /**
                 * Repository Id
                 * @description The unique ID assigned to the repository
                 */
                repository_id?: number;
                /**
                 * Repository Name
                 * @description The name of the repository
                 */
                repository_name?: string;
                /**
                 * Repository Url
                 * @description The GitHub URL of the repository
                 */
                repository_url?: string;
                /**
                 * Starred At
                 * @description The timestamp when the star was added
                 */
                starred_at?: string;
                /**
                 * Starred By
                 * @description The GitHub username of the user who added the star
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
                   * Triggers when there are changes in GitHub followers.
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

            expect(sources[1]).toHaveLength(2);
            expect(sources[1][0]).toBe('github.ts');
            expect(sources[1][1]).toMatchInlineSnapshot(`
              "import { type TriggerEvent } from "@composio/core"

              // --------------- //
              //    Tool types   //
              // --------------- //



              /**
               * Type of GITHUB's GITHUB_ACCEPT_A_REPOSITORY_INVITATION tool input.
               */
              type GITHUB_ACCEPT_A_REPOSITORY_INVITATION_INPUT = {
                /**
                 * Invitation Id
                 * @description Unique identifier of the repository invitation. Obtain by listing pending invitations for the authenticated user.
                 */
                invitation_id?: number;
              };

              /**
               * Type of GITHUB's GITHUB_ACCEPT_A_REPOSITORY_INVITATION tool output.
               */
              type GITHUB_ACCEPT_A_REPOSITORY_INVITATION_OUTPUT = {
                /**
                 * Data
                 * @description GitHub API response. Usually empty for a successful acceptance (HTTP 204 No Content status).
                 */
                data?: {
                    [key: string]: unknown;
                };
                /**
                 * Error
                 * @description Error if any occurred during the execution of the action
                 * @default null
                 */
                error: string | null;
                /**
                 * Successful
                 * @description Whether or not the action execution was successful or not
                 */
                successful?: boolean;
              };

              /**
               * Type of GITHUB's GITHUB_ACTIVITY_LIST_REPO_S_STARRED_BY_AUTHENTICATED_USER tool input.
               */
              type GITHUB_ACTIVITY_LIST_REPO_S_STARRED_BY_AUTHENTICATED_USER_INPUT = {
                /**
                 * Direction
                 * @description Sort direction: 'asc' (ascending) or 'desc' (descending).
                 * @default desc
                 * @enum {string}
                 */
                direction: "asc" | "desc";
                /**
                 * Page
                 * @description Page number of results (starts from 1).
                 * @default 1
                 */
                page: number;
                /**
                 * Per Page
                 * @description Number of results per page (max 100).
                 * @default 1
                 */
                per_page: number;
                /**
                 * Sort
                 * @description Sorts starred repositories by 'created' (date starred) or 'updated' (date last pushed).
                 * @default created
                 * @enum {string}
                 */
                sort: "created" | "updated";
              };

              /**
               * Type of GITHUB's GITHUB_ACTIVITY_LIST_REPO_S_STARRED_BY_AUTHENTICATED_USER tool output.
               */
              type GITHUB_ACTIVITY_LIST_REPO_S_STARRED_BY_AUTHENTICATED_USER_OUTPUT = {
                /** Data */
                data?: {
                    [key: string]: unknown;
                };
                /**
                 * Error
                 * @description Error if any occurred during the execution of the action
                 * @default null
                 */
                error: string | null;
                /**
                 * Successful
                 * @description Whether or not the action execution was successful or not
                 */
                successful?: boolean;
              };

              /**
               * Type of GITHUB's GITHUB_ACTIVITY_LIST_STARGAZERS_FOR_REPO tool input.
               */
              type GITHUB_ACTIVITY_LIST_STARGAZERS_FOR_REPO_INPUT = {
                /**
                 * Owner
                 * @description Username of the account owner (user or organization) of the repository; case-insensitive.
                 */
                owner?: string;
                /**
                 * Page
                 * @description Page number of the results to fetch.
                 * @default 1
                 */
                page: number;
                /**
                 * Per Page
                 * @description Number of results to display per page (max 100).
                 * @default 30
                 */
                per_page: number;
                /**
                 * Repo
                 * @description Name of the repository, without the \`.git\` extension; case-insensitive.
                 */
                repo?: string;
              };

              /**
               * Type of GITHUB's GITHUB_ACTIVITY_LIST_STARGAZERS_FOR_REPO tool output.
               */
              type GITHUB_ACTIVITY_LIST_STARGAZERS_FOR_REPO_OUTPUT = {
                /** Data */
                data?: {
                    [key: string]: unknown;
                };
                /**
                 * Error
                 * @description Error if any occurred during the execution of the action
                 * @default null
                 */
                error: string | null;
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
                ACCEPT_A_REPOSITORY_INVITATION: GITHUB_ACCEPT_A_REPOSITORY_INVITATION_INPUT
                ACTIVITY_LIST_REPO_S_STARRED_BY_AUTHENTICATED_USER: GITHUB_ACTIVITY_LIST_REPO_S_STARRED_BY_AUTHENTICATED_USER_INPUT
                ACTIVITY_LIST_STARGAZERS_FOR_REPO: GITHUB_ACTIVITY_LIST_STARGAZERS_FOR_REPO_INPUT
              }

              /**
               * Type map of all available tool input types for toolkit "GITHUB".
               */
              export type GITHUB_TOOL_OUTPUTS = {
                ACCEPT_A_REPOSITORY_INVITATION: GITHUB_ACCEPT_A_REPOSITORY_INVITATION_OUTPUT
                ACTIVITY_LIST_REPO_S_STARRED_BY_AUTHENTICATED_USER: GITHUB_ACTIVITY_LIST_REPO_S_STARRED_BY_AUTHENTICATED_USER_OUTPUT
                ACTIVITY_LIST_STARGAZERS_FOR_REPO: GITHUB_ACTIVITY_LIST_STARGAZERS_FOR_REPO_OUTPUT
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
                 */
                author?: string;
                /**
                 * Id
                 * @description The SHA of the commit
                 */
                id?: string;
                /**
                 * Message
                 * @description The commit message
                 */
                message?: string;
                /**
                 * Timestamp
                 * @description The timestamp of the commit
                 */
                timestamp?: string;
                /**
                 * Url
                 * @description The GitHub URL of the commit
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
                 */
                action?: string;
                /**
                 * Createdat
                 * @description The timestamp when the issue was created
                 */
                createdAt?: string;
                /**
                 * Createdby
                 * @description The GitHub username of the user who created the issue
                 */
                createdBy?: string;
                /**
                 * Description
                 * @description A detailed description of the issue
                 * @default
                 */
                description: string;
                /**
                 * Issue Id
                 * @description The unique ID assigned to the issue
                 */
                issue_id?: number;
                /**
                 * Number
                 * @description The unique number assigned to the issue
                 */
                number?: number;
                /**
                 * Title
                 * @description The title of the issue
                 */
                title?: string;
                /**
                 * Url
                 * @description The GitHub URL of the issue
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
                 */
                action?: string;
                /**
                 * Label
                 * @description The name of the label that was added
                 */
                label?: string;
                /**
                 * Labeled At
                 * @description The timestamp when the label was added
                 */
                labeled_at?: string;
                /**
                 * Labeled By
                 * @description The GitHub username of the user who added the label
                 */
                labeled_by?: string;
                /**
                 * Pull Request Number
                 * @description The unique number assigned to the pull request
                 */
                pull_request_number?: number;
                /**
                 * Pull Request Title
                 * @description The title of the pull request
                 */
                pull_request_title?: string;
                /**
                 * Pull Request Url
                 * @description The GitHub URL of the pull request
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
                 */
                action?: string;
                /**
                 * Createdat
                 * @description The timestamp when the pull request was created
                 */
                createdAt?: string;
                /**
                 * Createdby
                 * @description The GitHub username of the user who created the pull request
                 */
                createdBy?: string;
                /**
                 * Description
                 * @description A detailed description of the pull request
                 * @default
                 */
                description: string;
                /**
                 * Number
                 * @description The unique number assigned to the pull request
                 */
                number?: number;
                /**
                 * Title
                 * @description The title of the pull request
                 */
                title?: string;
                /**
                 * Url
                 * @description The GitHub URL of the pull request
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
                 */
                action?: string;
                /**
                 * Repository Id
                 * @description The unique ID assigned to the repository
                 */
                repository_id?: number;
                /**
                 * Repository Name
                 * @description The name of the repository
                 */
                repository_name?: string;
                /**
                 * Repository Url
                 * @description The GitHub URL of the repository
                 */
                repository_url?: string;
                /**
                 * Starred At
                 * @description The timestamp when the star was added
                 */
                starred_at?: string;
                /**
                 * Starred By
                 * @description The GitHub username of the user who added the star
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
                   * Accepts a pending repository invitation that has been issued to the authenticated user.
                   */
                  ACCEPT_A_REPOSITORY_INVITATION: "GITHUB_ACCEPT_A_REPOSITORY_INVITATION",
                  /**
                   * Deprecated: lists repositories starred by the authenticated user, including star creation timestamps; use 'list repositories starred by the authenticated user' instead.
                   */
                  ACTIVITY_LIST_REPO_S_STARRED_BY_AUTHENTICATED_USER: "GITHUB_ACTIVITY_LIST_REPO_S_STARRED_BY_AUTHENTICATED_USER",
                  /**
                   * Deprecated: lists users who have starred a repository; use \`list stargazers\` instead.
                   */
                  ACTIVITY_LIST_STARGAZERS_FOR_REPO: "GITHUB_ACTIVITY_LIST_STARGAZERS_FOR_REPO",
                },
                triggerTypes: {
                  /**
                   * Triggered when a new commit is pushed to a repository.
                   */
                  COMMIT_EVENT: "GITHUB_COMMIT_EVENT",
                  /**
                   * Triggers when there are changes in GitHub followers.
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
    });
  });
});
