import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import crypto from "crypto";
import { team, TOOLKITS } from "../standup.config";
import { memberName } from "./_utils/schedule";
import {
  ACTION_DRAFT,
  ACTION_CONNECT,
  ACTION_CONFIRM,
  ACTION_EDIT,
  MODAL_EDIT_SUBMIT,
  EDIT_INPUT_BLOCK,
  EDIT_INPUT_ACTION,
  buildLoadingMessage,
  buildDraftMessage,
  buildPostedMessage,
  buildCopyMessage,
  buildConnectMenu,
  buildEditModal,
  extractDraft,
  StandupContext,
} from "./_utils/blocks";
import { getConnectedIntegrations, getConnectLink } from "./_utils/composio";
import { generateDraftText } from "./_utils/agent";
import {
  openModal,
  postMessage,
  updateMessage,
  postAsUser,
  getPermalink,
} from "./_utils/slack";
import { env } from "./_utils/env";

export const maxDuration = 300;

// Disable Vercel's body parsing: Slack signs the EXACT raw bytes.
export const config = { api: { bodyParser: false } };

// The subset of a Slack interaction payload this handler reads.
type SlackAction = { action_id?: string; value?: string };
type SlackInteraction = {
  type?: string;
  trigger_id?: string;
  actions?: SlackAction[];
  message?: { ts?: string; blocks?: Array<{ block_id?: string; text?: { text?: string } }> };
  container?: { channel_id?: string };
  channel?: { id?: string };
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: { values?: Record<string, Record<string, { value?: string }>> };
  };
};
// What buildEditModal stuffs into the modal's private_metadata.
type StoredMeta = StandupContext & { dmChannel?: string; dmTs?: string };

function readRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve) => {
    if (typeof req.body === "string") return resolve(req.body);
    if (req.body && Buffer.isBuffer(req.body)) return resolve(req.body.toString("utf8"));
    let data = "";
    req.setEncoding?.("utf8");
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(data));
  });
}

