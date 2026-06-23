import slackBot from './slack-bot-source.json';
import standup from './standup-bot-source.json';

interface SourceFile {
  path: string;
  contents: string;
  composio: boolean;
}

// Project snapshots keyed by example. <RepoBrowser source="..."> selects one;
// the default keeps existing pages (the Pi/slack-bot example) working untouched.
export const SOURCES: Record<string, SourceFile[]> = {
  'slack-bot': slackBot as SourceFile[],
  standup: standup as SourceFile[],
};

export type SourceName = keyof typeof SOURCES;
