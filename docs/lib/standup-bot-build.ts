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

  // Not connected: print the Connect Link, then wait for the user to finish.
  const connectionRequest = await session.authorize('slackbot');
  console.log('Authorize the bot:', connectionRequest.redirectUrl);

  const account = await connectionRequest.waitForConnection();
  console.log('Bot connected:', account.id);
}

main();
`;

// ── slack.ts: send with tools, open the modal through the proxy ─────────────

const proxy1 = `import { composio } from './composio';

const BOT_USER = 'default';

// Sending a message is a named tool, even when it carries interactive buttons:
// SLACKBOT_SEND_MESSAGE takes markdown_text for prose, or Block Kit \`blocks\`.
export async function postMessage(channel: string, text: string, blocks?: unknown[]) {
  const res = await composio.tools.execute('SLACKBOT_SEND_MESSAGE', {
    userId: BOT_USER,
    arguments: blocks ? { channel, blocks } : { channel, markdown_text: text },
  });
  return res.data as { ts?: string };
}

// Updating the draft after an edit is a tool too: SLACKBOT_UPDATES_A_MESSAGE.
export async function updateMessage(channel: string, ts: string, blocks: unknown[]) {
  await composio.tools.execute('SLACKBOT_UPDATES_A_MESSAGE', {
    userId: BOT_USER,
    arguments: { channel, ts, blocks },
  });
}
`;

const proxy2 = `import { composio } from './composio';

const BOT_USER = 'default';

// Sending a message is a named tool, even when it carries interactive buttons:
// SLACKBOT_SEND_MESSAGE takes markdown_text for prose, or Block Kit \`blocks\`.
export async function postMessage(channel: string, text: string, blocks?: unknown[]) {
  const res = await composio.tools.execute('SLACKBOT_SEND_MESSAGE', {
    userId: BOT_USER,
    arguments: blocks ? { channel, blocks } : { channel, markdown_text: text },
  });
  return res.data as { ts?: string };
}

// Updating the draft after an edit is a tool too: SLACKBOT_UPDATES_A_MESSAGE.
export async function updateMessage(channel: string, ts: string, blocks: unknown[]) {
  await composio.tools.execute('SLACKBOT_UPDATES_A_MESSAGE', {
    userId: BOT_USER,
    arguments: { channel, ts, blocks },
  });
}

