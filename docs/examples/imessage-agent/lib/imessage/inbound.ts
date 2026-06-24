import { decodeAttributedBody, runSqlite } from "./chat-db.js";

export type InboundMessage = {
  rowId: number;
  handle: string;
  text: string;
  isGroup: boolean;
};

type Row = {
  rowId: number;
  handle: string | null;
  text: string | null;
  bodyHex: string | null;
  participants: number;
};

// Highest inbound message ROWID — used to baseline the cursor on first run so
// we never reply to message history.
export async function getMaxInboundRowId(): Promise<number> {
  const rows = await runSqlite<{ maxId: number | null }>(
    "SELECT MAX(ROWID) AS maxId FROM message WHERE is_from_me = 0;",
  );
  return rows[0]?.maxId ?? 0;
}

// New inbound (received) messages with ROWID greater than the cursor, oldest first.
export async function readNewInbound(sinceRowId: number): Promise<InboundMessage[]> {
  const since = Number.isFinite(sinceRowId) ? Math.trunc(sinceRowId) : 0;
  const rows = await runSqlite<Row>(`SELECT
  m.ROWID AS rowId,
  h.id AS handle,
  m.text AS text,
  CASE WHEN m.text IS NULL THEN hex(m.attributedBody) ELSE NULL END AS bodyHex,
  (SELECT COUNT(*) FROM chat_handle_join chj WHERE chj.chat_id = cmj.chat_id) AS participants
FROM message m
JOIN handle h ON m.handle_id = h.ROWID
JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
WHERE m.is_from_me = 0 AND m.ROWID > ${since}
ORDER BY m.ROWID ASC;`);

  return rows
    .map((r) => ({
      rowId: r.rowId,
      handle: r.handle ?? "",
      text: r.text ?? decodeAttributedBody(r.bodyHex) ?? "",
      isGroup: r.participants > 1,
    }))
    .filter((m) => m.handle && m.text);
}
