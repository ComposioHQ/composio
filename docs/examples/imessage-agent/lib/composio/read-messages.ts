import { experimental_createTool } from "@composio/core";
import { z } from "zod/v3";
import { decodeAttributedBody, runSqlite } from "../imessage/chat-db.js";

// Apple stores message dates as ns since 2001-01-01; 978307200 = that in unix epoch.
function buildQuery(limit: number, handle?: string): string {
  const select = `SELECT
  CASE WHEN m.is_from_me = 1 THEN 'me' ELSE h.id END AS sender,
  datetime(m.date / 1000000000 + 978307200, 'unixepoch', 'localtime') AS time,
  m.text AS text,
  CASE WHEN m.text IS NULL THEN hex(m.attributedBody) ELSE NULL END AS bodyHex
FROM message m
LEFT JOIN handle h ON m.handle_id = h.ROWID`;

  if (handle) {
    const safe = handle.replace(/'/g, "''");
    return `${select}
JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
WHERE cmj.chat_id IN (
  SELECT chj.chat_id FROM chat_handle_join chj
  JOIN handle hh ON hh.ROWID = chj.handle_id
  WHERE hh.id = '${safe}'
)
ORDER BY m.date DESC LIMIT ${limit};`;
  }
  return `${select}
ORDER BY m.date DESC LIMIT ${limit};`;
}

type Row = { sender: string | null; time: string; text: string | null; bodyHex: string | null };

export const readMessages = experimental_createTool("READ_MESSAGES", {
  name: "Read iMessages",
  description:
    "Read recent iMessages from the user's Mac. Defaults to the last 5. Pass a larger limit to see more, or a handle (a phone/email, e.g. from find_contact) to read one conversation.",
  preload: true,
  inputParams: z.object({
    handle: z
      .string()
      .optional()
      .describe("Phone number or email to focus on a single conversation."),
    limit: z
      .number()
      .int()
      .optional()
      .describe("How many recent messages to read (default 5, max 50)."),
  }),
  execute: async ({ handle, limit }) => {
    const n = Math.min(Math.max(limit ?? 5, 1), 50);
    const rows = await runSqlite<Row>(buildQuery(n, handle));
    const messages = rows
      .reverse() // chronological: oldest first
      .map((r) => ({
        sender: r.sender ?? "unknown",
        time: r.time,
        text: r.text ?? decodeAttributedBody(r.bodyHex) ?? "[unsupported message]",
      }));
    return { messages };
  },
});
