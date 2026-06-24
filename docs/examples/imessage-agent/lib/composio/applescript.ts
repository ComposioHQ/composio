import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// Runs an AppleScript via osascript. Extra args are passed as `on run {…}`
// parameters (not interpolated), so values can't break or inject into the script.
export async function runAppleScript(script: string, args: string[] = []): Promise<string> {
  const { stdout } = await run("osascript", ["-e", script, ...args], {
    maxBuffer: 1024 * 1024 * 16,
  });
  return stdout;
}
