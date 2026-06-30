import type { VercelRequest, VercelResponse } from "@vercel/node";
import { team, standupChannel, TOOLKITS } from "../../standup.config";
import { formatToday, isMemberDue } from "../_utils/schedule";
import { getConnectedIntegrations } from "../_utils/composio";
import { buildReminderMenu } from "../_utils/blocks";
import {
  findChannelId,
  getRecentMessages,
  postMessage,
  getPermalink,
  findUserIdByEmail,
  sendDmBlocks,
} from "../_utils/slack";
import { env } from "../_utils/env";

export const maxDuration = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results: { member: string; status: string }[] = [];
  // One shared thread per calendar day, keyed to the team timezone on purpose:
  // everyone posts into the same thread even though reminders fire in each
  // member's local time. (Per-member timezone here would fork the thread.)
  const today = formatToday();

  // Only members whose configured time falls in this 30-minute slot.
  const dueMembers = team.filter(isMemberDue);
  if (dueMembers.length === 0) {
    return res.status(200).json({ status: "no members due this slot" });
  }

  try {
    // Resolve the channel and find or create today's thread.
    const channelId = await findChannelId(standupChannel);
    if (!channelId) {
      return res.status(500).json({
        error: `Channel ${standupChannel} not found. Is the bot a member?`,
      });
    }

    const parentText = `📅 *Daily Standup: ${today}*\n_Standups are posted in this thread as folks confirm._`;
    // Scan a generous window for today's parent. A high-volume channel could push
    // it past this; a production bot would paginate or persist the thread ts.
    const recent = await getRecentMessages(channelId, 200);
    const threadTs =
      recent.find((m) => m.text.includes("Daily Standup") && m.text.includes(today))
        ?.ts ?? (await postMessage(channelId, parentText))?.ts;
    if (!threadTs) {
      return res.status(500).json({ error: "Failed to create daily thread" });
    }
    // Narrowed const so the per-member closure below sees a plain string.
    const thread = threadTs;
    const threadUrl = (await getPermalink(channelId, thread)) ?? "";

    // DM each due member the reminder menu, in parallel.
    async function processMember(
      member: (typeof team)[number]
    ): Promise<{ member: string; status: string }> {
      try {
        const [connected, userId] = await Promise.all([
          getConnectedIntegrations(member.slackEmail),
          findUserIdByEmail(member.slackEmail),
        ]);
        const showConnect = connected.length < TOOLKITS.length;

        if (!userId) {
          return { member: member.slackEmail, status: "error: no slack user" };
        }

        const menu = buildReminderMenu(
          threadUrl,
          { memberEmail: member.slackEmail, threadTs: thread, channelId: channelId! },
          showConnect
        );
        const dm = await sendDmBlocks(userId, menu.text, menu.blocks);
        return {
          member: member.slackEmail,
          status: dm ? "reminded" : "error: dm failed",
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return { member: member.slackEmail, status: `error: ${errMsg}` };
      }
    }

    results.push(...(await Promise.all(dueMembers.map(processMember))));
    return res.status(200).json({ threadTs, threadUrl, results });
  } catch (err) {
    return res.status(500).json({
      error: "Internal server error",
      message: err instanceof Error ? err.message : String(err),
      results,
    });
  }
}
