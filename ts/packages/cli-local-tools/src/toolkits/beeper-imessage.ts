import { z } from 'zod/v3';
import { runLocalCommand } from '../runtime';
import type {
  LocalCommandExecution,
  LocalExecutionContext,
  LocalExecutionResult,
  LocalToolkitDeclaration,
  LocalToolDeclaration,
} from '../types';

const IMESSAGE_CLI_BINARY_ID = 'beeper-imessage-cli';
const IMESSAGE_CLI_VERSION = '0.21.0';
const COMMAND_TIMEOUT_MS = 120_000;

const baseInput = z.object({
  dataDir: z
    .string()
    .min(1)
    .optional()
    .describe('Optional directory for imessage-cli state. Defaults to a temporary directory.'),
  useSecondaryInstance: z
    .boolean()
    .default(true)
    .describe(
      'Use a secondary Messages.app instance. Disable to control the existing Messages.app.'
    ),
  verbose: z.boolean().default(false).describe('Enable verbose imessage-cli logging.'),
});

const cursorInput = z.object({
  before: z.string().min(1).optional().describe('Fetch items older than this cursor.'),
  after: z.string().min(1).optional().describe('Fetch items newer than this cursor.'),
});

const cliOutput = z.object({
  ok: z.boolean(),
  commandName: z.string(),
  callId: z.string().optional(),
  durationMs: z.number().optional(),
  result: z.unknown().optional(),
  resultText: z.string().optional(),
  stdout: z.string(),
  stderr: z.string(),
});

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(item => String(item)) : [];

const stringValue = (value: unknown): string => String(value ?? '');

const optionalString = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : undefined;
};

const absolutePath = (value: unknown): string => stringValue(value);

const buildGlobalArgs = (input: Record<string, unknown>): string[] => {
  const args: string[] = [];
  const dataDir = optionalString(input.dataDir);
  if (dataDir) args.push('--data-dir', dataDir);
  if (input.useSecondaryInstance === false) args.push('--no-use-secondary-instance');
  // Local tools are one-shot calls. Avoid keeping DB event watchers open unless a
  // future streaming tool explicitly opts in.
  args.push('--no-events');
  if (input.verbose === true) args.push('--verbose');
  return args;
};

const withCursorArgs = (input: Record<string, unknown>, args: string[]): string[] => {
  const before = optionalString(input.before);
  const after = optionalString(input.after);
  if (before && after) throw new Error('Use only one of before or after.');
  if (before) args.push('--before', before);
  if (after) args.push('--after', after);
  return args;
};

const stripAnsi = (text: string): string => text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');

const parseImessageCliOutput = (
  commandName: string,
  stdout: string,
  stderr: string
): LocalExecutionResult => {
  const cleanStdout = stripAnsi(stdout);
  const lines = cleanStdout.split(/\r?\n/);
  const okIndex = lines.findIndex(line => /^\[\d+\] ok /.test(line));
  const okLine = okIndex >= 0 ? lines[okIndex] : undefined;
  const match = okLine?.match(/^\[(\d+)\] ok \S+ \((\d+(?:\.\d+)?)ms\)$/);

  const resultLines = okIndex >= 0 ? lines.slice(okIndex + 1) : lines;
  const resultText = resultLines
    .filter(line => line.trim() !== 'Exiting...')
    .join('\n')
    .trim();

  let parsed: unknown;
  if (resultText) {
    try {
      parsed = JSON.parse(resultText) as unknown;
    } catch {
      parsed = undefined;
    }
  }

  return {
    ok: true,
    commandName,
    ...(match?.[1] ? { callId: match[1] } : {}),
    ...(match?.[2] ? { durationMs: Number(match[2]) } : {}),
    ...(parsed !== undefined ? { result: parsed } : {}),
    ...(resultText ? { resultText } : {}),
    stdout,
    stderr,
  };
};