// Implements Slack's documented request-verification algorithm (v0 basestring,
// 5-minute replay window, constant-time HMAC-SHA256 compare):
// https://docs.slack.dev/authentication/verifying-requests-from-slack
function verifySlackSignature(
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined,
  signingSecret: string
): boolean {
  if (!signature || !timestamp) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const hmac =
    "v0=" +
    crypto
      .createHmac("sha256", signingSecret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawBody = await readRawBody(req);
  if (
    !verifySlackSignature(
      rawBody,
      req.headers["x-slack-signature"] as string,
      req.headers["x-slack-request-timestamp"] as string,
      env.SLACK_SIGNING_SECRET
    )
  ) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const payload: SlackInteraction = JSON.parse(
    new URLSearchParams(rawBody).get("payload") || "{}"
  );

  // Modal submit (edits): fast, respond inline.
  if (payload.type === "view_submission") {
    if (payload.view?.callback_id === MODAL_EDIT_SUBMIT) {
      const meta: StoredMeta = JSON.parse(payload.view.private_metadata || "{}");
      const ctx: StandupContext = {
        memberEmail: meta.memberEmail,
        threadTs: meta.threadTs,
        channelId: meta.channelId,
      };
      const edited =
        payload.view.state?.values?.[EDIT_INPUT_BLOCK]?.[EDIT_INPUT_ACTION]
          ?.value ?? "";
      const msg = buildDraftMessage(edited, ctx);
      if (meta.dmChannel && meta.dmTs) {
        await updateMessage(meta.dmChannel, meta.dmTs, msg.text, msg.blocks);
      }
    }
    return res.status(200).send("");
  }

  if (payload.type !== "block_actions") return res.status(200).send("");

  const action = payload.actions?.[0];
  const ctx: StandupContext = JSON.parse(action?.value || "{}");
  const dmChannel = payload.container?.channel_id ?? payload.channel?.id;
  const dmTs = payload.message?.ts;
  if (!dmChannel || !dmTs) return res.status(200).send("");

  // Edit opens a modal: must use trigger_id within ~3s, so handle inline.
  if (action?.action_id === ACTION_EDIT) {
    const draft = extractDraft(payload.message ?? {});
    await openModal(
      payload.trigger_id ?? "",
      buildEditModal(draft, ctx, { channel: dmChannel, ts: dmTs })
    );
    return res.status(200).send("");
  }

  // Slow work (AI draft, OAuth links, posting): ack within Slack's 3s window,
  // then run via waitUntil, which keeps the function alive after the response is
  // sent. A plain post-send await would be frozen by Vercel.
  waitUntil(
    processSlowAction(action, ctx, dmChannel, dmTs, payload).catch(async (err) => {
      // Don't leave the member stuck on the loading message: log and tell them.
      console.error("standup interaction failed:", err);
      await postMessage(
        dmChannel,
        "⚠️ Something went wrong handling that. Please try again."
      ).catch(() => {});
    })
  );
  return res.status(200).send("");
}

async function processSlowAction(
  action: SlackAction | undefined,
  ctx: StandupContext,
  dmChannel: string,
  dmTs: string,
  payload: SlackInteraction
) {
  const member = team.find((m) => m.slackEmail === ctx.memberEmail);

  if (action?.action_id === ACTION_DRAFT) {
    const loading = buildLoadingMessage();
    await updateMessage(dmChannel, dmTs, loading.text, loading.blocks);

    const connected = await getConnectedIntegrations(ctx.memberEmail);
    const draft =
      member && connected.length
        ? await generateDraftText(member, connected)
        : "";
    const msg = buildDraftMessage(draft, ctx);
    await updateMessage(dmChannel, dmTs, msg.text, msg.blocks);
    return;
  }

  if (action?.action_id === ACTION_CONNECT) {
    const connected = await getConnectedIntegrations(ctx.memberEmail);
    const unconnected = TOOLKITS.filter((t) => !connected.includes(t.slug));
    const links = (
      await Promise.all(
        unconnected.map(async (t) => {
          const url = await getConnectLink(ctx.memberEmail, t.slug);
          return url ? { label: t.label, url } : null;
        })
      )
    ).filter(Boolean) as { label: string; url: string }[];

    if (unconnected.length === 0) {
      await postMessage(dmChannel, "You're already connected to everything! 🎉");
    } else if (links.length === 0) {
      // Toolkits remain, but every connect link failed to generate.
      await postMessage(
        dmChannel,
        "⚠️ Couldn't generate connect links right now. Please try again in a moment."
      );
    } else {
      const menu = buildConnectMenu(links);
      await postMessage(dmChannel, menu.text, { blocks: menu.blocks });
    }
    return;
  }

  if (action?.action_id === ACTION_CONFIRM) {
    const draft = extractDraft(payload.message ?? {});
    // Swap the buttons out immediately so a double-click can't post twice.
    const posting = buildLoadingMessage("Posting your standup…");
    await updateMessage(dmChannel, dmTs, posting.text, posting.blocks);

    const name = member ? memberName(member) : ctx.memberEmail;
    const connected = await getConnectedIntegrations(ctx.memberEmail);

    let posted = false;
    if (connected.includes("slack")) {
      posted = await postAsUser(
        ctx.memberEmail,
        ctx.channelId,
        `*${name}'s standup*\n${draft}`,
        ctx.threadTs
      );
    }

    if (posted) {
      const m = buildPostedMessage(draft);
      await updateMessage(dmChannel, dmTs, m.text, m.blocks);
    } else {
      // No personal Slack (or post failed): give them copyable text.
      const url = (await getPermalink(ctx.channelId, ctx.threadTs)) ?? "";
      const m = buildCopyMessage(draft, url);
      await updateMessage(dmChannel, dmTs, m.text, m.blocks);
    }
    return;
  }
}
