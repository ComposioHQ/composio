# Daily Standup Slack Bot

An AI-powered Slack bot that runs daily standups. On a schedule it DMs each team member a reminder with a **Draft** button. Tapping it spins up a Composio tool-router session scoped to whatever that member has connected (GitHub, Linear, Notion, Calendar, and more), researches their recent activity, and writes a draft standup. The member reviews, edits if needed, and confirms, then the bot posts it into a daily thread in your standup channel as that member.

## How It Works

1. **On a schedule** (`vercel.json` cron, evaluated per-member in their timezone), the bot finds or creates today's thread in your standup channel and DMs each due member a reminder menu: **📝 Draft** and **🔌 Connect more tools**.
2. **Draft** opens a Composio tool-router session scoped to the member's connected toolkits, researches their activity, and writes the draft. No tools connected yet → the menu nudges them to connect first.
3. The member can **✏️ Edit** (a modal) or **✅ Confirm & Post**.
4. On confirm, the bot **posts into the daily thread as the member** (via their personal Slack connection). If they haven't connected personal Slack, it gives them copyable text instead.

Everything runs through Slack **interactivity** (buttons + modals): there are no inbound DM triggers to wire up.

## Stack

- **Runtime:** Vercel Serverless Functions (TypeScript)
- **AI:** Vercel AI SDK via AI Gateway
- **Integrations:** Composio SDK (slackbot + the toolkit catalogue you configure)
- **Database:** None

## Project Layout

```
standup.config.ts      ← edit this: team, channel, schedule, toolkit catalogue
.env.local             ← secrets (copy from .env.local.example)
api/
  cron/standup.ts      ← scheduled reminder
  interactivity.ts     ← button + modal handler
  _utils/              ← shared helpers (Vercel ignores _-prefixed dirs as routes)
    schedule.ts        ← per-member due-checks, lookback window, name/date helpers
    composio.ts        ← Composio client, connections, tool-router session
    slack.ts           ← Slack Web API via Composio proxyExecute
    agent.ts           ← draft generation + the draft prompt
    blocks.ts          ← Block Kit message builders
scripts/setup.ts       ← one-time: connect the bot's Slack account
```

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create an app.
2. Add these **Bot Token Scopes** under OAuth & Permissions:
   `chat:write`, `im:write`, `channels:history`, `channels:read`, `users:read`, `users:read.email`, `team:read`.
3. Under **Interactivity & Shortcuts**, turn Interactivity on and set the Request URL to:
   `https://<your-deployment>/api/interactivity`
4. Install the app to your workspace and invite the bot to your standup channel.
5. Note your Slack app's **Client ID**, **Client Secret**, and **Signing Secret**.

### 2. Create a `slackbot` Auth Config in Composio

1. Open Auth Configs in the [Composio dashboard](https://app.composio.dev).
2. Toolkit: `slackbot`. Auth scheme: `OAUTH2`.
3. Toggle "Use your own developer credentials" and enter the Slack Client ID/Secret.
4. Add `team:read` to the **User Token Scopes**.
5. Create it and save the auth config ID (`ac_...`).

### 3. Configure secrets and your team

Copy `.env.local.example` to `.env.local` and fill it in:

| Variable | Value |
|----------|-------|
| `COMPOSIO_API_KEY` | Your Composio API key |
| `COMPOSIO_SLACKBOT_AUTH_CONFIG_ID` | The `ac_...` from step 2 |
| `SLACK_SIGNING_SECRET` | Your Slack app signing secret |
| `CRON_SECRET` | Any random string (secures the Vercel cron) |

Then edit `standup.config.ts`: set `standupChannel`, your `team` (slack email + github username, optional per-person time/timezone), and prune the `TOOLKITS` catalogue to the integrations you want.

### 4. Connect the bot's Slack account

```bash
npm install
npx tsx scripts/setup.ts          # opens a browser OAuth link for the bot
npx tsx scripts/setup.ts --reconnect   # re-run after changing Slack scopes
```

### 5. Deploy

```bash
vercel deploy --prod
```

Set the same four environment variables in the Vercel dashboard. Adjust the cron cadence in `vercel.json` (default: every 30 min on weekdays; each member is reminded only in the slot matching their configured time).

## Connecting member tools

Each member connects their own accounts (GitHub, Linear, etc.) by tapping **🔌 Connect more tools** on the reminder DM, and the bot generates per-member OAuth links on the fly. Drafts only ever pull from what a member has actually connected.

## Customizing

- **Add or remove a toolkit:** edit the `TOOLKITS` array in `standup.config.ts`. Each entry is a slug, label, emoji, and a `draftInstruction` that tells the agent what to pull and how to summarize it. No other code changes needed.
- **Change scope/wording:** the `draftInstruction` is where source-specific rules live (e.g. GitHub is scoped to a single org there).
- **Demo mode:** set `DEMO_MODE = true` in `standup.config.ts` to make every member due on every cron run.
