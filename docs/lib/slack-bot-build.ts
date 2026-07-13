/**
 * Cumulative stages of the example's files, built up one piece at a time. Each
 * stage's `code` is the full file at that point; <FileBuildup> diffs consecutive
 * stages so the reader watches the file grow from a basic agent to the full bot.
 */

export interface BuildStage {
  title: string;
  description: string;
  /** Full file contents at this stage. */
  code: string;
}

// ── shared bot.ts parts ─────────────────────────────────────────────────────

const head1 = `import { Composio } from '@composio/core';
import { PiProvider } from '@composio/experimental';
import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const piProvider = new PiProvider();
`;

const head2 = `import { Composio } from '@composio/core';
import type { IncomingTriggerPayload } from '@composio/core';
import { PiProvider } from '@composio/experimental';
import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const piProvider = new PiProvider();
const callbackUrl = \`\${process.env.APP_URL}/connections/callback\`;
`;

const head2Shared = `import { Composio } from '@composio/core';
import type { IncomingTriggerPayload } from '@composio/core';
import { PiProvider } from '@composio/experimental';
import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const piProvider = new PiProvider();
const callbackUrl = \`\${process.env.APP_URL}/connections/callback\`;

// One Slack connection, shared by the whole workspace. The bot posts as this
// identity while acting in every other app as the individual user.
const SHARED_SLACK_CONNECTION_ID = process.env.SLACK_CONNECTION_ID;
`;

const runPi = `
// Run the Pi agent over a session's tools and return its final text.
async function runPi(tools: unknown, prompt: string) {
  const { session: pi } = await createAgentSession({
    sessionManager: SessionManager.inMemory(process.cwd()),
    customTools: tools,
    tools: ['composio_search_tools', 'composio_manage_connections', 'composio_execute_tool'],
  });
  let reply = '';
  pi.subscribe((e) => {
    if (e.type === 'message_update' && e.assistantMessageEvent.type === 'text_delta') {
      reply += e.assistantMessageEvent.delta;
    }
  });
  await pi.prompt(prompt);
  pi.dispose();
  return reply;
}
`;

const runAgent = `
// The smallest agent: one session, its tools, one prompt.
export async function runAgent(userId: string, prompt: string) {
  const session = await composio.sessions.create(userId);
  const tools = piProvider.createSessionTools({
    sessionId: session.sessionId,
    search: (params) => session.search(params),
    execute: (slug, args, options) => session.execute(slug, args, options),
  });
  return runPi(tools, prompt);
}
`;

const memNoPin = `
// One session per Slack thread, reused so the agent keeps context, with a short
// transcript for memory across turns.
const threads = new Map<string, { sessionId: string; history: { role: string; content: string }[] }>();
const threadKey = (event: IncomingTriggerPayload) =>
  \`\${event.payload?.channel}:\${event.payload?.thread_ts ?? event.payload?.ts}\`;

async function sessionForThread(event: IncomingTriggerPayload) {
  const key = threadKey(event);
  const existing = threads.get(key);
  if (existing) return { session: await composio.sessions.use(existing.sessionId), memory: existing };

  const session = await composio.sessions.create(event.userId, {
    manageConnections: { enable: true, callbackUrl, waitForConnections: true },
  });
  const memory = { sessionId: session.sessionId, history: [] as { role: string; content: string }[] };
  threads.set(key, memory);
  return { session, memory };
}
`;

const memPin = `
// One session per Slack thread, reused so the agent keeps context, with a short
// transcript for memory across turns.
const threads = new Map<string, { sessionId: string; history: { role: string; content: string }[] }>();
const threadKey = (event: IncomingTriggerPayload) =>
  \`\${event.payload?.channel}:\${event.payload?.thread_ts ?? event.payload?.ts}\`;

async function sessionForThread(event: IncomingTriggerPayload) {
  const key = threadKey(event);
  const existing = threads.get(key);
  if (existing) return { session: await composio.sessions.use(existing.sessionId), memory: existing };

  const session = await composio.sessions.create(event.userId, {
    // Pin the shared Slack connection; the session still resolves every other
    // toolkit against this user's own connections.
    connectedAccounts: { slackbot: [SHARED_SLACK_CONNECTION_ID] },
    manageConnections: { enable: true, callbackUrl, waitForConnections: true },
  });
  const memory = { sessionId: session.sessionId, history: [] as { role: string; content: string }[] };
  threads.set(key, memory);
  return { session, memory };
}
`;

