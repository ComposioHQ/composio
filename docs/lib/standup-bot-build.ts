/**
 * Cumulative stages of the standup-bot example's files, built up one piece at a
 * time. Each stage's `code` is the full file at that point; <FileBuildup> diffs
 * consecutive stages so the reader watches the file grow.
 *
 * These are teaching versions: tighter than the real repo (which factors helpers
 * into separate files), but the same Composio calls. <RepoBrowser> shows the
 * real split.
 */

export interface BuildStage {
  title: string;
  description: string;
  /** Full file contents at this stage. */
  code: string;
}

// ── setup.ts: connect the bot's own Slack app ───────────────────────────────

const setup1 = `import { Composio } from '@composio/core';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const AUTH_CONFIG = process.env.COMPOSIO_SLACKBOT_AUTH_CONFIG_ID!;

// Connect the bot's own Slack app once, so it can post and DM as the bot.
async function main() {
  const session = await composio.create('default', {
    authConfigs: { slackbot: AUTH_CONFIG },
  });

  const toolkits = await session.toolkits({ toolkits: ['slackbot'] });
  const active = toolkits.items.find((t) => t.slug === 'slackbot')?.connection?.isActive;
  if (active) {
    console.log('Bot already connected.');
    return;
  }
}

main();
`;

const setup2 = `import { Composio } from '@composio/core';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const AUTH_CONFIG = process.env.COMPOSIO_SLACKBOT_AUTH_CONFIG_ID!;

// Connect the bot's own Slack app once, so it can post and DM as the bot.
async function main() {
  const session = await composio.create('default', {
    authConfigs: { slackbot: AUTH_CONFIG },
  });

  const toolkits = await session.toolkits({ toolkits: ['slackbot'] });
  const active = toolkits.items.find((t) => t.slug === 'slackbot')?.connection?.isActive;
  if (active) {
    console.log('Bot already connected.');
    return;
  }

  // Not connected: print the OAuth link, then poll until it goes active.
  const { redirectUrl } = await session.authorize('slackbot');
  console.log('Authorize the bot:', redirectUrl);

  while (true) {
    await new Promise((r) => setTimeout(r, 3000));
    const check = await session.toolkits({ toolkits: ['slackbot'] });
    if (check.items.find((t) => t.slug === 'slackbot')?.connection?.isActive) {
      console.log('Bot connected.');
      break;
    }
  }
}

main();
`;

// ── slack.ts: talk to the Slack Web API through the proxy ───────────────────

const proxy1 = `import { composio } from './composio';

// The bot's slackbot connected account. proxyExecute authenticates as it, so we
// never hold a Slack token: Composio signs each request with the connection.
async function botAccountId() {
  const res = await composio.connectedAccounts.list({
    userIds: ['default'],
    toolkitSlugs: ['slackbot'],
    statuses: ['ACTIVE'],
  });
  return res.items[0]?.id;
}

// Call any Slack Web API endpoint as the bot. The proxy reaches endpoints the
// named SLACKBOT_* tools don't wrap, and returns Slack's JSON under \`data\`.
async function slackApi(endpoint: string, body: Record<string, unknown>) {
  const connectedAccountId = await botAccountId();
  const res = await composio.tools.proxyExecute({
    endpoint,
    method: 'POST',
    body,
    connectedAccountId,
  });
  return (res as { data?: unknown }).data ?? res;
}

// Post a message into a channel, as the bot.
export function postMessage(channel: string, text: string) {
  return slackApi('/chat.postMessage', { channel, text });
}
`;

const proxy2 = `import { composio } from './composio';

async function botAccountId() {
  const res = await composio.connectedAccounts.list({
    userIds: ['default'],
    toolkitSlugs: ['slackbot'],
    statuses: ['ACTIVE'],
  });
  return res.items[0]?.id;
}

// Same proxy call, but the connected account is a parameter, so we can post as
// the bot OR as an individual member.
async function slackApi(
  endpoint: string,
  body: Record<string, unknown>,
  accountId?: string,
) {
  const connectedAccountId = accountId ?? (await botAccountId());
  const res = await composio.tools.proxyExecute({
    endpoint,
    method: 'POST',
    body,
    connectedAccountId,
  });
  return (res as { data?: unknown }).data ?? res;
}

export function postMessage(channel: string, text: string) {
  return slackApi('/chat.postMessage', { channel, text });
}

// A member's own active Slack account, so the standup posts under THEIR name.
async function memberAccountId(memberEmail: string) {
  const res = await composio.connectedAccounts.list({
    userIds: [memberEmail],
    toolkitSlugs: ['slack'],
    statuses: ['ACTIVE'],
  });
  return res.items[0]?.id;
}

export async function postAsMember(
  memberEmail: string,
  channel: string,
  text: string,
  threadTs: string,
) {
  const accountId = await memberAccountId(memberEmail);
  if (!accountId) return false;
  await slackApi('/chat.postMessage', { channel, text, thread_ts: threadTs }, accountId);
  return true;
}
`;

