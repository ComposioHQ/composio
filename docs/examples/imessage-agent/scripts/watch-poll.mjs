// Dev-only: `eve dev` never fires cron, so this POSTs the schedule dispatch
// route every 60s to simulate the production cadence. Run alongside `dev:auto`.
// Resolves the dev server URL from .eve/dev-server.json (port varies).
import { readFile } from "node:fs/promises";

async function resolveUrl() {
  if (process.env.WATCH_URL) return process.env.WATCH_URL;
  try {
    const { url } = JSON.parse(await readFile(".eve/dev-server.json", "utf8"));
    return new URL("/eve/v1/dev/schedules/imessage-watch", url).toString();
  } catch {
    return "http://127.0.0.1:2000/eve/v1/dev/schedules/imessage-watch";
  }
}

async function tick() {
  try {
    const res = await fetch(await resolveUrl(), { method: "POST" });
    console.log(`[watch-poll] ${res.status} ${new Date().toISOString()}`);
  } catch (err) {
    console.log(`[watch-poll] failed: ${err instanceof Error ? err.message : err}`);
  }
}

await tick();
setInterval(tick, 60_000);
