import { Composio } from "@composio/core";
import { env } from "../api/_utils/env";

// One-time setup: connect the bot's Slack ("slackbot") account so it can post to
// the channel and DM members. Run with `npx tsx scripts/setup.ts`, or
// `--reconnect` to clear and re-do the OAuth (needed after changing Slack scopes).
const COMPOSIO_BASE_URL = "https://backend.composio.dev";
const TOOLKIT_SLUG = "slackbot";

// Scopes the bot's OAuth *user* token must carry. Composio freezes the scopes at
// connect time, so we check them before connecting and tell the user what to add.
const REQUIRED_USER_SCOPES = ["team:read"];

const log = {
  ok: (msg: string) => console.log(`  ✅ ${msg}`),
  info: (msg: string) => console.log(`  ·  ${msg}`),
  warn: (msg: string) => console.log(`  ⚠️  ${msg}`),
};

function errMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as {
      error?: { error?: { message?: string }; message?: string };
      message?: string;
    };
    return e.error?.error?.message ?? e.error?.message ?? e.message ?? String(err);
  }
  return String(err);
}

async function main() {
  const RECONNECT = process.argv.includes("--reconnect");

  console.log("\n╭─────────────────────────────────────────────────────────╮");
  console.log("│  Daily Standup Bot: One-Time Setup                       │");
  console.log("╰─────────────────────────────────────────────────────────╯");
  if (RECONNECT) {
    console.log("  (--reconnect: will clear and re-do the bot's Slack auth)");
  }

  const composio = new Composio({ apiKey: env.COMPOSIO_API_KEY });
  const authConfigId = env.COMPOSIO_SLACKBOT_AUTH_CONFIG_ID;

  // Check the auth config requests the scopes the bot needs.
  // READ-ONLY on purpose. GET returns secrets MASKED, and a PATCH that echoes
  // those masked values back overwrites the real client_secret with the mask.
  // So we never write credentials here; we only check and warn.
  const cfgRes = await fetch(`${COMPOSIO_BASE_URL}/api/v3/auth_configs/${authConfigId}`, {
    headers: { "x-api-key": env.COMPOSIO_API_KEY },
  });
  if (cfgRes.ok) {
    const cfg = (await cfgRes.json().catch(() => ({}))) as {
      credentials?: { user_scopes?: string[] };
    };
    const userScopes = cfg.credentials?.user_scopes ?? [];
    const missing = REQUIRED_USER_SCOPES.filter((s) => !userScopes.includes(s));
    if (missing.length > 0) {
      log.warn(`Auth config is missing required user scope(s): ${missing.join(", ")}`);
      console.log(
        "     Add them under the auth config's User Token Scopes in the Composio\n" +
          "     dashboard (Auth Configs → slackbot), then re-run with --reconnect."
      );
    } else {
      log.ok("Auth config has the required user scopes.");
    }
  }

  // Ensure the bot's Slack connection is active.
  const session = await composio.create("default", {
    authConfigs: { slackbot: authConfigId },
  });

  async function listSlackbotAccounts() {
    try {
      const res = await composio.connectedAccounts.list({
        userIds: ["default"],
        toolkitSlugs: [TOOLKIT_SLUG],
      });
      return res.items;
    } catch {
      return [];
    }
  }

  if (RECONNECT) {
    const accounts = await listSlackbotAccounts();
    if (accounts.length === 0) {
      log.info("No existing connections to clear.");
    } else {
      for (const acc of accounts) {
        try {
          await composio.connectedAccounts.delete(acc.id);
          log.ok(`Removed old connection ${acc.id}.`);
        } catch (err) {
          log.warn(`Could not remove ${acc.id}: ${errMessage(err)}`);
        }
      }
    }
  }

  let connected = false;
  if (!RECONNECT) {
    const toolkits = await session.toolkits({ toolkits: [TOOLKIT_SLUG] });
    connected = !!toolkits.items.find((t) => t.slug === TOOLKIT_SLUG)?.connection
      ?.isActive;
  }

  if (connected) {
    log.ok("Bot is already connected to Slack.");
  } else {
    log.info("Bot is not connected yet. Generating an authorization link…");
    // Manual authentication: authorize() returns a Connect Link, then
    // waitForConnection() resolves once the bot finishes OAuth in the browser.
    // https://docs.composio.dev/docs/manually-authenticating
    const connectionRequest = await session.authorize(TOOLKIT_SLUG);
    if (!connectionRequest.redirectUrl) {
      throw new Error("Composio did not return an authorization link.");
    }

    console.log("\n  Open this URL in your browser to authorize the bot:\n");
    console.log(`    ${connectionRequest.redirectUrl}\n`);
    console.log("  Waiting for you to complete the OAuth flow (Ctrl+C to abort)…");

    const TIMEOUT_MS = 5 * 60 * 1000;
    const account = await connectionRequest.waitForConnection(TIMEOUT_MS);
    log.ok(`Bot connected to Slack (${account.id}).`);
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log("  🎉 Setup complete. Invite the bot to your standup channel and");
  console.log("     point your Slack app's Interactivity Request URL at");
  console.log("     https://<your-deployment>/api/interactivity");
  console.log(`${"─".repeat(70)}\n`);
}

main().catch((err) => {
  console.error(`\n  ❌ ${errMessage(err)}\n`);
  process.exit(1);
});
