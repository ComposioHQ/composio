import type { TriggerType } from 'src/models/trigger-types';

export const TRIGGER_TYPE_GMAIL = {
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
} satisfies TriggerType;