// Opening a modal (views.open) has no Composio tool, so it drops to the proxy.
// proxyExecute hits the raw endpoint as the bot's connected account, the escape
// hatch for anything the named tools don't cover.
export async function openModal(triggerId: string, view: unknown) {
  const { items } = await composio.connectedAccounts.list({
    userIds: [BOT_USER],
    toolkitSlugs: ['slackbot'],
    statuses: ['ACTIVE'],
  });
  await composio.tools.proxyExecute({
    endpoint: '/views.open',
    method: 'POST',
    body: { trigger_id: triggerId, view },
    connectedAccountId: items[0]?.id,
  });
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

// The toolkits the bot can draft from. A member only has some of these connected,
// and that's fine: the session just uses whatever they've actually authorized.
const TOOLKITS = ['github', 'linear', 'notion', 'googlecalendar', 'slack'];

// Spin up a tool-router session for one member and let the agent research and
// write their standup. session.tools() returns Composio's research meta-tools
// (search / execute / workbench), scoped to those toolkits.
export async function generateDraft(memberEmail: string) {
  const session = await composio.create(memberEmail, { toolkits: TOOLKITS });
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

// The toolkits the bot can draft from. A member only has some of these connected,
// and that's fine: the session just uses whatever they've actually authorized.
const TOOLKITS = ['github', 'linear', 'notion', 'googlecalendar', 'slack'];

// Spin up a tool-router session for one member and let the agent research and
// write their standup. session.tools() returns Composio's research meta-tools
// (search / execute / workbench), scoped to those toolkits.
export async function generateDraft(memberEmail: string) {
  // manageConnections:false strips the connection meta-tools. The agent drafts
  // from whatever the member already connected and never starts an OAuth flow
  // mid-draft: if a tool needs auth, it's simply not in the session.
  const session = await composio.create(memberEmail, {
    toolkits: TOOLKITS,
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

// ── api/interactivity.ts: route button clicks ──────────────────────────────

const buttons1 = `import { verifySlackSignature, readRawBody } from './_utils/slack';

// Slack POSTs here every time someone clicks a button. Verify it really came
// from Slack, then ack within 3 seconds (Slack retries if you're slow).
export default async function handler(req: Request, res: Response) {
  const body = await readRawBody(req);
  if (!verifySlackSignature(body, req.headers)) return res.status(401).end();

  const payload = JSON.parse(new URLSearchParams(body).get('payload') ?? '{}');
  res.status(200).end();        // ack immediately
  await handleClick(payload);   // then do the slow work
}
`;

const buttons2 = `import { verifySlackSignature, readRawBody, updateMessage, postAsMember } from './_utils/slack';
import { generateDraft } from './_utils/agent';
import { draftMessage, connectMenu } from './_utils/blocks';

// Slack POSTs here every time someone clicks a button. Verify it really came
// from Slack, then ack within 3 seconds (Slack retries if you're slow).
export default async function handler(req: Request, res: Response) {
  const body = await readRawBody(req);
  if (!verifySlackSignature(body, req.headers)) return res.status(401).end();

  const payload = JSON.parse(new URLSearchParams(body).get('payload') ?? '{}');
  res.status(200).end();        // ack immediately
  await handleClick(payload);   // then do the slow work
}

// Each button carried its context in \`value\`, so the handler knows exactly what
// to do. No model decides anything here: the flow is fixed.
async function handleClick(payload: any) {
  const action = payload.actions?.[0];
  const ctx = JSON.parse(action?.value ?? '{}');

  if (action?.action_id === 'draft') {
    const draft = await generateDraft(ctx.memberEmail);   // launch the subagent
    await updateMessage(ctx.dmChannel, ctx.dmTs, draftMessage(draft, ctx));
  } else if (action?.action_id === 'connect') {
    await updateMessage(ctx.dmChannel, ctx.dmTs, connectMenu(ctx));
  } else if (action?.action_id === 'confirm') {
    await postAsMember(ctx.memberEmail, ctx.channel, ctx.draft, ctx.threadTs);
  }
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
          'If not connected, `session.authorize()` returns a Connect Link. Print it, then `waitForConnection()` resolves once the bot finishes OAuth. That connected account is the identity the bot posts as.',
        code: setup2,
      },
    ],
  },
  proxy: {
    file: 'api/_utils/slack.ts',
    stages: [
      {
        title: 'Send and update with named tools',
        description:
          'Sending and updating are tools: SLACKBOT_SEND_MESSAGE and SLACKBOT_UPDATES_A_MESSAGE both take Block Kit `blocks`, so even the interactive button menus go through tools, not the proxy.',
        code: proxy1,
      },
      {
        title: 'The proxy for the one thing without a tool',
        description:
          "Opening a modal (views.open) has no Composio tool, so it drops to proxyExecute as the bot's connected account: the escape hatch for anything the named tools don't cover.",
        code: proxy2,
      },
    ],
  },
  buttons: {
    file: 'api/interactivity.ts',
    stages: [
      {
        title: 'Verify the request and ack fast',
        description:
          "Slack POSTs to this endpoint on every click. Verify the signature, then respond within 3 seconds so Slack doesn't retry, and handle the click after.",
        code: buttons1,
      },
      {
        title: 'Route on the action',
        description:
          'The button carried its context in `value`. Switch on the `action_id` and call the right function. Draft launches the subagent; the rest post through the proxy. The flow is deterministic, no model in the loop.',
        code: buttons2,
      },
    ],
  },
  draft: {
    file: 'api/_utils/agent.ts',
    stages: [
      {
        title: 'A tool-router session writes the draft',
        description:
          "Create a session for the member, scoped to the toolkit catalogue, hand its research tools to the model, and let it investigate and write. You don't list what they connected: the session just uses whatever they've authorized.",
        code: agent1,
      },
      {
        title: 'Keep the agent from connecting mid-draft',
        description:
          'manageConnections:false removes the connection meta-tools, so the agent drafts from what the member already connected and never starts an OAuth flow while drafting.',
        code: agent2,
      },
    ],
  },
};
