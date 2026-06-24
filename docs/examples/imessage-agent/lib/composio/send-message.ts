import { experimental_createTool } from "@composio/core";
import { z } from "zod/v3";
import { runAppleScript } from "./applescript.js";

const SEND_SCRIPT = `on run {targetBuddy, targetText}
	tell application "Messages"
		set targetService to 1st service whose service type = iMessage
		send targetText to buddy targetBuddy of targetService
	end tell
end run`;

// "Think" time + time to type the message, with jitter, capped — so messages
// don't fire instantly.
function humanDelayMs(text: string): number {
  const think = 800 + Math.random() * 1700; // 0.8–2.5s
  const typing = text.length * (40 + Math.random() * 40); // ~40–80ms/char
  return Math.min(think + typing, 12_000);
}

export const sendMessage = experimental_createTool("SEND", {
  name: "Send iMessage",
  description:
    "Send an iMessage from the user's Mac to a phone number or iMessage email handle.",
  preload: true,
  inputParams: z.object({
    to: z
      .string()
      .describe("Recipient handle: phone number (e.g. +15551234567) or iMessage email."),
    text: z.string().describe("Message body to send."),
    name: z.string().optional().describe("Recipient's contact name, for display."),
  }),
  execute: async ({ to, text }) => {
    await new Promise((r) => setTimeout(r, humanDelayMs(text)));
    await runAppleScript(SEND_SCRIPT, [to, text]);
    return { sent: true, to };
  },
});