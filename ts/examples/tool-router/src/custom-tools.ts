/**
 * Custom Tools — local tools + proxy execute with OpenAI Agents
 *
 * Shows how to create custom tools that run in-process alongside
 * remote Composio tools. Includes a tool that calls the Gmail API
 * directly via ctx.proxyExecute().
 *
 * Three tool types demonstrated:
 *   1. Standalone — no auth, pure local logic
 *   2. Extension — inherits auth from a Composio toolkit (Gmail)
 *   3. Toolkit  — groups related tools under a namespace
 *
 * Usage:
 *   COMPOSIO_API_KEY=... OPENAI_API_KEY=... bun src/custom-tools.ts
 */
import "dotenv/config";
import { Composio, experimental_createTool, experimental_createToolkit } from "@composio/core";
import { OpenAIAgentsProvider } from "@composio/openai-agents";
import { Agent, run } from "@openai/agents";
import { z } from "zod/v3";

// ── 1. Standalone tool (no auth) ────────────────────────────────

const getUser = experimental_createTool("GET_USER", {
  name: "Get user",
  description: "Look up an internal user by ID. Returns name, email, and role.",
  inputParams: z.object({
    user_id: z.string().describe("User ID (e.g. user-1, user-2)"),
  }),
  execute: async ({ user_id }) => {
    // In a real app, this would query your database
    const users: Record<string, Record<string, string>> = {
      "user-1": { name: "Alice Johnson", email: "alice@acme.com", role: "admin" },
      "user-2": { name: "Bob Smith", email: "bob@acme.com", role: "developer" },
    };
    const user = users[user_id];
    if (!user) throw new Error(`User "${user_id}" not found`);
    return user;
  },
});

// ── 2. Extension tool (inherits Gmail auth via proxy execute) ───

const sendCompanyEmail = experimental_createTool("SEND_COMPANY_EMAIL", {
  name: "Send company formatted email",
  description:
    "Draft a company-branded email via Gmail. Adds a standard signature " +
    "and formats the body with the company template. The draft appears " +
    "in the authenticated user's Gmail drafts folder.",
  extendsToolkit: "gmail",
  inputParams: z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body content (plain text)"),
  }),
  execute: async (input, ctx) => {
    // Add company branding to the email
    const branded = [
      input.body,
      "",
      "---",
      "Sent via Acme Corp Internal Tools",
      `Drafted by: ${ctx.userId}`,
    ].join("\r\n");

    // Build RFC 2822 email and base64url encode
    const rawEmail = `To: ${input.to}\r\nSubject: ${input.subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${branded}`;
    const encoded = Buffer.from(rawEmail)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Create draft via Gmail API using session's auth
    const res = await ctx.proxyExecute({
      toolkit: "gmail",
      endpoint: "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      method: "POST",
      body: { message: { raw: encoded } },
    });

    if (res.status !== 200) throw new Error(`Gmail API error ${res.status}`);
    const data = res.data as { id: string; message: { id: string } };
    return { draft_id: data.id, to: input.to, subject: input.subject };
  },
});

// ── 3. Custom toolkit (groups tools under a namespace) ──────────

const roleManager = experimental_createToolkit("ROLE_MANAGER", {
  name: "Role Manager",
  description: "Manage internal user roles and permissions",
  tools: [
    experimental_createTool("SET_ROLE", {
      name: "Set role",
      description: "Assign a new role to a user",
      inputParams: z.object({
        user_id: z.string().describe("User ID"),
        role: z.enum(["admin", "developer", "viewer"]).describe("New role"),
      }),
      execute: async ({ user_id, role }) => ({ user_id, role, updated: true }),
    }),
  ],
});

// ── Agent setup ─────────────────────────────────────────────────

const composio = new Composio({
  provider: new OpenAIAgentsProvider(),
});

const session = await composio.create(process.env.COMPOSIO_USER_ID ?? "default", {
  toolkits: ["gmail", "weathermap"],
  experimental: {
    customTools: [getUser, sendCompanyEmail],
    customToolkits: [roleManager],
  },
});

console.log(`Session: ${session.sessionId}`);
console.log("Custom tools:", session.customTools().map(t => t.slug).join(", "));
console.log();

const tools = await session.tools();

const agent = new Agent({
  name: "Assistant",
  instructions:
    "You are a helpful assistant. Use Composio tools to execute tasks. " +
    "In MULTI_EXECUTE, always pass arguments inside the arguments field.",
  model: "gpt-4.1",
  tools,
});

// Tool call logging
agent.on("agent_tool_start", (_ctx, tool, details: Record<string, unknown>) => {
  const input = (details as { toolCall?: { arguments?: unknown } }).toolCall?.arguments ?? {};
  const json = JSON.stringify(typeof input === "string" ? JSON.parse(input) : input, null, 2);
  console.log(`\n  ┌─ ${tool.name}`);
  console.log(`  │ INPUT: ${json.length > 500 ? json.slice(0, 500) + "..." : json}`);
});
agent.on("agent_tool_end", (_ctx, tool, result: unknown) => {
  let output: unknown;
  try { output = typeof result === "string" ? JSON.parse(result as string) : result; } catch { output = result; }
  const json = JSON.stringify(output, null, 2);
  console.log(`  │ OUTPUT: ${json.length > 500 ? json.slice(0, 500) + "..." : json}`);
  console.log(`  └─ ${tool.name} done`);
});

// Multi-task prompt that exercises all tool types:
//   - Standalone local tool (get user)
//   - Toolkit local tool (set role)
//   - Remote Composio tool (weather)
//   - Extension local tool with proxy execute (company email)
const prompt = process.argv[2] ?? `Do all of these:
1. Look up user-1's profile
2. Promote user-2 to admin
3. What's the weather in Tokyo right now?
4. Send a company formatted email to myself summarizing the above results`;

console.log(`> ${prompt}\n`);
const result = await run(agent, prompt);
console.log(`\n${result.finalOutput}`);
