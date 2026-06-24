import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { TOOLKIT_SLUGS } from "../../standup.config";
import { env } from "./env";

export const composio = new Composio({
  apiKey: env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

// The bot's own Composio user. The slackbot OAuth connection lives here, so all
// bot Slack actions (posting to the channel, DMing members) execute as the bot.
export const BOT_USER = "default";

/** Active connected accounts for a user, optionally filtered to one toolkit.
 *  Filters server-side via `statuses` so we never see stale/expired ones. */
export async function listActiveAccounts(userId: string, toolkitSlug?: string) {
  const res = await composio.connectedAccounts.list({
    userIds: [userId],
    statuses: ["ACTIVE"],
    ...(toolkitSlug ? { toolkitSlugs: [toolkitSlug] } : {}),
  });
  return res.items;
}

// The bot's slackbot connected-account ID. proxyExecute needs it so the call
// authenticates as the bot (the project has several connections, so we can't
// rely on a default-account fallback). Resolved once and memoized.
let botAccountIdPromise: Promise<string | undefined> | undefined;
function getBotAccountId(): Promise<string | undefined> {
  botAccountIdPromise ??= listActiveAccounts(BOT_USER, "slackbot")
    .then((accounts) => accounts[0]?.id)
    .then((id) => {
      // Don't cache a miss: if the bot isn't connected yet, retry next call so a
      // later setup/OAuth is picked up without waiting for a cold start.
      if (!id) botAccountIdPromise = undefined;
      return id;
    });
  return botAccountIdPromise;
}

// Wraps Composio's proxyExecute to call any Slack Web API endpoint as the bot
// (or a member, via accountId). Covers what the named SLACKBOT_* tools don't,
// like views.open for modals.
export async function slackApi<T = unknown>(
  endpoint: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
  accountId?: string // override the bot account (e.g. post as a member)
): Promise<T> {
  const connectedAccountId = accountId ?? (await getBotAccountId());
  const res = await composio.tools.proxyExecute({
    endpoint,
    method,
    ...(body ? { body } : {}),
    ...(connectedAccountId ? { connectedAccountId } : {}),
  });
  // proxyExecute wraps Slack's JSON response in `data`.
  return ((res as { data?: unknown }).data ?? res) as T;
}

/** Run a named Composio tool as a user (the bot by default). This is the normal
 *  path for actions a SLACKBOT or SLACK tool covers (sending a message, even
 *  one with Block Kit buttons, updating one, posting as a member). Returns the
 *  tool's `data`, which is the Slack API response. */
export async function slackTool<T = Record<string, unknown>>(
  slug: string,
  args: Record<string, unknown>,
  userId: string = BOT_USER
): Promise<T> {
  const res = await composio.tools.execute(slug, { userId, arguments: args });
  return (res.data ?? {}) as T;
}

/** Which catalogue toolkits the member has actively connected. */
export async function getConnectedIntegrations(
  memberEmail: string
): Promise<string[]> {
  const active = await listActiveAccounts(memberEmail);
  const slugs = new Set(active.map((a) => a.toolkit.slug));
  return TOOLKIT_SLUGS.filter((s) => slugs.has(s));
}

/** Generate an OAuth connect link for one toolkit, for one member. */
export async function getConnectLink(
  memberEmail: string,
  toolkitSlug: string
): Promise<string | null> {
  try {
    const conn = await composio.toolkits.authorize(memberEmail, toolkitSlug);
    return conn.redirectUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * A tool-router session scoped to the given toolkits. `session.tools()` returns
 * Composio's research meta-tools (search/execute/workbench) limited to these
 * toolkits. `manageConnections: false` strips the connection meta-tools so the
 * draft agent can research but never initiate an OAuth flow mid-draft.
 */
export async function createToolRouterSession(
  memberEmail: string,
  toolkitSlugs: string[]
) {
  return composio.create(memberEmail, {
    toolkits: toolkitSlugs,
    manageConnections: false,
  });
}
