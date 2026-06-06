/**
 * Example: gate an agent action behind a trust check with Composio + TWZRD Agent Intel
 *
 * Composio executes a downstream action (e.g. GITHUB_CREATE_ISSUE) only if the
 * requesting agent wallet passes the TWZRD Agent Intel preflight check.
 *
 * TWZRD Agent Intel MCP server: https://intel.twzrd.xyz
 * - score_agent(wallet)       — free trust score 0–100
 * - preflight_check(wallet)   — free pass/fail gate
 * - get_trust_receipt(wallet) — paid x402 on-chain receipt
 */
import { openai } from "@ai-sdk/openai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  experimental_createMCPClient as createMCPClient,
  stepCountIs,
  streamText,
} from "ai";
import "dotenv/config";

const AGENT_WALLET = "D1QkbFJKiPsymJ65RKHhF6DFB8sPMfpBaFBzuHKfJGWi";

// --------------------------------------------------------------------------
// 1. Trust check via TWZRD Agent Intel (free, no API key needed)
// --------------------------------------------------------------------------
const trustClient = await createMCPClient({
  name: "twzrd-agent-intel",
  transport: new StreamableHTTPClientTransport(
    new URL("https://intel.twzrd.xyz/mcp"),
  ),
});

const trustTools = await trustClient.tools();

const trustStream = streamText({
  model: openai("gpt-4o-mini"),
  messages: [
    {
      role: "user",
      content: `Run preflight_check for agent wallet ${AGENT_WALLET}. Reply with only PASS or FAIL.`,
    },
  ],
  stopWhen: stepCountIs(3),
  tools: trustTools,
});

let trustDecision = "";
for await (const chunk of trustStream.textStream) {
  trustDecision += chunk;
}
await trustClient.close();

console.log("Trust decision:", trustDecision.trim());

if (!trustDecision.includes("PASS")) {
  console.error("Agent failed trust check. Blocking downstream action.");
  process.exit(1);
}

// --------------------------------------------------------------------------
// 2. Proceed with Composio action only if agent passed trust check
// --------------------------------------------------------------------------
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

const actionTools = await composio.tools.get(undefined, {
  apps: ["github"],
  allowedTools: ["GITHUB_LIST_REPOS_FOR_AUTHENTICATED_USER"],
});

const actionStream = streamText({
  model: openai("gpt-4o-mini"),
  messages: [
    {
      role: "user",
      content:
        "List the top 5 public repositories for the authenticated GitHub user.",
    },
  ],
  stopWhen: stepCountIs(3),
  tools: actionTools,
});

for await (const chunk of actionStream.textStream) {
  process.stdout.write(chunk);
}
