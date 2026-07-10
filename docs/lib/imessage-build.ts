/**
 * Cumulative stages of the iMessage SEND tool, built up one piece at a time.
 * Each stage's `code` is the full file at that point; <FileBuildup>
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

const wiringClient = `import { Composio } from '@composio/core';
import { EveProvider, requireApprovalForTools } from '@composio/experimental/eve';

export const composio = new Composio({
  provider: new EveProvider({
    needsApproval: requireApprovalForTools('LOCAL_IMESSAGE_SEND'),
  }),
});
`;

const wiringSession = `import { Composio } from '@composio/core';
import { EveProvider, requireApprovalForTools } from '@composio/experimental/eve';

export const composio = new Composio({
  provider: new EveProvider({
    needsApproval: requireApprovalForTools('LOCAL_IMESSAGE_SEND'),
  }),
});

export const session = composio.sessions.create('user_123');
`;

const wiringToolkit = `import { Composio } from '@composio/core';
import { EveProvider, requireApprovalForTools } from '@composio/experimental/eve';
import { createImessageToolkit } from './imessage';

export const composio = new Composio({
  provider: new EveProvider({
    needsApproval: requireApprovalForTools('LOCAL_IMESSAGE_SEND'),
  }),
});

export const session = composio.sessions.create('user_123', {
  experimental: { customToolkits: [createImessageToolkit()] },
});
`;

export const FILE_BUILDS: Record<string, { file: string; stages: BuildStage[] }> = {
  wiring: {
    file: 'composio.ts',
    stages: [
      {
        title: 'Client with the eve provider',
        description:
          'The eve provider makes session.tools() return eve-native tools, so eve can call them directly.',
        code: wiringClient,
      },
      {
        title: 'A session for the user',
        description:
          'sessions.create scopes the toolset to one user. It already exposes the whole Composio catalog.',
        code: wiringSession,
      },
      {
        title: 'Register the local toolkit',
        description:
          'Pass the custom toolkit so the local iMessage tools join the catalog on the same session.',
        code: wiringToolkit,
      },
    ],
  },
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
        description:
          'Declare the input schema with zod/v3, which the Composio custom-tool API expects.',
        code: typed,
      },
      {
        title: 'Send via AppleScript',
        description:
          'The execute runs locally on your Mac, driving Messages.app through osascript.',
        code: full,
      },
    ],
  },
};