const runImessageCli = async (
  commandName: string,
  commandArgs: ReadonlyArray<string>,
  input: Record<string, unknown>,
  context: LocalExecutionContext
): Promise<LocalExecutionResult> => {
  const execution: LocalCommandExecution = {
    kind: 'command',
    command: {
      bundledBinary: IMESSAGE_CLI_BINARY_ID,
      fallbackCommand: 'imessage-cli',
    },
    args: [...buildGlobalArgs(input), commandName, ...commandArgs],
    timeoutMs: COMMAND_TIMEOUT_MS,
  };
  const result = await runLocalCommand(execution, input, context);
  return parseImessageCliOutput(
    commandName,
    String(result.stdout ?? ''),
    String(result.stderr ?? '')
  );
};

const commandTool = <TInput extends z.ZodTypeAny>(definition: {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly inputParams: TInput;
  readonly command: string;
  readonly args: (input: z.infer<TInput>) => ReadonlyArray<string>;
}): LocalToolDeclaration<TInput> => ({
  slug: definition.slug,
  name: definition.name,
  description: definition.description,
  platforms: ['darwin-arm64', 'darwin-x64'],
  inputParams: definition.inputParams,
  outputParams: cliOutput,
  execution: {
    kind: 'native',
    execute: (input, context) =>
      runImessageCli(definition.command, definition.args(input as z.infer<TInput>), input, context),
  },
});

const threadId = z
  .string()
  .min(1)
  .describe('platform-imessage chat/thread ID, e.g. any;-;user@example.com.');
const messageId = z.string().min(1).describe('platform-imessage message ID.');
const text = z.string().min(1).describe('Message text.');
const filePath = z.string().min(1).describe('Local file path to attach.');

