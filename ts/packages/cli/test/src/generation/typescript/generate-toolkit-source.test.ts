import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { generateTypeScriptToolkitSources } from 'src/generation/typescript/generate-toolkit-sources';
import { createToolkitIndex } from 'src/generation/create-toolkit-index';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import { TOOLS_GITHUB } from 'test/__mocks__/tools_github';
import { TOOLS_GOOGLEDRIVE } from 'test/__mocks__/tools_googledrive';
import { TOOLS_GMAIL } from 'test/__mocks__/tools_gmail';
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
            tools: [],
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
            tools: [],
            triggerTypes: [],
          });

          const sources = yield* generateTypeScriptToolkitSources(banner)(index);
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
            tools: [
              ...TOOLS_GITHUB.slice(0, 3),
              ...TOOLS_GMAIL.slice(0, 3),
              ...TOOLS_GOOGLEDRIVE.slice(0, 3),
            ],
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
              NEW_GMAIL_MESSAGE: {
                slug: "GMAIL_NEW_GMAIL_MESSAGE",
                name: "New Gmail Message Received Trigger",
                description: "Triggers when a new message is received in Gmail.",
                instructions: "\\n    **Instructions for Setting Up the Trigger:**\\n\\n    - Ensure that the Gmail API is enabled for your Google account.\\n    - Provide the user ID (usually 'me' for the authenticated user).\\n    - Optionally, provide label IDs to filter messages.\\n    ",
                config: {
                  properties: {
                    interval: {
                      default: 1,
                      description: "Periodic Interval to Check for Updates & Send a Trigger in Minutes",
                      title: "Interval",
                      type: "number",
                    },
                    labelIds: {
                      default: "INBOX",
                      description: "Filter messages by a single label ID. Labels identify the status or category of messages. Supported labels include 'INBOX', 'SPAM', 'TRASH', 'UNREAD', 'STARRED', 'IMPORTANT', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', and 'CATEGORY_FORUMS'. For complex label filtering, use the 'query' parameter instead.",
                      examples: ["INBOX", "UNREAD", "STARRED"],
                      title: "Labelids",
                      type: "string",
                    },
                    query: {
                      default: "",
                      description: "Advanced Gmail search using the same syntax as Gmail's search box. Use 'AND' for messages that match all conditions, 'OR' for any condition. Search by sender (from:email@domain.com), labels (label:inbox), status (is:unread), attachments (has:attachment), dates (after:2023/1/1), and more. If specified, this takes precedence over labelIds.",
                      examples: ["label:inbox OR label:sent", "from:example@gmail.com is:unread", "has:attachment after:2023/1/1", "is:important is:unread"],
                      title: "Query",
                      type: "string",
                    },
                    userId: {
                      default: "me",
                      description: "The user's email address or 'me' for the authenticated user.",
                      examples: ["me"],
                      title: "Userid",
                      type: "string",
                    },
                  },
                  title: "NewMessageConfig",
                  type: "object",
                },
                payload: {
                  properties: {
                    attachment_list: {
                      anyOf: [{
                        items: {},
                        type: "array",
                      }, {
                        type: "null",
                      }],
                      default: null,
                      description: "The list of attachments in the message",
                      title: "Attachment List",
                    },
                    message_id: {
                      anyOf: [{
                        type: "string",
                      }, {
                        type: "null",
                      }],
                      default: null,
                      description: "The message ID of the message",
                      title: "Message ID",
                    },
                    message_text: {
                      anyOf: [{
                        type: "string",
                      }, {
                        type: "null",
                      }],
                      default: null,
                      description: "The text of the message",
                      title: "Message Text",
                    },
                    message_timestamp: {
                      anyOf: [{
                        type: "string",
                      }, {
                        type: "null",
                      }],
                      default: null,
                      description: "The timestamp of the message",
                      title: "Message Timestamp",
                    },
                    payload: {
                      anyOf: [{
                        type: "object",
                      }, {
                        type: "null",
                      }],
                      default: null,
                      description: "The payload of the message",
                      title: "Payload",
                    },
                    sender: {
                      anyOf: [{
                        type: "string",
                      }, {
                        type: "null",
                      }],
                      default: null,
                      description: "The sender of the message",
                      title: "Sender",
                    },
                    subject: {
                      anyOf: [{
                        type: "string",
                      }, {
                        type: "null",
                      }],
                      default: null,
                      description: "The subject of the message",
                      title: "Subject",
                    },
                    thread_id: {
                      anyOf: [{
                        type: "string",
                      }, {
                        type: "null",
                      }],
                      default: null,
                      description: "The thread ID of the message",
                      title: "Thread ID",
                    },
                    to: {
                      anyOf: [{
                        type: "string",
                      }, {
                        type: "null",
                      }],
                      default: null,
                      description: "The recipient of the message",
                      title: "To",
                    },
                  },
                  title: "NewMessagePayload",
                  type: "object",
                },
                type: "poll",
              },
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

          type GITHUB_FOLLOWER_EVENT_PAYLOAD = {
            /**
             * Username
             * @description Username of the github follower
             */
            username?: string;
          };

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
              COMMIT_EVENT: {
                slug: "GITHUB_COMMIT_EVENT",
                name: "Commit Event",
                description: "Triggered when a new commit is pushed to a repository.",
                instructions: "This trigger fires every time a new commit is pushed to the repository.",
                config: {
                  properties: {
                    owner: {
                      description: "Owner of the repository",
                      title: "Owner",
                      type: "string",
                    },
                    repo: {
                      description: "Repository name",
                      title: "Repo",
                      type: "string",
                    },
                  },
                  required: ["owner", "repo"],
                  title: "WebhookConfigSchema",
                  type: "object",
                },
                payload: {
                  properties: {
                    author: {
                      description: "The GitHub username of the commit author",
                      examples: ["octocat"],
                      title: "Author",
                      type: "string",
                    },
                    id: {
                      description: "The SHA of the commit",
                      examples: ["7638417db6d59f3c431d3e1f261cc637155684cd"],
                      title: "Id",
                      type: "string",
                    },
                    message: {
                      description: "The commit message",
                      examples: ["Fix typo in README"],
                      title: "Message",
                      type: "string",
                    },
                    timestamp: {
                      description: "The timestamp of the commit",
                      examples: ["2021-04-14T02:15:15Z"],
                      title: "Timestamp",
                      type: "string",
                    },
                    url: {
                      description: "The GitHub URL of the commit",
                      examples: ["https://github.com/octocat/Hello-World/commit/7638417db6d59f3c431d3e1f261cc637155684cd"],
                      title: "Url",
                      type: "string",
                    },
                  },
                  required: ["id", "message", "timestamp", "author", "url"],
                  title: "CommitPayloadSchema",
                  type: "object",
                },
                type: "webhook",
              },
              FOLLOWER_EVENT: {
                slug: "GITHUB_FOLLOWER_EVENT",
                name: "Follower Changes",
                description: "Triggers when there are changes in GitHub followers.",
                instructions: "**Instructions for Setting Up the Trigger:**\\n\\n    This trigger fires when there are changes in your GitHub followers.\\n    It detects new followers and unfollowers.\\n    ",
                config: {
                  properties: {
                    interval: {
                      default: 1,
                      description: "Periodic Interval to Check for Updates & Send a Trigger in Minutes",
                      title: "Interval",
                      type: "number",
                    },
                  },
                  title: "GithubFollowerConfig",
                  type: "object",
                },
                payload: {
                  properties: {
                    username: {
                      description: "Username of the github follower",
                      title: "Username",
                      type: "string",
                    },
                  },
                  required: ["username"],
                  title: "GithubFollowerPayload",
                  type: "object",
                },
                type: "poll",
              },
              ISSUE_ADDED_EVENT: {
                slug: "GITHUB_ISSUE_ADDED_EVENT",
                name: "Issue Added Event",
                description: "Triggered when a new issue is added to the repository.",
                instructions: "This trigger fires every time a new issue is added to the repository.",
                config: {
                  properties: {
                    owner: {
                      description: "Owner of the repository",
                      title: "Owner",
                      type: "string",
                    },
                    repo: {
                      description: "Repository name",
                      title: "Repo",
                      type: "string",
                    },
                  },
                  required: ["owner", "repo"],
                  title: "WebhookConfigSchema",
                  type: "object",
                },
                payload: {
                  properties: {
                    action: {
                      description: "The action that was performed on the issue",
                      examples: ["opened"],
                      title: "Action",
                      type: "string",
                    },
                    createdAt: {
                      description: "The timestamp when the issue was created",
                      examples: ["2021-04-14T02:15:15Z"],
                      title: "Createdat",
                      type: "string",
                    },
                    createdBy: {
                      description: "The GitHub username of the user who created the issue",
                      examples: ["octocat"],
                      title: "Createdby",
                      type: "string",
                    },
                    description: {
                      default: "",
                      description: "A detailed description of the issue",
                      examples: ["There is a bug in the code that needs to be fixed."],
                      title: "Description",
                      type: "string",
                    },
                    issue_id: {
                      description: "The unique ID assigned to the issue",
                      examples: [101],
                      title: "Issue Id",
                      type: "integer",
                    },
                    number: {
                      description: "The unique number assigned to the issue",
                      examples: [42],
                      title: "Number",
                      type: "integer",
                    },
                    title: {
                      description: "The title of the issue",
                      examples: ["Bug in code"],
                      title: "Title",
                      type: "string",
                    },
                    url: {
                      description: "The GitHub URL of the issue",
                      examples: ["https://github.com/octocat/Hello-World/issues/42"],
                      title: "Url",
                      type: "string",
                    },
                  },
                  required: ["action", "issue_id", "number", "title", "createdBy", "createdAt", "url"],
                  title: "IssueAddedPayloadSchema",
                  type: "object",
                },
                type: "webhook",
              },
              LABEL_ADDED_EVENT: {
                slug: "GITHUB_LABEL_ADDED_EVENT",
                name: "Label Added Event",
                description: "Triggered when a new label is added to a pull request.",
                instructions: "This trigger fires every time a new label is added to a pull request on the repository.",
                config: {
                  properties: {
                    owner: {
                      description: "Owner of the repository",
                      title: "Owner",
                      type: "string",
                    },
                    repo: {
                      description: "Repository name",
                      title: "Repo",
                      type: "string",
                    },
                  },
                  required: ["owner", "repo"],
                  title: "WebhookConfigSchema",
                  type: "object",
                },
                payload: {
                  properties: {
                    action: {
                      description: "The action that was performed on the label",
                      examples: ["labeled"],
                      title: "Action",
                      type: "string",
                    },
                    label: {
                      description: "The name of the label that was added",
                      examples: ["bug", "enhancement"],
                      title: "Label",
                      type: "string",
                    },
                    labeled_at: {
                      description: "The timestamp when the label was added",
                      examples: ["2021-04-14T02:15:15Z"],
                      title: "Labeled At",
                      type: "string",
                    },
                    labeled_by: {
                      description: "The GitHub username of the user who added the label",
                      examples: ["octocat"],
                      title: "Labeled By",
                      type: "string",
                    },
                    pull_request_number: {
                      description: "The unique number assigned to the pull request",
                      examples: [42],
                      title: "Pull Request Number",
                      type: "integer",
                    },
                    pull_request_title: {
                      description: "The title of the pull request",
                      examples: ["Fix typo in README"],
                      title: "Pull Request Title",
                      type: "string",
                    },
                    pull_request_url: {
                      description: "The GitHub URL of the pull request",
                      examples: ["https://github.com/octocat/Hello-World/pull/42"],
                      title: "Pull Request Url",
                      type: "string",
                    },
                  },
                  required: ["action", "label", "pull_request_number", "pull_request_title", "pull_request_url", "labeled_by", "labeled_at"],
                  title: "LabelAddedPayloadSchema",
                  type: "object",
                },
                type: "webhook",
              },
              PULL_REQUEST_EVENT: {
                slug: "GITHUB_PULL_REQUEST_EVENT",
                name: "Pull Request Event",
                description: "Triggered when a pull request is opened, closed, or synchronized.",
                instructions: "This trigger fires every time a pull request is opened, closed, or synchronized on the repository.",
                config: {
                  properties: {
                    owner: {
                      description: "Owner of the repository",
                      title: "Owner",
                      type: "string",
                    },
                    repo: {
                      description: "Repository name",
                      title: "Repo",
                      type: "string",
                    },
                  },
                  required: ["owner", "repo"],
                  title: "WebhookConfigSchema",
                  type: "object",
                },
                payload: {
                  properties: {
                    action: {
                      description: "The action that was performed on the pull request",
                      examples: ["opened", "closed", "synchronize"],
                      title: "Action",
                      type: "string",
                    },
                    createdAt: {
                      description: "The timestamp when the pull request was created",
                      examples: ["2021-04-14T02:15:15Z"],
                      title: "Createdat",
                      type: "string",
                    },
                    createdBy: {
                      description: "The GitHub username of the user who created the pull request",
                      examples: ["octocat"],
                      title: "Createdby",
                      type: "string",
                    },
                    description: {
                      default: "",
                      description: "A detailed description of the pull request",
                      examples: ["This pull request fixes a typo found in the README file under the 'Installation' section."],
                      title: "Description",
                      type: "string",
                    },
                    number: {
                      description: "The unique number assigned to the pull request",
                      examples: [42],
                      title: "Number",
                      type: "integer",
                    },
                    title: {
                      description: "The title of the pull request",
                      examples: ["Fix typo in README"],
                      title: "Title",
                      type: "string",
                    },
                    url: {
                      description: "The GitHub URL of the pull request",
                      examples: ["https://github.com/octocat/Hello-World/pull/42"],
                      title: "Url",
                      type: "string",
                    },
                  },
                  required: ["action", "number", "title", "createdBy", "createdAt", "url"],
                  title: "PullRequestPayloadSchema",
                  type: "object",
                },
                type: "webhook",
              },
              STAR_ADDED_EVENT: {
                slug: "GITHUB_STAR_ADDED_EVENT",
                name: "Star Added Event",
                description: "Triggered when a new star is added to the repository.",
                instructions: "This trigger fires every time a new star is added to the repository.",
                config: {
                  properties: {
                    owner: {
                      description: "Owner of the repository",
                      title: "Owner",
                      type: "string",
                    },
                    repo: {
                      description: "Repository name",
                      title: "Repo",
                      type: "string",
                    },
                  },
                  required: ["owner", "repo"],
                  title: "WebhookConfigSchema",
                  type: "object",
                },
                payload: {
                  properties: {
                    action: {
                      description: "The action that was performed on the star",
                      examples: ["created"],
                      title: "Action",
                      type: "string",
                    },
                    repository_id: {
                      description: "The unique ID assigned to the repository",
                      examples: [101],
                      title: "Repository Id",
                      type: "integer",
                    },
                    repository_name: {
                      description: "The name of the repository",
                      examples: ["Hello-World"],
                      title: "Repository Name",
                      type: "string",
                    },
                    repository_url: {
                      description: "The GitHub URL of the repository",
                      examples: ["https://github.com/octocat/Hello-World"],
                      title: "Repository Url",
                      type: "string",
                    },
                    starred_at: {
                      description: "The timestamp when the star was added",
                      examples: ["2021-04-14T02:15:15Z"],
                      title: "Starred At",
                      type: "string",
                    },
                    starred_by: {
                      description: "The GitHub username of the user who added the star",
                      examples: ["octocat"],
                      title: "Starred By",
                      type: "string",
                    },
                  },
                  required: ["action", "starred_at", "repository_id", "repository_name", "repository_url", "starred_by"],
                  title: "StarAddedPayloadSchema",
                  type: "object",
                },
                type: "webhook",
              },
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
          "/**
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
                GOOGLE_DRIVE_CHANGES: {
                  slug: "GOOGLEDRIVE_GOOGLE_DRIVE_CHANGES",
                  name: "Google Drive Changes",
                  description: "Triggers when changes are detected in a Google Drive.",
                  instructions: "\\n    **Instructions for Setting Up the Trigger:**\\n    - Ensure you have set the necessary permissions to access Google Drive.\\n    ",
                  config: {
                    description: "Configuration for Google Drive trigger",
                    properties: {},
                    title: "DriveConfig",
                    type: "object",
                  },
                  payload: {
                    description: "Schema for Google Drive trigger payload.\\nCurrently no specific fields are present, but may include\\nconfiguration options in the future.",
                    properties: {},
                    title: "DrivePayload",
                    type: "object",
                  },
                  type: "poll",
                },
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
  });
});