const proxy = `
// Anything the toolkit doesn't wrap as a tool, reach via the proxy: it calls the
// Slack Web API with the pinned connection's auth, so you never touch a token.
async function setStatus(session, event: IncomingTriggerPayload, status: string) {
  await session
    .proxyExecute({
      toolkit: 'slackbot',
      endpoint: 'https://slack.com/api/assistant.threads.setStatus',
      method: 'POST',
      body: { channel_id: event.payload?.channel, thread_ts: event.payload?.thread_ts, status },
    })
    .catch(() => {});
}

async function openDm(session, userId: string): Promise<string> {
  const res = await session.proxyExecute({
    toolkit: 'slackbot',
    endpoint: 'https://slack.com/api/conversations.open',
    method: 'POST',
    body: { users: userId },
  });
  return res.data?.channel?.id;
}
`;

const auth = `
// Redirect auth links. When a tool hits an app the user hasn't connected, the
// result carries a one-time Composio connect URL. Never let the model or the
// channel see it: redact it from the tool output and DM the user privately. The
// session's manageConnections + waitForConnections resumes the run on approval.
const CONNECT_LINK = /https:\\/\\/(?:connect\\.composio\\.dev|[^\\s"']*composio[^\\s"']*\\/link)\\/[^\\s"')]+/gi;

function redactLinks<T>(value: T): T {
  if (typeof value === 'string') return value.replace(CONNECT_LINK, '[connection link sent via DM]') as T;
  if (Array.isArray(value)) return value.map(redactLinks) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactLinks(v)])) as T;
  }
  return value;
}

async function handleAuthLinks<T>(session, event: IncomingTriggerPayload, value: T): Promise<T> {
  const links = [...new Set([...JSON.stringify(value ?? '').matchAll(CONNECT_LINK)].map((m) => m[0]))];
  if (links.length > 0) {
    const dm = await openDm(session, event.userId);
    for (const url of links) {
      await session.execute('SLACKBOT_SEND_MESSAGE', {
        channel: dm,
        text: \`*Connection needed.* Approve access and I'll continue automatically:\\n<\${url}|Connect>\`,
      });
    }
  }
  return redactLinks(value); // hand the model a result with the raw URL stripped
}
`;

