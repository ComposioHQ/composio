/**
 * Session Update Example
 *
 * Demonstrates session.update(): what omitted fields, replaced maps, null,
 * an empty toolkit allowlist, and expectedConfigVersion do to a stored
 * session, without creating a new one.
 *
 * Usage:
 *   COMPOSIO_API_KEY=... bun src/session-update.ts
 */
import { Composio, ComposioSessionConfigConflictError } from "@composio/core";

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  baseURL: process.env.COMPOSIO_BASE_URL || undefined,
});

// Create a session with a per-toolkit tools map and a stored callback URL
const session = await composio.create("session-update-demo", {
  toolkits: ["gmail", "slack"],
  tools: {
    gmail: { enable: ["GMAIL_FETCH_EMAILS"] },
    slack: { enable: ["SLACK_SEND_MESSAGE"] },
  },
  manageConnections: { enable: true, callbackUrl: "https://example.com/callback" },
});

console.log(`Session created: ${session.sessionId}`);
console.log(`Config version: ${session.configVersion}`);
console.log(`Tools: ${JSON.stringify(session.config.tools)}`);

// 1. Maps replace, they don't merge: a slack-only tools map removes the gmail entry
await session.update({
  tools: { slack: { enable: ["SLACK_SEND_MESSAGE", "SLACK_LIST_CHANNELS"] } },
});

console.log(`\nAfter the slack-only tools map (gmail entry is gone):`);
console.log(`Tools: ${JSON.stringify(session.config.tools)}`);

// 2. Remove only the stored callback URL; `enable` and the other settings stay as stored
await session.update({
  manageConnections: { callbackUrl: null },
});

console.log(`\nAfter clearing the callback URL:`);
console.log(`Manage connections: ${JSON.stringify(session.config.manage_connections)}`);

// 3. Narrow the policy and fix preload in the same update. A preloaded tool that
//    falls outside the new policy would be rejected with a 400.
await session.update({
  toolkits: { enable: ["slack"] },
  preload: { tools: ["SLACK_SEND_MESSAGE"] },
});

console.log(`\nAfter narrowing to slack:`);
console.log(`Config version: ${session.configVersion}`);
console.log(`Preload: ${JSON.stringify(session.preload)}`);

// 4. Conditional update. Pass the config version you read; a stale value is a 409
//    and nothing is written. A second handle on the same session plays the
//    concurrent writer.
const observedVersion = session.configVersion;
const otherClient = await composio.sessions.use(session.sessionId);
await otherClient.update({ workbench: { enable: false } });

const widen = { toolkits: { enable: ["gmail", "slack"] }, preload: { tools: [] } };
try {
  await session.update({ ...widen, expectedConfigVersion: observedVersion });
} catch (error) {
  if (!(error instanceof ComposioSessionConfigConflictError)) throw error;
  console.log(`\nConflict at version ${observedVersion}: ${error.message}`);
  // Recover: re-read the session, then retry against the fresh version
  const fresh = await composio.sessions.use(session.sessionId);
  await fresh.update({ ...widen, expectedConfigVersion: fresh.configVersion });
  console.log(`Retried at version ${fresh.configVersion}`);
}

// 5. Deny every app toolkit. The empty allowlist is sent as-is; an omitted
//    `toolkits` would have left the policy unchanged instead.
await session.update({
  toolkits: { enable: [] },
  preload: { tools: [] },
});

console.log(`\nAfter denying every app toolkit:`);
console.log(`Toolkits: ${JSON.stringify(session.config.toolkits)}`);

// 6. Clear a whole block with null: manageConnections falls back to its default
await session.update({
  manageConnections: null,
});

console.log(`\nAfter clearing manageConnections:`);
console.log(`Config version: ${session.configVersion}`);
console.log(`Warnings: ${JSON.stringify(session.warnings)}`);
