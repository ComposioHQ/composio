import { slackApi, listActiveAccounts } from "./composio";

// The subset of Slack Web API response fields this bot reads. proxyExecute
// returns the raw Slack JSON, so one shared shape keeps call sites typed.
type SlackResponse = {
  ok?: boolean;
  error?: string;
  ts?: string;
  channel?: string;
  permalink?: string;
  user?: { id?: string };
  channels?: Array<{ id: string; name: string }>;
  messages?: Array<{ ts: string; text?: string }>;
  response_metadata?: { next_cursor?: string };
};

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const data = await slackApi<SlackResponse>(
    `/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    "GET"
  );
  return data.user?.id ?? null;
}

/** Resolve a channel ID from a "#channel-name" (or bare name). */
export async function findChannelId(channelName: string): Promise<string | null> {
  const name = channelName.replace(/^#/, "");
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const qs = new URLSearchParams({
      types: "public_channel",
      limit: "200",
      ...(cursor ? { cursor } : {}),
    });
    const data = await slackApi<SlackResponse>(`/conversations.list?${qs.toString()}`, "GET");
    const match = (data.channels ?? []).find((c) => c.name === name);
    if (match) return match.id;
    cursor = data.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  return null;
}

/** Fetch recent top-level messages in a channel (newest first; threaded replies excluded). */
export async function getRecentMessages(
  channelId: string,
  limit = 50
): Promise<Array<{ ts: string; text: string }>> {
  const data = await slackApi<SlackResponse>(
    `/conversations.history?channel=${encodeURIComponent(channelId)}&limit=${limit}`,
    "GET"
  );
  return (data.messages ?? []).map((m) => ({ ts: m.ts, text: m.text ?? "" }));
}

export async function postMessage(
  channel: string,
  text: string,
  opts?: { thread_ts?: string; blocks?: unknown[] }
): Promise<{ ts: string } | null> {
  const data = await slackApi<SlackResponse>("/chat.postMessage", "POST", {
    channel,
    text,
    ...(opts?.thread_ts ? { thread_ts: opts.thread_ts } : {}),
    ...(opts?.blocks ? { blocks: opts.blocks } : {}),
  });
  if (!data.ok || !data.ts) return null;
  return { ts: data.ts };
}

export async function sendDmBlocks(
  userId: string,
  text: string,
  blocks: unknown[]
): Promise<{ channel: string; ts: string } | null> {
  const data = await slackApi<SlackResponse>("/chat.postMessage", "POST", {
    channel: userId,
    text,
    blocks,
  });
  if (!data.ok || !data.channel || !data.ts) return null;
  return { channel: data.channel, ts: data.ts };
}

/** Update an existing message (e.g. swap the draft after an edit). */
export async function updateMessage(
  channel: string,
  ts: string,
  text: string,
  blocks: unknown[]
): Promise<boolean> {
  const data = await slackApi<SlackResponse>("/chat.update", "POST", { channel, ts, text, blocks });
  return !!data.ok;
}

/** Permalink to a message (used to link members to today's thread). */
export async function getPermalink(
  channel: string,
  ts: string
): Promise<string | null> {
  const data = await slackApi<SlackResponse>(
    `/chat.getPermalink?channel=${encodeURIComponent(channel)}&message_ts=${ts}`,
    "GET"
  );
  return data.permalink ?? null;
}

/** The member's OWN active Slack connected-account id (for posting as them). */
async function getMemberSlackAccountId(
  memberEmail: string
): Promise<string | undefined> {
  const [active] = await listActiveAccounts(memberEmail, "slack");
  return active?.id;
}

/**
 * Post into the thread AS the member, using their personal Slack connection.
 * Returns false if they have no active personal Slack account.
 */
export async function postAsUser(
  memberEmail: string,
  channel: string,
  text: string,
  threadTs: string
): Promise<boolean> {
  const accountId = await getMemberSlackAccountId(memberEmail);
  if (!accountId) return false;
  const data = await slackApi<SlackResponse>(
    "/chat.postMessage",
    "POST",
    { channel, text, thread_ts: threadTs },
    accountId
  );
  return data.ok !== false;
}

/** Open a modal in response to a button click (needs trigger_id, <3s). */
export async function openModal(triggerId: string, view: unknown): Promise<boolean> {
  const data = await slackApi<SlackResponse>("/views.open", "POST", { trigger_id: triggerId, view });
  return !!data.ok;
}
