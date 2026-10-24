import { z } from 'zod';
import slackBot from './slack-bot-source.json';
import localWorkbench from './local-workbench-source.json';
import standup from './standup-bot-source.json';
import imessage from './imessage-source.json';

const sourceFiles = z.array(z.object({ path: z.string(), contents: z.string(), composio: z.boolean() }));

/** The renderer and example inventory must resolve the same committed files. */
export const EXAMPLE_SOURCES = {
  'slack-bot': sourceFiles.parse(slackBot),
  'local-workbench': sourceFiles.parse(localWorkbench),
  standup: sourceFiles.parse(standup),
  imessage: sourceFiles.parse(imessage),
};

export const EXAMPLE_SOURCE_REASONS: Record<keyof typeof EXAMPLE_SOURCES, string> = {
  'slack-bot': 'Pi agent runtime and PiProvider are TypeScript-only; this is a complete Pi application, not a standalone REST operation',
  'local-workbench': 'The local-workbench factory is available only in @composio/experimental; its sandbox helper runs Python inside that TypeScript host',
  standup: 'The application uses the TypeScript-only Vercel AI SDK runtime and Slack framework handlers',
  imessage: 'The local iMessage application uses the TypeScript-only eve provider and macOS automation',
};

export const EXAMPLE_BUILD_SOURCES: Record<string, keyof typeof EXAMPLE_SOURCES> = {
  bot: 'slack-bot',
  install: 'slack-bot',
  reviewer: 'local-workbench',
  setup: 'standup',
  proxy: 'standup',
  buttons: 'standup',
  draft: 'standup',
  wiring: 'imessage',
  send: 'imessage',
};
