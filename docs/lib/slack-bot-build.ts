/**
 * Cumulative stages of the Slack bot's `bot.ts`, built up one Composio piece at
 * a time. Each stage's `code` is the full file at that point; the BotBuildup
 * component diffs consecutive stages so the reader watches the file grow.
 */

const setup = `import { Composio } from '@composio/core';
import type { IncomingTriggerPayload } from '@composio/core';
import { PiProvider } from '@composio/experimental';
import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const piProvider = new PiProvider();

const SHARED_SLACK_CONNECTION_ID = process.env.SLACK_CONNECTION_ID;
const callbackUrl = \`\${process.env.APP_URL}/connections/callback\`;

// Per-thread memory: one Composio session and a short transcript per Slack thread.
const threads = new Map<string, { sessionId: string; history: { role: string; content: string }[] }>();

const threadKey = (event: IncomingTriggerPayload) =>
  \`\${event.payload?.channel}:\${event.payload?.thread_ts ?? event.payload?.ts}\`;
`;

const session = `
async function sessionForThread(event: IncomingTriggerPayload) {
  const key = threadKey(event);
  const existing = threads.get(key);
  if (existing) return { session: await composio.use(existing.sessionId), memory: existing };

  const session = await composio.create(event.userId, {
    connectedAccounts: { slackbot: [SHARED_SLACK_CONNECTION_ID] },
    manageConnections: { enable: true, callbackUrl, waitForConnections: true },
  });
  const memory = { sessionId: session.sessionId, history: [] };
  threads.set(key, memory);
  return { session, memory };
}
`;

const tools = `
function toolsForSession(session) {
  return piProvider.createSessionTools({
    sessionId: session.sessionId,
    callbackUrl,
    search: (params) => session.search(params),
    execute: (toolSlug, args, options) => session.execute(toolSlug, args, options),
    connections: {
      getToolkitStates: (toolkits) => session.toolkits({ toolkits }),
      authorizeToolkit: async (toolkit) => {
        const request = await session.authorize(toolkit, { callbackUrl });
        return { status: 'needs_connection', redirectUrl: request.redirectUrl };
      },
      isConnected: (state) => state.connection?.isActive ?? false,
    },
  });
}
`;

const handle = `
async function handleSlackMessage(event: IncomingTriggerPayload) {
  const { session, memory } = await sessionForThread(event);

  // Typing indicator. assistant.threads.setStatus has no SLACKBOT_* tool, so use the proxy.
  await session
    .proxyExecute({
      toolkit: 'slackbot',
      endpoint: 'https://slack.com/api/assistant.threads.setStatus',
      method: 'POST',
      body: { channel_id: event.payload?.channel, thread_ts: event.payload?.thread_ts, status: 'Working on it…' },
    })
    .catch(() => {});

  const { session: pi } = await createAgentSession({
    sessionManager: SessionManager.inMemory(process.cwd()),
    customTools: toolsForSession(session),
    tools: ['composio_search_tools', 'composio_manage_connections', 'composio_execute_tool'],
  });

  let reply = '';
  pi.subscribe((e) => {
    if (e.type === 'message_update' && e.assistantMessageEvent.type === 'text_delta') {
      reply += e.assistantMessageEvent.delta;
    }
  });

  const prompt = [...memory.history.map((m) => \`\${m.role}: \${m.content}\`), \`user: \${event.payload?.text}\`].join('\\n');
  await pi.prompt(prompt);
  pi.dispose();

  // Post the reply as the workspace bot — sending is a normal SLACKBOT_* tool.
  await session.execute('SLACKBOT_SEND_MESSAGE', {
    channel: event.payload?.channel,
    thread_ts: event.payload?.thread_ts,
    text: reply,
  });

  memory.history.push({ role: 'user', content: event.payload?.text ?? '' }, { role: 'assistant', content: reply });
}
`;

const serve = `
Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/webhooks/composio') {
      const { payload } = await composio.triggers.verifyWebhook({
        payload: await req.text(),
        secret: process.env.COMPOSIO_WEBHOOK_SECRET,
        id: req.headers.get('webhook-id'),
        timestamp: req.headers.get('webhook-timestamp'),
        signature: req.headers.get('webhook-signature'),
      });
      void handleSlackMessage(payload);
      return Response.json({ ok: true });
    }
    return new Response('Not found', { status: 404 });
  },
});
`;

