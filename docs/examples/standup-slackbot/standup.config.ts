// ─────────────────────────────────────────────────────────────────────────────
// Standup bot setup. Edit this file to configure your team and tools.
// Secrets (API keys, IDs) live in .env.local, never here.
// ─────────────────────────────────────────────────────────────────────────────

export type Member = {
  slackEmail: string; // used to look up their Slack user + Composio connections
  githubUsername: string;
  standupTime?: string; // "HH:MM" 24h in THEIR timezone; defaults below
  standupTimezone?: string; // IANA tz, e.g. "Europe/Rome"; defaults below
};

export type Toolkit = {
  slug: string; // Composio toolkit slug
  label: string; // shown on Connect buttons
  emoji: string; // leads the bullet in the draft
  draftInstruction: string; // injected into the draft prompt when connected
};

// Model used to write the draft, via the Vercel AI Gateway.
export const MODEL = "anthropic/claude-sonnet-4-5" as const;

// ─── Schedule ────────────────────────────────────────────────────────────────
// The cron runs every 30 min on weekdays; each member is reminded in the slot
// containing their standupTime, evaluated in their own timezone.
export const DEFAULT_STANDUP_TIMEZONE = "America/Los_Angeles";
export const DEFAULT_STANDUP_TIME = "10:00";
export const CRON_SLOT_MINUTES = 30;
// When true, every member is "due" on every cron run, ignoring standupTime.
// Set false in production so per-person times are honored.
export const DEMO_MODE = false;

// ─── Team ────────────────────────────────────────────────────────────────────
export const standupChannel = "#standup";

export const team: Member[] = [
  { slackEmail: "you@example.com", githubUsername: "your-handle" },
  { slackEmail: "teammate@example.com", githubUsername: "teammate-handle" },
  // A per-person time and timezone override the defaults below:
  { slackEmail: "alberto@example.com", githubUsername: "alberto-handle", standupTimezone: "Europe/Rome" },
];

// GitHub org that standup drafts are scoped to. Activity in other orgs and
// personal repos is ignored. Change this to your org.
export const GITHUB_ORG = "your-github-org";

// ─── Toolkit catalogue ───────────────────────────────────────────────────────
// Every toolkit a member can connect. The draft agent gets a Composio tool-router
// session scoped to whichever of these each member has connected. Delete what you
// don't want; edit draftInstruction to change how each source is summarized.
export const TOOLKITS: Toolkit[] = [
  {
    slug: "github",
    label: "GitHub",
    emoji: "🔧",
    draftInstruction:
      `GitHub: find PRs they opened or merged in the time range, SCOPED TO THE ${GITHUB_ORG} ORG ONLY. Always include \`org:${GITHUB_ORG}\` in the search query. Ignore other orgs and personal repos. For each meaningful PR write a one-liner explaining its PURPOSE, prefixed with a status emoji: 🟣 merged, 🟢 open, ⚪️ draft, 🔴 closed. Include the *#number*.`,
  },
  {
    slug: "linear",
    label: "Linear",
    emoji: "📋",
    draftInstruction:
      "Linear: find issues they created, updated, or completed in the time range. Summarize the meaningful ones (📋), focusing on what moved forward.",
  },
  {
    slug: "notion",
    label: "Notion",
    emoji: "📝",
    draftInstruction:
      "Notion: find pages/docs they created or edited in the time range. Summarize the doc work as a one-liner (📝) describing what the doc is for.",
  },
  {
    slug: "googlecalendar",
    label: "Google Calendar",
    emoji: "📅",
    draftInstruction:
      "Google Calendar: find their meetings/events in the time range. Only mention notable ones that reflect real work (📅), not routine blocks.",
  },
  {
    slug: "googlemeet",
    label: "Google Meet",
    emoji: "🎥",
    draftInstruction:
      "Google Meet (context only): optionally read meeting details/transcripts for context. Do not list meetings just for existing.",
  },
  {
    slug: "zoom",
    label: "Zoom",
    emoji: "🎥",
    draftInstruction:
      "Zoom (context only): optionally read meeting info/recordings in the time range for extra context.",
  },
  {
    slug: "granola_mcp",
    label: "Granola",
    emoji: "🎙️",
    draftInstruction:
      "Granola (context only): optionally read meeting transcripts in the time range for additional context.",
  },
  {
    slug: "slack",
    label: "Slack",
    emoji: "💬",
    draftInstruction:
      "Slack (context only): optionally look at messages they sent in public channels for context. Do not quote verbatim.",
  },
];

export const TOOLKIT_SLUGS = TOOLKITS.map((t) => t.slug);
