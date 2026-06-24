/**
 * Cumulative stages of the iMessage SEND tool, built up one piece at a time.
 * Each stage's `code` is the full file at that point; <ImessageFileBuildup>
 * diffs consecutive stages so the reader watches the tool grow.
 */
export interface BuildStage {
  title: string;
  description: string;
  /** Full file contents at this stage. */
  code: string;
}

const shell = `import { experimental_createTool } from '@composio/core';
import { z } from 'zod/v3';

export const sendMessage = experimental_createTool('SEND', {
  name: 'Send iMessage',
  description: 'Send an iMessage from your Mac to a phone number or iMessage email.',
  preload: true,
  inputParams: z.object({}),
  execute: async () => ({ sent: false }),
});
`;

const typed = `import { experimental_createTool } from '@composio/core';
import { z } from 'zod/v3';

export const sendMessage = experimental_createTool('SEND', {
  name: 'Send iMessage',
  description: 'Send an iMessage from your Mac to a phone number or iMessage email.',
  preload: true,
  inputParams: z.object({
    to: z.string().describe('Phone number or iMessage email.'),
    text: z.string().describe('Message body to send.'),
  }),
  execute: async () => ({ sent: false }),
});
`;

const full = `import { experimental_createTool } from '@composio/core';
import { z } from 'zod/v3';
import { runAppleScript, SEND_SCRIPT } from './applescript';

export const sendMessage = experimental_createTool('SEND', {
  name: 'Send iMessage',
  description: 'Send an iMessage from your Mac to a phone number or iMessage email.',
  preload: true,
  inputParams: z.object({
    to: z.string().describe('Phone number or iMessage email.'),
    text: z.string().describe('Message body to send.'),
  }),
  execute: async ({ to, text }) => {
    await runAppleScript(SEND_SCRIPT, [to, text]);
    return { sent: true, to };
  },
});
`;

export const FILE_BUILDS = {
  send: {
    file: 'imessage/send-message.ts',
    stages: [
      {
        title: 'The tool shell',
        description:
          'A custom tool is a slug, a description, and an execute. preload:true surfaces it in session.tools() without a search step.',
        code: shell,
      },
      {
        title: 'Typed inputs',
        description: 'Declare the input schema with zod/v3, which the Composio custom-tool API expects.',
        code: typed,
      },
      {
        title: 'Send via AppleScript',
        description: 'The execute runs locally on your Mac, driving Messages.app through osascript.',
        code: full,
      },
    ],
  },
} as const;
