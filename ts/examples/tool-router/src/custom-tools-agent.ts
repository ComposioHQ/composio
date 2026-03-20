/**
 * Custom Tools + Tool Router Agent
 *
 * Uses @composio/openai-agents provider with session.tools() for a proper
 * multi-turn agent that has both remote Composio tools (via tool router) and
 * custom local tools executing in-process.
 *
 * Demonstrates all three custom tool types:
 * 1. Standalone tools (no auth) — GET_USER_DETAILS, LIST_USER_KEYS
 * 2. Extension tool (inherits gmail auth) — FORMAT_GMAIL_EMAIL
 * 3. Custom toolkit (USER_MANAGEMENT) — SET_USER_ROLE, UPDATE_USER_STATUS
 *
 * Usage:
 *   COMPOSIO_API_KEY=... OPENAI_API_KEY=... bun src/custom-tools-agent.ts
 */
import "dotenv/config";
import { Composio, experimental_createTool, experimental_createToolkit } from "@composio/core";
import { OpenAIAgentsProvider } from "@composio/openai-agents";
import { Agent, run } from "@openai/agents";
import { z } from "zod/v3";

// ── In-memory user store (shared across tools) ───────────────────

const userStore: Record<string, Record<string, unknown>> = {
  "user-1": {
    id: "user-1",
    name: "Alice Johnson",
    email: "alice@acme.com",
    role: "admin",
    status: "active",
    created_at: "2024-01-15",
  },
  "user-2": {
    id: "user-2",
    name: "Bob Smith",
    email: "bob@acme.com",
    role: "developer",
    status: "active",
    created_at: "2024-03-22",
  },
  "user-3": {
    id: "user-3",
    name: "Carol Williams",
    email: "carol@acme.com",
    role: "viewer",
    status: "suspended",
    created_at: "2025-06-10",
  },
};

// ── 1. Standalone tools (no auth) → LOCAL_<SLUG> ─────────────────

const getUserDetails = experimental_createTool("GET_USER_DETAILS", {
  name: "Get user details",
  description:
    "Retrieve user profile information including name, email, role, and account status by user ID",
  inputParams: z.object({
    user_id: z.string().describe("The unique user identifier"),
  }),
  execute: async (input) => {
    const user = userStore[input.user_id];
    if (!user) throw new Error(`User "${input.user_id}" not found`);
    return user;
  },
});

const listUserKeys = experimental_createTool("LIST_USER_KEYS", {
  name: "List user API keys",
  description:
    "List all active API keys for a given user, including creation date and last used timestamp",
  inputParams: z.object({
    user_id: z.string().describe("The user whose keys to list"),
    include_expired: z.boolean().default(false).describe("Whether to include expired keys"),
  }),
  execute: async (input) => {
    const allKeys: Record<string, Array<Record<string, unknown>>> = {
      "user-1": [
        { key_id: "key_abc", prefix: "sk-***abc", created_at: "2025-01-01", last_used: "2026-03-15", expired: false },
        { key_id: "key_old", prefix: "sk-***old", created_at: "2024-01-01", last_used: "2024-06-01", expired: true },
      ],
      "user-2": [
        { key_id: "key_xyz", prefix: "sk-***xyz", created_at: "2025-06-01", last_used: "2026-03-14", expired: false },
      ],
    };
    const keys = allKeys[input.user_id] ?? [];
    const filtered = input.include_expired ? keys : keys.filter((k) => !k.expired);
    return { user_id: input.user_id, api_keys: filtered, total: filtered.length };
  },
});

// ── 2. Extension tool (inherits gmail auth) → LOCAL_GMAIL_<SLUG> ──

