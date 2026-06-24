import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Cross-tick cursor: schedules run a fresh session each tick, so the last
// processed ROWID lives on disk (session state would be useless here).
const CURSOR_PATH = join(homedir(), ".imessage-eve", "cursor.json");

export async function readCursor(): Promise<number | null> {
  try {
    const value = JSON.parse(await readFile(CURSOR_PATH, "utf8")).rowId;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

export async function writeCursor(rowId: number): Promise<void> {
  await mkdir(dirname(CURSOR_PATH), { recursive: true });
  await writeFile(CURSOR_PATH, JSON.stringify({ rowId }));
}