export const beeperImessageToolkit: LocalToolkitDeclaration = {
  slug: 'BEEPER_IMESSAGE',
  name: 'Beeper iMessage (local)',
  description:
    'Local macOS iMessage tools backed by Beeper platform-imessage imessage-cli. Reads ~/Library/Messages and automates Messages.app for send/reaction/chat mutations.',
  platforms: ['darwin-arm64', 'darwin-x64'],
  source: {
    type: 'cli',
    repository: 'https://github.com/ComposioHQ/platform-imessage',
    command: 'imessage-cli',
  },
  bundledBinaries: [
    {
      id: IMESSAGE_CLI_BINARY_ID,
      description: `Beeper platform-imessage imessage-cli ${IMESSAGE_CLI_VERSION}.`,
      targets: [
        {
          platforms: ['darwin-arm64'],
          path: 'beeper-imessage/darwin-arm64/imessage-cli',
        },
        {
          platforms: ['darwin-x64'],
          path: 'beeper-imessage/darwin-x64/imessage-cli',
        },
      ],
    },
  ],
  setup: {
    install:
      'The CLI ships a bundled imessage-cli binary built from the ts/packages/cli-local-tools/vendor/platform-imessage submodule. Alternatively install/build imessage-cli and set a command override in ~/composio/local_tools.json.',
    commandOverrides: [
      'composio local-tools configure BEEPER_IMESSAGE --command /path/to/imessage-cli',
    ],
    notes: [
      'Requires macOS with Messages.app configured for iMessage.',
      'Read-only tools require Messages Data access. Mutating tools require Messages Data and Accessibility; some setup flows may also request Contacts or Automation.',
      'Run LOCAL_BEEPER_IMESSAGE_AUTHORIZE (or imessage-cli authorize) to inspect/request permissions.',
    ],
  },
  tools: [
    commandTool({
      slug: 'VERSION',
      name: 'Get imessage-cli version',
      description:
        'Print the bundled Beeper platform-imessage CLI version without touching Messages.app.',
      inputParams: baseInput,
      command: 'version',
      args: () => [],
    }),
    commandTool({
      slug: 'AUTHORIZE',
      name: 'Inspect or request iMessage local permissions',
      description:
        'Run imessage-cli authorize for Accessibility, Contacts, Messages Data, and Automation permissions. This may open macOS prompts or System Settings.',
      inputParams: baseInput.extend({
        target: z
          .enum(['all', 'accessibility', 'contacts', 'messages-data', 'automation'])
          .default('all')
          .describe('Permission target to inspect/request.'),
      }),
      command: 'authorize',
      args: input => [input.target],
    }),
    commandTool({
      slug: 'CURRENT_USER',
      name: 'Get current iMessage user',
      description:
        'Return the iMessage identity known to the local platform-imessage backend. Requires Messages Data access.',
      inputParams: baseInput,
      command: 'current-user',
      args: () => [],
    }),
    commandTool({
      slug: 'LIST_THREADS',
      name: 'List iMessage threads',
      description:
        'List normal-inbox iMessage chats from the local Messages database, optionally using cursors.',
      inputParams: baseInput.merge(cursorInput),
      command: 'threads',
      args: input => withCursorArgs(input, []),
    }),
    commandTool({
      slug: 'GET_THREAD',
      name: 'Get iMessage thread',
      description: 'Fetch a single iMessage chat/thread by platform-imessage thread ID.',
      inputParams: baseInput.extend({ threadId }),
      command: 'thread',
      args: input => [input.threadId],
    }),
    commandTool({
      slug: 'LIST_MESSAGES',
      name: 'List iMessage messages',
      description:
        'List messages in a chat from the local Messages database, optionally using cursors.',
      inputParams: baseInput.merge(cursorInput).extend({ threadId }),
      command: 'messages',
      args: input => withCursorArgs(input, [input.threadId]),
    }),
    commandTool({
      slug: 'GET_MESSAGE',
      name: 'Get iMessage message',
      description: 'Fetch a single message by chat/thread ID and message ID.',
      inputParams: baseInput.extend({ threadId, messageId }),
      command: 'message',
      args: input => [input.threadId, input.messageId],
    }),
    commandTool({
      slug: 'SEARCH_MESSAGES',
      name: 'Search local iMessage messages',
      description: 'Search local iMessage messages by text. Requires Messages Data access.',
      inputParams: baseInput.extend({ query: z.string().min(1).describe('Text to search for.') }),
      command: 'search',
      args: input => [input.query],
    }),
    commandTool({
      slug: 'CREATE_THREAD_AND_SEND',
      name: 'Create iMessage thread and send message',
      description:
        'Create or resolve a chat for one or more recipients and send the initial message. Mutates real Messages state.',
      inputParams: baseInput.extend({
        recipients: z
          .array(z.string().min(1))
          .min(1)
          .describe('Recipient phone numbers or emails.'),
        message: text,
      }),
      command: 'create-thread',
      args: input => [...stringArray(input.recipients), '--message', input.message],
    }),
    commandTool({
      slug: 'SEND_MESSAGE',
      name: 'Send iMessage text',
      description: 'Send a text message to an existing chat/thread. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId, text }),
      command: 'send',
      args: input => [input.threadId, input.text],
    }),
    commandTool({
      slug: 'REPLY_TO_MESSAGE',
      name: 'Reply to iMessage message',
      description: 'Reply to a specific iMessage with text. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId, messageId, text }),
      command: 'reply',
      args: input => [input.threadId, input.messageId, input.text],
    }),
    commandTool({
      slug: 'SEND_FILE',
      name: 'Send iMessage file attachment',
      description:
        'Send a local file attachment to an existing chat/thread. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId, filePath }),
      command: 'send-file',
      args: input => [input.threadId, absolutePath(input.filePath)],
    }),
    commandTool({
      slug: 'REPLY_WITH_FILE',
      name: 'Reply to iMessage with file attachment',
      description:
        'Reply to a specific message with a local file attachment. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId, messageId, filePath }),
      command: 'reply-file',
      args: input => [input.threadId, input.messageId, absolutePath(input.filePath)],
    }),
    commandTool({
      slug: 'EDIT_MESSAGE',
      name: 'Edit sent iMessage',
      description:
        'Edit a previously sent iMessage. Supported by upstream on macOS Ventura or later.',
      inputParams: baseInput.extend({ threadId, messageId, text }),
      command: 'edit',
      args: input => [input.threadId, input.messageId, input.text],
    }),
    commandTool({
      slug: 'UNDO_SEND',
      name: 'Undo sent iMessage',
      description:
        'Undo send for a previously sent iMessage. Upstream supports this on macOS Ventura or later within the Messages time limit.',
      inputParams: baseInput.extend({ threadId, messageId }),
      command: 'undo-send',
      args: input => [input.threadId, input.messageId],
    }),
    commandTool({
      slug: 'REACT_TO_MESSAGE',
      name: 'React to iMessage',
      description: 'Add a standard reaction to a message using a supported key or emoji.',
      inputParams: baseInput.extend({
        threadId,
        messageId,
        reaction: z
          .string()
          .min(1)
          .describe(
            'Reaction key or emoji. Standard keys: heart, like, dislike, laugh, emphasize, question.'
          ),
      }),
      command: 'react',
      args: input => [input.threadId, input.messageId, input.reaction],
    }),
    commandTool({
      slug: 'UNREACT_FROM_MESSAGE',
      name: 'Remove iMessage reaction',
      description: 'Remove a standard reaction from a message using a supported key or emoji.',
      inputParams: baseInput.extend({
        threadId,
        messageId,
        reaction: z
          .string()
          .min(1)
          .describe(
            'Reaction key or emoji. Standard keys: heart, like, dislike, laugh, emphasize, question.'
          ),
      }),
      command: 'unreact',
      args: input => [input.threadId, input.messageId, input.reaction],
    }),
    commandTool({
      slug: 'MARK_READ',
      name: 'Mark iMessage thread read',
      description:
        'Mark a chat/thread as read by sending a read receipt. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId }),
      command: 'mark-read',
      args: input => [input.threadId],
    }),
    commandTool({
      slug: 'MARK_UNREAD',
      name: 'Mark iMessage thread unread',
      description: 'Mark a chat/thread as unread. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId }),
      command: 'mark-unread',
      args: input => [input.threadId],
    }),
    commandTool({
      slug: 'MUTE_THREAD',
      name: 'Mute iMessage thread',
      description: 'Mute a chat/thread indefinitely. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId }),
      command: 'mute',
      args: input => [input.threadId],
    }),
    commandTool({
      slug: 'UNMUTE_THREAD',
      name: 'Unmute iMessage thread',
      description: 'Unmute a chat/thread. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId }),
      command: 'unmute',
      args: input => [input.threadId],
    }),
    commandTool({
      slug: 'SEND_TYPING_STATUS',
      name: 'Send iMessage typing status',
      description: 'Send typing on/off status for a chat/thread. Mutates real Messages state.',
      inputParams: baseInput.extend({
        threadId,
        status: z.enum(['on', 'off']).describe('Typing status to send.'),
      }),
      command: 'typing',
      args: input => [input.threadId, input.status],
    }),
    commandTool({
      slug: 'NOTIFY_ANYWAY',
      name: 'Notify anyway for iMessage thread',
      description:
        'Trigger the Messages "notify anyway" action for a chat/thread. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId }),
      command: 'notify-anyway',
      args: input => [input.threadId],
    }),
    commandTool({
      slug: 'DELETE_THREAD',
      name: 'Delete iMessage thread',
      description:
        'Delete a chat/thread from Messages. Requires confirm=true because this mutates real Messages state.',
      inputParams: baseInput.extend({
        threadId,
        confirm: z.literal(true).describe('Must be true to delete the thread.'),
      }),
      command: 'delete-thread',
      args: input => [input.threadId],
    }),
  ],
};
