import { z } from 'zod/v3';
import type { LocalToolkitDeclaration } from '../types';

const darwin = ['darwin-arm64', 'darwin-x64'] as const;

const beeperCommand = () => process.env.COMPOSIO_BEEPER_IMESSAGE_CLI ?? 'imessage';

export const beeperImessageToolkit: LocalToolkitDeclaration = {
  slug: 'BEEPER_IMESSAGE',
  name: 'Beeper iMessage',
  description:
    'Local macOS iMessage automation via a Beeper platform-imessage CLI build. The binary can be overridden with COMPOSIO_BEEPER_IMESSAGE_CLI or ~/composio/local_tools.json.',
  platforms: darwin,
  source: {
    type: 'cli',
    repository: 'https://github.com/beeper/platform-imessage',
    command: 'imessage',
  },
  tools: [
    {
      slug: 'SEND_MESSAGE',
      name: 'Send iMessage',
      description:
        'Draft mapping for sending an iMessage through the local Beeper/platform-imessage CLI. Override the binary or use RUN_CLI if your local build exposes different subcommands.',
      platforms: darwin,
      inputParams: z.object({
        recipient: z.string().describe('Phone number, email, handle, or chat identifier to send to.'),
        text: z.string().describe('Message body.'),
      }),
      execution: {
        kind: 'command',
        command: beeperCommand,
        args: input => ['send', String(input.recipient), String(input.text)],
        parseJson: true,
      },
    },
    {
      slug: 'RUN_CLI',
      name: 'Run Beeper iMessage CLI',
      description:
        'Run the local Beeper/platform-imessage CLI directly. Use this for platform-imessage functionality that has not been mapped to a first-class Composio local tool yet.',
      platforms: darwin,
      inputParams: z.object({
        args: z.array(z.string()).describe('Arguments to pass to the iMessage CLI binary.'),
        stdin: z.string().optional().describe('Optional stdin to send to the process.'),
      }),
      execution: {
        kind: 'command',
        command: beeperCommand,
        args: input => (Array.isArray(input.args) ? input.args.map(String) : []),
        stdin: input => (typeof input.stdin === 'string' ? input.stdin : undefined),
        parseJson: true,
      },
    },
  ],
};
