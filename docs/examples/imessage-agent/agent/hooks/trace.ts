import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { defineHook } from "eve/hooks";

// Local trace log: appends a JSONL line per relevant event so you can see what
// the agent said and which tools it ran. Tail it with `npm run trace`.
const TRACE_PATH = join(homedir(), ".imessage-eve", "traces.jsonl");

async function trace(type: string, sessionId: string, data: unknown): Promise<void> {
  try {
    await mkdir(dirname(TRACE_PATH), { recursive: true });
    await appendFile(
      TRACE_PATH,
      `${JSON.stringify({ ts: new Date().toISOString(), sessionId, type, data })}\n`,
    );
  } catch {
    // tracing is best-effort; never break a turn
  }
}

export default defineHook({
  events: {
    "session.started": (_event, ctx) => trace("session.started", ctx.session.id, {}),
    "message.completed": (event, ctx) =>
      trace("message", ctx.session.id, { text: event.data.message }),
    "action.result": (event, ctx) => {
      const r = event.data.result as Record<string, unknown> | undefined;
      return trace("tool", ctx.session.id, {
        kind: r?.kind,
        name: r?.name ?? r?.toolName ?? r?.subagentName,
        isError: r?.isError,
        output: r?.output,
      });
    },
  },
});
