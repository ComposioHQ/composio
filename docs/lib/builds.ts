import { FILE_BUILDS as slackBot } from './slack-bot-build';
import { FILE_BUILDS as standup } from './standup-bot-build';

// Build datasets keyed by example. <FileBuildup source="..."> selects one;
// the default keeps existing pages (the Pi/slack-bot example) working untouched.
export const BUILDS = {
  'slack-bot': slackBot,
  standup,
} as const;

export type BuildSource = keyof typeof BUILDS;
