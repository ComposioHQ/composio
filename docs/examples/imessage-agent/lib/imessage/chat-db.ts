import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const DB_PATH = join(homedir(), "Library", "Messages", "chat.db");

// Runs a read-only query against the Messages DB and parses the JSON result.
export async function runSqlite<T = Record<string, unknown>>(query: string): Promise<T[]> {
  let stdout: string;
  try {
    ({ stdout } = await run("sqlite3", ["-readonly", "-json", DB_PATH, query], {
      maxBuffer: 1024 * 1024 * 16,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/authorization denied|unable to open database/i.test(message)) {
      throw new Error(
        "Reading iMessages needs Full Disk Access. Enable it for the app running this agent (your terminal or editor) in System Settings → Privacy & Security → Full Disk Access, then fully quit and reopen that app.",
      );
    }
    throw err;
  }
  return stdout.trim() ? (JSON.parse(stdout) as T[]) : [];
}

// Best-effort extraction of message text from a streamtyped attributedBody blob
// (used when the `text` column is NULL). Heuristic — may miss some messages.
export function decodeAttributedBody(hex?: string | null): string | null {
  if (!hex) return null;
  const buf = Buffer.from(hex, "hex");
  const marker = buf.indexOf("NSString", 0, "latin1");
  if (marker === -1) return null;
  let p = buf.indexOf(0x2b, marker); // '+' precedes the length
  if (p === -1) return null;
  p += 1;
  let len = buf[p];
  p += 1;
  if (len === 0x81) {
    len = buf.readUInt16LE(p);
    p += 2;
  } else if (len === 0x82) {
    len = buf.readUInt32LE(p);
    p += 4;
  }
  return buf.toString("utf8", p, p + len) || null;
}
