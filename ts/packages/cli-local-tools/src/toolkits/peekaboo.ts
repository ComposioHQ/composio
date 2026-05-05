import { z } from 'zod/v3';
import type { LocalToolkitDeclaration } from '../types';

const darwin = ['darwin-arm64', 'darwin-x64'] as const;

const peekabooCommand = () => process.env.COMPOSIO_PEEKABOO_CLI ?? 'peekaboo';

export const peekabooToolkit: LocalToolkitDeclaration = {
  slug: 'PEEKABOO',
  name: 'Peekaboo',
  description:
    'Local macOS screen, app, and accessibility automation via the Peekaboo CLI by steipete. The binary can be overridden with COMPOSIO_PEEKABOO_CLI or ~/composio/local_tools.json.',
  platforms: darwin,
  source: {
    type: 'cli',
    repository: 'https://github.com/steipete/Peekaboo',
    command: 'peekaboo',
  },
  tools: [
    {
      slug: 'RUN_CLI',
      name: 'Run Peekaboo CLI',
      description:
        'Run the Peekaboo CLI directly for screenshots, app/window inspection, accessibility tree inspection, clicks, typing, and other macOS UI automation workflows.',
      platforms: darwin,
      inputParams: z.object({
        args: z.array(z.string()).describe('Arguments to pass to the Peekaboo CLI binary.'),
        stdin: z.string().optional().describe('Optional stdin to send to the process.'),
      }),
      execution: {
        kind: 'command',
        command: peekabooCommand,
        args: input => (Array.isArray(input.args) ? input.args.map(String) : []),
        stdin: input => (typeof input.stdin === 'string' ? input.stdin : undefined),
        parseJson: true,
      },
    },
    {
      slug: 'HELP',
      name: 'Peekaboo CLI Help',
      description:
        'Print Peekaboo CLI help so an agent can inspect the installed command surface before calling RUN_CLI.',
      platforms: darwin,
      inputParams: z.object({}),
      execution: {
        kind: 'command',
        command: peekabooCommand,
        args: ['--help'],
      },
    },
  ],
};