const formatGmailEmail = experimental_createTool("FORMAT_GMAIL_EMAIL", {
  name: "Format Gmail email",
  description: "Format and prepare an email draft with proper HTML formatting for sending via Gmail",
  extendsToolkit: "gmail",
  inputParams: z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    body: z.string().describe("Email body content in markdown"),
  }),
  execute: async (input, ctx) => {
    const htmlBody = input.body
      .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
      .replace(/\*(.*?)\*/g, "<i>$1</i>")
      .replace(/\n/g, "<br>");
    return {
      formatted: true,
      to: input.to,
      subject: input.subject,
      html_body: htmlBody,
      plain_body: input.body,
      user_id: ctx.userId,
    };
  },
});

// ── 3. Custom toolkit (USER_MANAGEMENT) → LOCAL_USER_MANAGEMENT_<SLUG> ──

const setUserRole = experimental_createTool("SET_USER_ROLE", {
  name: "Set user role",
  description: "Change the role of an existing user (admin, developer, viewer)",
  inputParams: z.object({
    user_id: z.string().describe("The user to update"),
    role: z.enum(["admin", "developer", "viewer"]).describe("The new role to assign"),
  }),
  execute: async (input) => {
    const user = userStore[input.user_id];
    if (!user) throw new Error(`User "${input.user_id}" not found`);
    const previousRole = user.role;
    user.role = input.role;
    return { user_id: input.user_id, previous_role: previousRole, new_role: input.role };
  },
});

const updateUserStatus = experimental_createTool("UPDATE_USER_STATUS", {
  name: "Update user status",
  description: "Activate or suspend a user account",
  inputParams: z.object({
    user_id: z.string().describe("The user to update"),
    status: z.enum(["active", "suspended"]).describe("The new account status"),
    reason: z.string().optional().describe("Reason for the status change"),
  }),
  execute: async (input) => {
    const user = userStore[input.user_id];
    if (!user) throw new Error(`User "${input.user_id}" not found`);
    const previousStatus = user.status;
    user.status = input.status;
    return {
      user_id: input.user_id,
      previous_status: previousStatus,
      new_status: input.status,
      reason: input.reason ?? "No reason provided",
    };
  },
});

const userManagement = experimental_createToolkit("USER_MANAGEMENT", {
  name: "User Management",
  description: "Tools for managing user profiles, roles, and account status",
  tools: [setUserRole, updateUserStatus],
});

// ── Agent ─────────────────────────────────────────────────────────

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  baseURL: process.env.COMPOSIO_BASE_URL || undefined,
  provider: new OpenAIAgentsProvider(),
});

const session = await composio.create(`agent-e2e-${Date.now()}`, {
  toolkits: ["weathermap", "gmail"],
  manageConnections: false,
  experimental: {
    customTools: [getUserDetails, listUserKeys, formatGmailEmail],
    customToolkits: [userManagement],
  },
});

console.log(`Session: ${session.sessionId}\n`);
const tools = await session.tools();

const agent = new Agent({
  name: "Custom Tools Agent",
  instructions: "You are a helpful assistant. Use Composio tools to execute tasks.",
  model: "gpt-5.2",
  tools,
});

const MAX = 3000;
function trunc(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2);
  return json.length > MAX ? json.slice(0, MAX) + "\n  ... (truncated)" : json;
}

agent.on("agent_tool_start", (_ctx, tool, details: any) => {
  const input = details.toolCall?.arguments ?? {};
  console.log(`\n  ┌─ ${tool.name}`);
  console.log(`  │ INPUT:\n${trunc(input)}`);
});
agent.on("agent_tool_end", (_ctx, tool, result: any) => {
  let output: unknown;
  try { output = typeof result === "string" ? JSON.parse(result) : result; } catch { output = result; }
  console.log(`  │ OUTPUT:\n${trunc(output)}`);
  console.log(`  └─ ${tool.name} done`);
});

const prompt = `Do the following tasks:
1. Get user-1's profile details and list their API keys
2. Promote user-3 (Carol) to developer role and reactivate her account (she was suspended by mistake)
3. Get the current weather in Tokyo`;

console.log(`User: ${prompt}\n`);
const result = await run(agent, prompt);
console.log(`\nAssistant: ${result.finalOutput}`);