// ── agent.ts: research connected tools and write the draft ──────────────────

const agent1 = `import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { generateText, stepCountIs } from 'ai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

// Spin up a tool-router session for one member, scoped to some toolkits, and let
// the agent research and write their standup. session.tools() returns Composio's
// research meta-tools (search / execute / workbench), limited to those toolkits.
export async function generateDraft(memberEmail: string, toolkits: string[]) {
  const session = await composio.create(memberEmail, { toolkits });
  const tools = await session.tools();

  const { text } = await generateText({
    model: 'anthropic/claude-sonnet-4-5',
    system: "Write a concise daily standup from the member's recent activity.",
    prompt: 'Research and write the standup update.',
    tools,
    stopWhen: stepCountIs(40),
  });
  return text.trim();
}
`;

const agent2 = `import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { generateText, stepCountIs } from 'ai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

// The toolkits a member can connect. We only ever draft from what they actually
// connected, so first ask Composio which of these are ACTIVE (filtered server-side).
const CATALOGUE = ['github', 'linear', 'notion', 'googlecalendar', 'slack'];

async function connectedToolkits(memberEmail: string) {
  const res = await composio.connectedAccounts.list({
    userIds: [memberEmail],
    statuses: ['ACTIVE'],
  });
  const active = new Set(res.items.map((a) => a.toolkit.slug));
  return CATALOGUE.filter((slug) => active.has(slug));
}

export async function generateDraft(memberEmail: string) {
  const toolkits = await connectedToolkits(memberEmail);
  if (toolkits.length === 0) return '';

  const session = await composio.create(memberEmail, { toolkits });
  const tools = await session.tools();

  const { text } = await generateText({
    model: 'anthropic/claude-sonnet-4-5',
    system: "Write a concise daily standup from the member's recent activity.",
    prompt: 'Research and write the standup update.',
    tools,
    stopWhen: stepCountIs(40),
  });
  return text.trim();
}
`;

const agent3 = `import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { generateText, stepCountIs } from 'ai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

const CATALOGUE = ['github', 'linear', 'notion', 'googlecalendar', 'slack'];

async function connectedToolkits(memberEmail: string) {
  const res = await composio.connectedAccounts.list({
    userIds: [memberEmail],
    statuses: ['ACTIVE'],
  });
  const active = new Set(res.items.map((a) => a.toolkit.slug));
  return CATALOGUE.filter((slug) => active.has(slug));
}

export async function generateDraft(memberEmail: string) {
  const toolkits = await connectedToolkits(memberEmail);
  if (toolkits.length === 0) return '';

  // manageConnections:false strips the connection meta-tools, so the agent can
  // research the member's activity but never start an OAuth flow mid-draft.
  const session = await composio.create(memberEmail, {
    toolkits,
    manageConnections: false,
  });
  const tools = await session.tools();

  const { text } = await generateText({
    model: 'anthropic/claude-sonnet-4-5',
    system: "Write a concise daily standup from the member's recent activity.",
    prompt: 'Research and write the standup update.',
    tools,
    stopWhen: stepCountIs(40),
  });
  return text.trim();
}
`;

export const FILE_BUILDS: Record<string, { file: string; stages: BuildStage[] }> = {
  setup: {
    file: 'scripts/setup.ts',
    stages: [
      {
        title: 'Bind a session to your Slack auth config',
        description:
          "The bot authenticates as your own Slack app. Create a session against the slackbot auth config and check whether it's already connected.",
        code: setup1,
      },
      {
        title: 'Authorize and wait',
        description:
          'If not connected, Composio hands back an OAuth link. Print it, then poll until the connection goes active. That one connected account is what the bot posts as.',
        code: setup2,
      },
    ],
  },
  proxy: {
    file: 'api/_utils/slack.ts',
    stages: [
      {
        title: 'Call the Slack API as the bot',
        description:
          "Resolve the bot's slackbot connected account, then proxyExecute any Slack Web API endpoint with it. No token: Composio signs the request with the connection.",
        code: proxy1,
      },
      {
        title: 'Post as a member, not just the bot',
        description:
          'Make the connected account a parameter. Pass the bot account to post as the bot, or a member’s own Slack account to post the standup under their name.',
        code: proxy2,
      },
    ],
  },
  draft: {
    file: 'api/_utils/agent.ts',
    stages: [
      {
        title: 'A tool-router session writes the draft',
        description:
          'Create a session scoped to some toolkits, hand its research tools to the model, and let it investigate and write. This is the whole agent.',
        code: agent1,
      },
      {
        title: 'Only draft from connected tools',
        description:
          'Ask Composio which toolkits the member has ACTIVE (filtered server-side), and scope the session to exactly those. No connection, no hallucinated activity.',
        code: agent2,
      },
      {
        title: 'Keep the agent from connecting mid-draft',
        description:
          'manageConnections:false removes the connection meta-tools from the session, so the agent researches but can never kick off an OAuth flow while drafting.',
        code: agent3,
      },
    ],
  },
};