const toolsNoAuth = `
function toolsForSession(session) {
  return piProvider.createSessionTools({
    sessionId: session.sessionId,
    callbackUrl,
    search: (params) => session.search(params),
    execute: (slug, args, options) => session.execute(slug, args, options),
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

const toolsAuth = `
function toolsForSession(session, event: IncomingTriggerPayload) {
  return piProvider.createSessionTools({
    sessionId: session.sessionId,
    callbackUrl,
    search: (params) => session.search(params),
    // Every tool result passes through handleAuthLinks: connect URLs get DM'd to
    // the user and redacted before the model ever sees them.
    execute: async (slug, args, options) => handleAuthLinks(session, event, await session.execute(slug, args, options)),
    connections: {
      getToolkitStates: (toolkits) => session.toolkits({ toolkits }),
      authorizeToolkit: async (toolkit) => {
        const request = await session.authorize(toolkit, { callbackUrl });
        await handleAuthLinks(session, event, request.redirectUrl);
        return { status: 'needs_connection', redirectUrl: request.redirectUrl };
      },
      isConnected: (state) => state.connection?.isActive ?? false,
    },
  });
}
`;

const handleNoStatus = `
// Reply to one Slack message as the user who sent it.
async function handleSlackMessage(event: IncomingTriggerPayload) {
  const { session, memory } = await sessionForThread(event);
  const prompt = [...memory.history.map((m) => \`\${m.role}: \${m.content}\`), \`user: \${event.payload?.text}\`].join('\\n');

  const reply = await runPi(toolsForSession(session), prompt);

  await session.execute('SLACKBOT_SEND_MESSAGE', {
    channel: event.payload?.channel,
    thread_ts: event.payload?.thread_ts,
    text: reply,
  });
  memory.history.push({ role: 'user', content: event.payload?.text ?? '' }, { role: 'assistant', content: reply });
}
`;

const handleStatus = `
// Reply to one Slack message as the user who sent it.
async function handleSlackMessage(event: IncomingTriggerPayload) {
  const { session, memory } = await sessionForThread(event);
  await setStatus(session, event, 'Working on it…');

  const prompt = [...memory.history.map((m) => \`\${m.role}: \${m.content}\`), \`user: \${event.payload?.text}\`].join('\\n');
  const reply = await runPi(toolsForSession(session, event), prompt);

  await session.execute('SLACKBOT_SEND_MESSAGE', {
    channel: event.payload?.channel,
    thread_ts: event.payload?.thread_ts,
    text: reply,
  });
  memory.history.push({ role: 'user', content: event.payload?.text ?? '' }, { role: 'assistant', content: reply });
}
`;

// handleStatus calls toolsForSession(session, event); for the proxy stage (before
// auth) toolsForSession still takes one arg, so use a variant without the event.
const handleStatusNoAuth = handleStatus.replace('toolsForSession(session, event)', 'toolsForSession(session)');

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

const BOT_STAGES: { title: string; description: string; parts: string[] }[] = [
  {
    title: 'A basic agent',
    description:
      'Start from scratch. The smallest possible agent: create a session for a user, hand the Pi provider the session so it can search and execute, run a prompt. This already works against every app that user has connected, with no Slack yet.',
    parts: [head1, runPi, runAgent],
  },
  {
    title: 'Wire it to Slack threads',
    description:
      'Turn the one-shot agent into a handler. Each Slack thread gets its own session (reused for memory), the agent runs over the session tools, and the reply is posted with the SLACKBOT_SEND_MESSAGE tool.',
    parts: [head2, memNoPin, toolsNoAuth, runPi, handleNoStatus],
  },
  {
    title: 'Share one workspace connection',
    description:
      'Pin a single SHARED Slack connection into every session. Now the bot posts as the workspace bot, but still acts in GitHub, Gmail, and everything else as the individual user.',
    parts: [head2Shared, memPin, toolsNoAuth, runPi, handleNoStatus],
  },
  {
    title: 'Reach the gaps with the proxy',
    description:
      'Add a typing indicator and a DM-channel opener. Neither has a SLACKBOT_* tool, so they drop down to the proxy, which calls the Slack Web API with the pinned connection.',
    parts: [head2Shared, memPin, proxy, toolsNoAuth, runPi, handleStatusNoAuth],
  },
  {
    title: 'Redirect auth links',
    description:
      'The payoff. When the agent touches an app the user has not connected, the tool result carries a one-time connect URL. Redact it from the model and the channel, DM it to the user privately, and let the run resume on approval.',
    parts: [head2Shared, memPin, proxy, auth, toolsAuth, runPi, handleStatus],
  },
  {
    title: 'Serve the webhook',
    description:
      'Verify each trigger signature and dispatch the work off the response path. This is the whole server.',
    parts: [head2Shared, memPin, proxy, auth, toolsAuth, runPi, handleStatus, serve],
  },
];

export const BOT_BUILD_STAGES: BuildStage[] = BOT_STAGES.map((s) => ({
  title: s.title,
  description: s.description,
  code: s.parts.join('').replace(/^\n/, ''),
}));

// ── install.ts ──────────────────────────────────────────────────────────────

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
const setup = await composio.sessions.create('setup:workspace-bot', {
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

const INSTALL_STAGES: { title: string; description: string; parts: string[] }[] = [
  {
    title: 'Declare the scopes',
    description: 'Create a Composio-managed auth config for the slackbot toolkit. No Slack app of your own to register.',
    parts: [installAuth],
  },
  {
    title: 'Authorize one shared connection',
    description: 'Start a setup session and authorize slackbot as a SHARED connection, so a single approval serves every user.',
    parts: [installAuth, installAuthorize],
  },
  {
    title: 'Open it up and wire events',
    description: 'On the callback, open the ACL to the workspace, subscribe your webhook, and create the message triggers.',
    parts: [installAuth, installAuthorize, installWire],
  },
];

export const INSTALL_BUILD_STAGES: BuildStage[] = INSTALL_STAGES.map((s) => ({
  title: s.title,
  description: s.description,
  code: s.parts.join(''),
}));

export const FILE_BUILDS: Record<string, { file: string; stages: BuildStage[] }> = {
  install: { file: 'install.ts', stages: INSTALL_BUILD_STAGES },
  bot: { file: 'bot.ts', stages: BOT_BUILD_STAGES },
};
