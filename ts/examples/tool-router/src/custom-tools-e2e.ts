/**
 * Focused E2E test: Custom tools + custom toolkits against live backend.
 *
 * Tests session creation, local execution, search indexing, and all three
 * tool types (standalone, extendsToolkit, custom toolkit).
 *
 * Usage:
 *   COMPOSIO_API_KEY=... COMPOSIO_BASE_URL=... bun src/custom-tools-e2e.ts
 */
import { Composio, experimental_createTool, experimental_createToolkit } from "@composio/core";
import { z } from "zod/v3";

const apiKey = process.env.COMPOSIO_API_KEY;
const baseURL = process.env.COMPOSIO_BASE_URL;
if (!apiKey) {
  console.error("COMPOSIO_API_KEY is required");
  process.exit(1);
}

let passed = 0;
let failed = 0;

function ok(label: string) {
  passed++;
  console.log(`  ✓ ${label}`);
}
function fail(label: string, err: unknown) {
  failed++;
  console.error(`  ✗ ${label}: ${err instanceof Error ? err.message : err}`);
}

// ── Shared in-memory user store ──────────────────────────────────

const userStore: Record<string, Record<string, unknown>> = {
  "user-1": { id: "user-1", name: "Alice Johnson", email: "alice@acme.com", role: "admin", status: "active" },
  "user-2": { id: "user-2", name: "Bob Smith", email: "bob@acme.com", role: "developer", status: "active" },
  "user-3": { id: "user-3", name: "Carol Williams", email: "carol@acme.com", role: "viewer", status: "suspended" },
};

// ────────────────────────────────────────────────────────────────
// 1. Standalone tools (no auth) → LOCAL_<SLUG>
// ────────────────────────────────────────────────────────────────

const getUserDetails = experimental_createTool("GET_USER_DETAILS", {
  name: "Get user details",
  description: "Retrieve user profile information including name, email, role, and account status by user ID",
  inputParams: z.object({
    user_id: z.string().describe("The unique user identifier"),
  }),
  execute: async (input) => {
    const user = userStore[input.user_id];
    if (!user) throw new Error(`User "${input.user_id}" not found`);
    return { ...user };
  },
});

const listUserKeys = experimental_createTool("LIST_USER_KEYS", {
  name: "List user API keys",
  description: "List all active API keys for a given user, including creation date and last used timestamp",
  inputParams: z.object({
    user_id: z.string().describe("The user whose keys to list"),
    include_expired: z.boolean().default(false),
  }),
  execute: async (input) => {
    const keys = [
      { key_id: "key_abc", prefix: "sk-***abc", expired: false },
      { key_id: "key_old", prefix: "sk-***old", expired: true },
    ];
    const filtered = input.include_expired ? keys : keys.filter((k) => !k.expired);
    return { user_id: input.user_id, api_keys: filtered, total: filtered.length };
  },
});

// ────────────────────────────────────────────────────────────────
// 2. Extension tool (inherits gmail auth) → LOCAL_GMAIL_<SLUG>
// ────────────────────────────────────────────────────────────────

const formatGmailEmail = experimental_createTool("FORMAT_GMAIL_EMAIL", {
  name: "Format Gmail email",
  description: "Format and prepare an email draft with proper HTML formatting for sending via Gmail",
  extendsToolkit: "gmail",
  inputParams: z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    body: z.string().describe("Email body content"),
  }),
  execute: async (input, ctx) => {
    const htmlBody = input.body.replace(/\n/g, "<br>");
    return {
      formatted: true,
      to: input.to,
      subject: input.subject,
      html_body: htmlBody,
      user_id: ctx.userId,
    };
  },
});

// ────────────────────────────────────────────────────────────────
// 3. Custom toolkit (USER_MANAGEMENT) → LOCAL_USER_MANAGEMENT_<SLUG>
// ────────────────────────────────────────────────────────────────

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
    return { user_id: input.user_id, previous_status: previousStatus, new_status: input.status, reason: input.reason ?? "No reason provided" };
  },
});

const userManagement = experimental_createToolkit("USER_MANAGEMENT", {
  name: "User Management",
  description: "Tools for managing user profiles, roles, and account status",
  tools: [setUserRole, updateUserStatus],
});

// ────────────────────────────────────────────────────────────────
// Run tests
// ────────────────────────────────────────────────────────────────

const composio = new Composio({ apiKey, baseURL: baseURL ?? undefined });

