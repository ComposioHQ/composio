import { defineSchedule } from "eve/schedules";
import { nameForHandle } from "../../lib/composio/find-contact.js";
import { isAllowed, resolveAllowedHandles } from "../../lib/imessage/allowlist.js";
import { readCursor, writeCursor } from "../../lib/imessage/cursor.js";
import { isShortCode } from "../../lib/imessage/handles.js";
import { getMaxInboundRowId, readNewInbound } from "../../lib/imessage/inbound.js";
import { readMemory } from "../../lib/imessage/memory.js";
import internalChannel from "../channels/internal.js";

// Auto-responder. Fires every minute (in production; in dev, POST the dispatch
// route — see package.json `watch:poll`). Off unless IMESSAGE_AUTO_REPLY=1.
export default defineSchedule({
  cron: "* * * * *",
  async run({ receive, waitUntil, appAuth }) {
    if (process.env.IMESSAGE_AUTO_REPLY !== "1") return;

    const cursor = await readCursor();
    if (cursor === null) {
      // First run: baseline the cursor so we never reply to message history.
      await writeCursor(await getMaxInboundRowId());
      return;
    }

    const inbound = await readNewInbound(cursor);
    if (inbound.length === 0) return;

    const newCursor = inbound[inbound.length - 1].rowId;
    const allowed = await resolveAllowedHandles();

    // One reply per thread: keep only the latest eligible message per handle.
    const latest = new Map<string, (typeof inbound)[number]>();
    for (const m of inbound) {
      if (m.isGroup || isShortCode(m.handle) || !isAllowed(m.handle, allowed)) continue;
      latest.set(m.handle, m);
    }

    const dispatches = [...latest.values()].map(async (m) => {
      const name = (await nameForHandle(m.handle)) ?? m.handle;
      const memory = await readMemory(m.handle);
      return receive(internalChannel, {
        message: `${name} (${m.handle}) just texted: "${m.text}".${
          memory ? ` What you remember about them: ${memory}.` : ""
        } Read the recent thread with the read-messages tool using handle="${m.handle}", then reply in my texting style by sending one iMessage to ${m.handle}. Keep it short and natural, and don't repeat what you've already said. If you learn anything new worth remembering (plans, facts), call the remember tool for ${m.handle} afterward.`,
        target: { handle: m.handle, rowId: m.rowId },
        auth: appAuth,
      });
    });

    // Keep the task alive until the started sessions settle, but await dispatch
    // first so a failure throws before we advance the cursor (don't lose texts).
    dispatches.forEach((p) => waitUntil(p));
    await Promise.all(dispatches);

    await writeCursor(newCursor);
  },
});
