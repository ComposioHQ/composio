/**
 * Session Update Example
 *
 * Demonstrates using session.update() to modify a session's configuration
 * after creation — e.g. adding toolkits, changing workbench settings, or
 * updating preload config without creating a new session.
 *
 * Usage:
 *   COMPOSIO_API_KEY=... bun src/session-update.ts
 */
import { Composio } from "@composio/core";

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  baseURL: process.env.COMPOSIO_BASE_URL || undefined,
});

// Create a session with gmail only
const session = await composio.create("session-update-demo", {
  toolkits: ["gmail"],
  manageConnections: false,
});

console.log(`Session created: ${session.sessionId}`);
console.log(`Config version: ${session.configVersion}`);
console.log(`Preload: ${JSON.stringify(session.preload)}`);

// Update: add github toolkit, enable workbench, and preload a tool
await session.update({
  toolkits: { enable: ["gmail", "github"] },
  workbench: { enable: true, sandboxSize: "medium" },
  preload: { tools: ["GITHUB_CREATE_AN_ISSUE"] },
});

console.log(`\nAfter update:`);
console.log(`Config version: ${session.configVersion}`);
console.log(`Preload: ${JSON.stringify(session.preload)}`);

// Update: disable workbench entirely
await session.update({
  workbench: { enable: false },
});

console.log(`\nAfter disabling workbench:`);
console.log(`Config version: ${session.configVersion}`);

// Update: clear manage_connections by passing null
await session.update({
  manageConnections: null,
});

console.log(`\nAfter clearing manageConnections:`);
console.log(`Config version: ${session.configVersion}`);
console.log(`Warnings: ${JSON.stringify(session.warnings)}`);