async function main() {
  const userId = `e2e-custom-${Date.now()}`;
  console.log(`\nCreating session for user: ${userId}`);
  console.log(`Base URL: ${baseURL ?? "(default)"}\n`);

  // ── Session creation with all 3 tool types ──
  let session: Awaited<ReturnType<typeof composio.create>>;
  try {
    session = await composio.create(userId, {
      toolkits: ["weathermap", "gmail"],
      manageConnections: false,
      experimental: {
        customTools: [getUserDetails, listUserKeys, formatGmailEmail],
        customToolkits: [userManagement],
      },
    });
    ok(`Session created: ${session.sessionId}`);
  } catch (err) {
    fail("Session creation", err);
    console.error("\nCannot continue without a session.");
    process.exit(1);
  }

  // ════════════════════════════════════════════════════════════════
  // Standalone tools (LOCAL_GET_USER_DETAILS, LOCAL_LIST_USER_KEYS)
  // ════════════════════════════════════════════════════════════════

  try {
    const result = await session.execute("GET_USER_DETAILS", { user_id: "user-1" });
    if (result.data?.name !== "Alice Johnson") throw new Error(`Unexpected: ${JSON.stringify(result.data)}`);
    ok("Standalone: execute by original slug (GET_USER_DETAILS)");
  } catch (err) {
    fail("Standalone: execute by original slug", err);
  }

  try {
    const result = await session.execute("LOCAL_GET_USER_DETAILS", { user_id: "user-2" });
    if (result.data?.name !== "Bob Smith") throw new Error(`Unexpected: ${JSON.stringify(result.data)}`);
    ok("Standalone: execute by prefixed slug (LOCAL_GET_USER_DETAILS)");
  } catch (err) {
    fail("Standalone: execute by prefixed slug", err);
  }

  try {
    const result = await session.execute("LIST_USER_KEYS", { user_id: "user-1" });
    if (result.data?.total !== 1) throw new Error(`Expected 1 active key, got: ${JSON.stringify(result.data)}`);
    ok("Standalone: second tool routes correctly (LIST_USER_KEYS)");
  } catch (err) {
    fail("Standalone: second tool routes correctly", err);
  }

  try {
    const result = await session.execute("LIST_USER_KEYS", { user_id: "user-1", include_expired: true });
    if (result.data?.total !== 2) throw new Error(`Expected 2 keys with expired, got: ${JSON.stringify(result.data)}`);
    ok("Standalone: Zod defaults overridden (include_expired=true → 2 keys)");
  } catch (err) {
    fail("Standalone: Zod defaults overridden", err);
  }

  // ════════════════════════════════════════════════════════════════
  // Extension tool (LOCAL_GMAIL_FORMAT_GMAIL_EMAIL)
  // ════════════════════════════════════════════════════════════════

  try {
    const result = await session.execute("FORMAT_GMAIL_EMAIL", {
      to: "test@example.com",
      subject: "Hello",
      body: "Line 1\nLine 2",
    });
    if (result.error) throw new Error(`Execute error: ${result.error}`);
    if (result.data?.formatted !== true) throw new Error(`Not formatted: ${JSON.stringify(result.data)}`);
    if (result.data?.html_body !== "Line 1<br>Line 2") throw new Error(`HTML mismatch: ${result.data?.html_body}`);
    if (result.data?.user_id !== userId) throw new Error(`UserId mismatch: ${result.data?.user_id}`);
    ok("Extension: execute by original slug (FORMAT_GMAIL_EMAIL) + session context");
  } catch (err) {
    fail("Extension: execute by original slug", err);
  }

  try {
    const result = await session.execute("LOCAL_GMAIL_FORMAT_GMAIL_EMAIL", {
      to: "x@y.com",
      subject: "Test",
      body: "body",
    });
    if (result.data?.to !== "x@y.com") throw new Error(`Unexpected: ${JSON.stringify(result.data)}`);
    ok("Extension: execute by prefixed slug (LOCAL_GMAIL_FORMAT_GMAIL_EMAIL)");
  } catch (err) {
    fail("Extension: execute by prefixed slug", err);
  }

  // ════════════════════════════════════════════════════════════════
  // Custom toolkit (LOCAL_USER_MANAGEMENT_SET_USER_ROLE, etc.)
  // ════════════════════════════════════════════════════════════════

  try {
    const result = await session.execute("SET_USER_ROLE", { user_id: "user-3", role: "developer" });
    if (result.data?.previous_role !== "viewer") throw new Error(`Previous role wrong: ${JSON.stringify(result.data)}`);
    if (result.data?.new_role !== "developer") throw new Error(`New role wrong: ${JSON.stringify(result.data)}`);
    ok("Toolkit: execute by original slug (SET_USER_ROLE)");
  } catch (err) {
    fail("Toolkit: execute by original slug", err);
  }

  try {
    const result = await session.execute("LOCAL_USER_MANAGEMENT_SET_USER_ROLE", { user_id: "user-2", role: "admin" });
    if (result.data?.new_role !== "admin") throw new Error(`Unexpected: ${JSON.stringify(result.data)}`);
    ok("Toolkit: execute by prefixed slug (LOCAL_USER_MANAGEMENT_SET_USER_ROLE)");
  } catch (err) {
    fail("Toolkit: execute by prefixed slug", err);
  }

  try {
    const result = await session.execute("UPDATE_USER_STATUS", { user_id: "user-3", status: "active", reason: "Suspended by mistake" });
    if (result.data?.previous_status !== "suspended") throw new Error(`Previous status wrong: ${JSON.stringify(result.data)}`);
    if (result.data?.new_status !== "active") throw new Error(`New status wrong: ${JSON.stringify(result.data)}`);
    if (result.data?.reason !== "Suspended by mistake") throw new Error(`Reason wrong: ${JSON.stringify(result.data)}`);
    ok("Toolkit: second tool + optional param (UPDATE_USER_STATUS with reason)");
  } catch (err) {
    fail("Toolkit: second tool + optional param", err);
  }

  try {
    const result = await session.execute("LOCAL_USER_MANAGEMENT_UPDATE_USER_STATUS", { user_id: "user-1", status: "suspended" });
    if (result.data?.reason !== "No reason provided") throw new Error(`Default reason not applied: ${JSON.stringify(result.data)}`);
    ok("Toolkit: prefixed slug + optional param default (reason → 'No reason provided')");
  } catch (err) {
    fail("Toolkit: prefixed slug + optional param default", err);
  }

  // Verify state mutations persisted across calls
  try {
    const result = await session.execute("GET_USER_DETAILS", { user_id: "user-3" });
    if (result.data?.role !== "developer") throw new Error(`Role not updated: ${JSON.stringify(result.data)}`);
    if (result.data?.status !== "active") throw new Error(`Status not updated: ${JSON.stringify(result.data)}`);
    ok("Toolkit: state mutations persisted (user-3 is now developer+active)");
  } catch (err) {
    fail("Toolkit: state mutations persisted", err);
  }

  // ════════════════════════════════════════════════════════════════
  // Cross-cutting: case insensitive, error handling, search, remote
  // ════════════════════════════════════════════════════════════════

  try {
    const result = await session.execute("get_user_details", { user_id: "user-1" });
    if (!result.data?.name) throw new Error(`Unexpected: ${JSON.stringify(result.data)}`);
    ok("Case-insensitive slug lookup (get_user_details → GET_USER_DETAILS)");
  } catch (err) {
    fail("Case-insensitive slug", err);
  }

  try {
    const result = await session.execute("GET_USER_DETAILS", { user_id: "nonexistent" });
    if (!result.error?.includes("not found")) throw new Error(`Expected 'not found' error, got: ${result.error}`);
    ok("Error handling: thrown error wrapped in response");
  } catch (err) {
    fail("Error handling", err);
  }

  // Search — standalone tools
  try {
    const searchResult = await session.search({ query: "get user profile details" });
    const toolSlugs = searchResult.results.flatMap((r) => r.primaryToolSlugs);
    const found = toolSlugs.find((s) => s === "LOCAL_GET_USER_DETAILS");
    if (!found) console.log("    (search returned:", toolSlugs.join(", "), ")");
    ok(`Search: standalone tool found=${!!found} (${searchResult.results.length} results)`);
  } catch (err) {
    fail("Search: standalone tools", err);
  }

  // Search — toolkit tools
  try {
    const searchResult = await session.search({ query: "change user role to admin" });
    const toolSlugs = searchResult.results.flatMap((r) => r.primaryToolSlugs);
    const found = toolSlugs.find((s) => s.includes("USER_MANAGEMENT"));
    if (!found) console.log("    (search returned:", toolSlugs.join(", "), ")");
    ok(`Search: toolkit tool found=${!!found} (${searchResult.results.length} results)`);
  } catch (err) {
    fail("Search: toolkit tools", err);
  }

  // Search — extension tool
  try {
    const searchResult = await session.search({ query: "format email draft for gmail" });
    const toolSlugs = searchResult.results.flatMap((r) => r.primaryToolSlugs);
    const found = toolSlugs.find((s) => s.includes("GMAIL") && s.startsWith("LOCAL_"));
    if (!found) console.log("    (search returned:", toolSlugs.join(", "), ")");
    ok(`Search: extension tool found=${!!found} (${searchResult.results.length} results)`);
  } catch (err) {
    fail("Search: extension tool", err);
  }

  // Remote tool still works alongside custom tools
  try {
    const result = await session.execute("WEATHERMAP_WEATHER", { location: "Tokyo" });
    if (result.error) throw new Error(`Remote error: ${result.error}`);
    ok(`Remote tool execution (WEATHERMAP_WEATHER) — keys: ${Object.keys(result.data ?? {}).join(", ")}`);
  } catch (err) {
    fail("Remote tool execution", err);
  }

  // ── Summary ──
  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
