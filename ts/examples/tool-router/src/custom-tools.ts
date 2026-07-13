/**
 * Custom Tools — local tools + proxy execute with OpenAI Agents
 *
 * Shows how to create custom tools that run in-process alongside
 * remote Composio tools. Includes a tool that calls the Gmail API
 * directly via ctx.proxyExecute().
 *
 * Usage:
 *   COMPOSIO_API_KEY=... OPENAI_API_KEY=... bun src/custom-tools.ts
 */
import "dotenv/config";
import { Composio, experimental_createTool, experimental_createToolkit } from "@composio/core";
import { OpenAIAgentsProvider } from "@composio/openai-agents";
import { Agent, run } from "@openai/agents";
import { z } from "zod/v3";

// ── Custom tools ────────────────────────────────────────────────

/** Standalone tool (no auth needed) */
const getUser = experimental_createTool("GET_USER", {
  name: "Get user",
  description: "Look up an internal user by ID",
  inputParams: z.object({
    user_id: z.string().describe("User ID (e.g. user-1)"),
  }),
  execute: async ({ user_id }) => {
    const users: Record<string, Record<string, string>> = {
      "user-1": { name: "Alice Johnson", email: "alice@acme.com", role: "admin" },
      "user-2": { name: "Bob Smith", email: "bob@acme.com", role: "developer" },
    };
    const user = users[user_id];
    if (!user) throw new Error(`User "${user_id}" not found`);
    return user;
  },
});

/** Extension tool — inherits Gmail auth, calls the real API via proxy */
const createDraft = experimental_createTool("CREATE_DRAFT", {
  name: "Create Gmail draft",
  description: "Create a real Gmail draft via the Gmail API. Appears in the user's drafts folder.",
  extendsToolkit: "gmail",
  inputParams: z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body (plain text)"),
  }),
  execute: async (input, ctx) => {
    const raw = Buffer.from(
      `To: ${input.to}\r\nSubject: ${input.subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${input.body}`
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const res = await ctx.proxyExecute({
      toolkit: "gmail",
      endpoint: "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      method: "POST",
      body: { message: { raw } },
    });

    if (res.status !== 200) throw new Error(`Gmail API error ${res.status}`);
    const data = res.data as { id: string; message: { id: string } };
    return { draft_id: data.id, message_id: data.message.id, to: input.to, subject: input.subject };
  },
});

/** Custom toolkit — groups related tools under one namespace */
const roleManager = experimental_createToolkit("ROLE_MANAGER", {
  name: "Role Manager",
  description: "Manage user roles",
  tools: [
    experimental_createTool("SET_ROLE", {
      name: "Set role",
      description: "Set a user's role",
      inputParams: z.object({
        user_id: z.string().describe("User ID"),
        role: z.enum(["admin", "developer", "viewer"]).describe("New role"),
      }),
      execute: async ({ user_id, role }) => ({ user_id, role, updated: true }),
    }),
  ],
});

// ── Agent ────────────────────────────────────────────────────────

const composio = new Composio({
  provider: new OpenAIAgentsProvider(),
});

const session = await composio.create("default", {
  toolkits: ["gmail"],
  experimental: {
    customTools: [getUser, createDraft],
    customToolkits: [roleManager],
  },
});

const tools = await session.tools();

const agent = new Agent({
  name: "Assistant",
  instructions:
    "You are a helpful assistant. Use Composio tools to execute tasks. " +
    "In MULTI_EXECUTE, always pass arguments inside the arguments field.",
  model: "gpt-4.1",
  tools,
});

const prompt = process.argv[2] ?? "Get user-1's info and draft an email to them saying hello";

console.log(`> ${prompt}\n`);
const result = await run(agent, prompt);
console.log(result.finalOutput);
