import { config } from "dotenv";

// Load .env.local for local runs (scripts, `vercel dev`). Harmless on Vercel,
// where the file is absent and real environment variables are already set.
config({ path: ".env.local" });

// Validate every required var once at import time, so a misconfigured deploy
// fails fast with a clear message instead of a vague error mid-request.
const REQUIRED = [
  "COMPOSIO_API_KEY",
  "COMPOSIO_SLACKBOT_AUTH_CONFIG_ID", // the "slackbot" auth config (ac_...)
  "SLACK_SIGNING_SECRET", // verifies Slack interactivity requests
  "CRON_SECRET", // shared secret the Vercel cron presents
] as const;

type EnvKey = (typeof REQUIRED)[number];

function loadEnv(): Record<EnvKey, string> {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}.\n` +
        `Copy .env.local.example to .env.local and fill them in.`
    );
  }
  return Object.fromEntries(
    REQUIRED.map((key) => [key, process.env[key]!])
  ) as Record<EnvKey, string>;
}

export const env = loadEnv();
