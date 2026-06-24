import { experimental_createToolkit } from "@composio/core";
import { findContact } from "./find-contact.js";
import { recallContact, rememberContact } from "./memory-tools.js";
import { readMessages } from "./read-messages.js";
import { sendMessage } from "./send-message.js";

// A self-contained Composio custom toolkit for local iMessage on macOS:
// send, find contacts, read messages, and per-contact memory. Framework-agnostic
export function createImessageToolkit() {
  return experimental_createToolkit("IMESSAGE", {
    name: "iMessage",
    description:
      "Send and read iMessages, look up contacts, and remember things about them, locally on the user's Mac.",
    tools: [sendMessage, findContact, readMessages, recallContact, rememberContact],
  });
}
