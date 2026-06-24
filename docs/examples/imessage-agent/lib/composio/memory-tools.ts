import { experimental_createTool } from "@composio/core";
import { z } from "zod/v3";
import { readMemory, writeMemory } from "../imessage/memory.js";

export const recallContact = experimental_createTool("RECALL", {
  name: "Recall Contact",
  description:
    "Recall what you remember about a contact (notes from past conversations) by their phone/email handle. Call this before replying to or discussing someone.",
  preload: true,
  inputParams: z.object({
    handle: z.string().describe("Phone number or email of the contact."),
  }),
  execute: async ({ handle }) => ({ notes: await readMemory(handle) }),
});

export const rememberContact = experimental_createTool("REMEMBER", {
  name: "Remember Contact",
  description:
    "Save concise notes about a contact (facts, ongoing topics, plans) for future conversations. Replaces the existing notes, so pass the full updated notes — keep them short, a few lines.",
  preload: true,
  inputParams: z.object({
    handle: z.string().describe("Phone number or email of the contact."),
    notes: z.string().describe("The full updated notes to store (concise)."),
  }),
  execute: async ({ handle, notes }) => {
    await writeMemory(handle, notes);
    return { saved: true };
  },
});