export interface BotBuildStage {
  title: string;
  description: string;
  /** Full file contents at this stage. */
  code: string;
}

const blocks: { title: string; description: string; block: string }[] = [
  {
    title: 'Client + thread memory',
    description: 'Set up the Composio client and the Pi provider, plus a per-thread store that gives the agent memory across a conversation.',
    block: setup,
  },
  {
    title: 'A session per thread',
    description: 'Create or reuse one session per Slack thread, pinning the shared workspace connection so the bot acts as the user.',
    block: session,
  },
  {
    title: 'Tools from the session',
    description: 'Hand the agent search, connection management, and execute — built straight from the session by the Pi provider.',
    block: tools,
  },
  {
    title: 'Handle a message',
    description: 'Set a typing status through the proxy, run the agent loop, and post the reply with a SLACKBOT_* tool.',
    block: handle,
  },
  {
    title: 'Serve the webhook',
    description: 'Verify each trigger signature and dispatch the work off the response path.',
    block: serve,
  },
];

function cumulative(parts: { title: string; description: string; block: string }[]): BotBuildStage[] {
  return parts.reduce<BotBuildStage[]>((stages, { title, description, block }) => {
    const prev = stages.length > 0 ? stages[stages.length - 1].code : '';
    stages.push({ title, description, code: prev + block });
    return stages;
  }, []);
}

export const BOT_BUILD_STAGES: BotBuildStage[] = cumulative(blocks);

// ── install.ts ────────────────────────────────────────────────────────────

const installAuth = `import { Composio } from '@composio/core';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

// The scopes the bot needs. The slackbot toolkit ships Composio-managed OAuth,
// so you never register your own Slack app.
const authConfig = await composio.authConfigs.create('slackbot', {
  type: 'use_composio_managed_auth',
  name: 'workspace-bot',
  credentials: {
    scopes: ['app_mentions:read', 'channels:history', 'chat:write', 'reactions:write', 'users:read'],
    user_scopes: ['search:read'],
  },
});
`;

const installAuthorize = `
// One connection for the whole workspace: authorize it as SHARED.
const setup = await composio.create('setup:workspace-bot', {
  toolkits: ['slackbot'],
  authConfigs: { slackbot: authConfig.id },
  manageConnections: true,
});
const request = await setup.authorize('slackbot', {
  callbackUrl: \`\${process.env.APP_URL}/setup/callback\`,
  experimental: { accountType: 'SHARED' },
});
console.log('Approve the install:', request.redirectUrl);
`;

const installWire = `
// On the OAuth callback: open the ACL, subscribe your webhook, create triggers.
// Persist connectedAccountId as SLACK_CONNECTION_ID for the bot server.
export async function onSetupCallback(connectedAccountId: string) {
  await composio.connectedAccounts.updateAcl(connectedAccountId, { allowAllUsers: true });
  await composio.triggers.setWebhookSubscription({ webhookUrl: \`\${process.env.APP_URL}/webhooks/composio\` });
  await composio.triggers.create('setup:workspace-bot', 'SLACKBOT_CHANNEL_MESSAGE_RECEIVED', { triggerConfig: { is_bot_message: false } });
  await composio.triggers.create('setup:workspace-bot', 'SLACKBOT_DIRECT_MESSAGE_RECEIVED', { triggerConfig: {} });
}
`;

export const INSTALL_BUILD_STAGES: BotBuildStage[] = cumulative([
  {
    title: 'Declare the scopes',
    description: 'Create a Composio-managed auth config for the slackbot toolkit. No Slack app of your own to register.',
    block: installAuth,
  },
  {
    title: 'Authorize one shared connection',
    description: 'Start a setup session and authorize slackbot as a SHARED connection, so a single approval serves every user.',
    block: installAuthorize,
  },
  {
    title: 'Open it up and wire events',
    description: 'On the callback, open the ACL to the workspace, subscribe your webhook, and create the message triggers.',
    block: installWire,
  },
]);

export const FILE_BUILDS: Record<string, { file: string; stages: BotBuildStage[] }> = {
  install: { file: 'install.ts', stages: INSTALL_BUILD_STAGES },
  bot: { file: 'bot.ts', stages: BOT_BUILD_STAGES },
};
