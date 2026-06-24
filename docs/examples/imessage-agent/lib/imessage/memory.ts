import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { normalizeHandle } from "./handles.js";

// Per-contact memory: concise notes the agent keeps about a person (facts,
// ongoing topics, plans) so conversations have continuity across sessions.
const MEMORY_DIR = join(homedir(), ".imessage-eve", "memory");

function pathFor(handle: string): string {
  return join(MEMORY_DIR, `${encodeURIComponent(normalizeHandle(handle))}.json`);
}

export async function readMemory(handle: string): Promise<string> {
  try {
    return JSON.parse(await readFile(pathFor(handle), "utf8")).notes ?? "";
  } catch {
    return "";
  }
}

export async function writeMemory(handle: string, notes: string): Promise<void> {
  await mkdir(MEMORY_DIR, { recursive: true });
  await writeFile(
    pathFor(handle),
    JSON.stringify({ notes, updatedAt: new Date().toISOString() }),
  );
}
