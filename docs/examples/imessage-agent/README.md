# Custom iMessage Toolkit - Composio × eve

A personal agent that lives in your terminal, takes real actions across your apps (Gmail, Calendar, GitHub, Slack, and the rest of the [Composio](https://composio.dev) catalog), and **texts on your behalf from your own Mac**: send and read iMessages, look up contacts, and remember people. Built on [eve](https://github.com/vercel/eve).

Talk to it like this:

```
you  ›  read my last email and text KJ a summary
you  ›  text mom i'm running 10 min late
you  ›  what did Sarah and I last text about?
```

It figures out the tools, asks you to connect an app if it needs one (in chat, no setup scripts), and does it.

## What you get

- **Your apps.** Anything in the Composio catalog (email, calendar, GitHub, Slack, and more), discovered and run on demand.
- **iMessage, locally.** Send and read texts and fuzzy-find contacts through your Mac's Messages and Contacts.
- **Memory.** Per-contact notes, so it remembers people across conversations.
- **Optional auto-reply.** Answer incoming texts in your own style. Off by default.
- **Optional triggers.** A dev email arrives, and it texts a teammate to ask if they want to take it.

## Prerequisites

- **Node 24** (`nvm use 24`) - eve needs this
- **macOS** (the iMessage features drive Messages, Contacts, and the local `chat.db`)
- A **Composio API key** ([get one here](https://app.composio.dev))

## Quickstart

```bash
npm install
```

Create `.env.local`:

```bash
COMPOSIO_API_KEY=your_key
COMPOSIO_USER_ID=me
```

Run it:

```bash
npm run dev
```

Then just talk to it. The first time it sends a text or reads contacts or messages, macOS prompts for permission once. See [macOS permissions](#macos-permissions).

**Try:**
```
read my latest email
text <a friend> hey, this is my new agent 👋
who did i text most recently?
```

## How it works

One Composio session, driven natively through the SDK, with no MCP URL to manage. A small **eve provider** (`lib/composio/eve-provider/`) makes `session.tools()` return eve-native tools, so the agent gets Composio's Tool Router meta-tools **and** the local iMessage toolkit from a single call. iMessage is a Composio **custom toolkit** that runs in-process on your Mac.

Want the details?

- Architecture and design decisions: [`AGENTS.md`](./AGENTS.md)
- The iMessage toolkit (reusable on its own): [`lib/composio/README.md`](./lib/composio/README.md)
- The eve provider (the future `@composio/eve`): [`lib/composio/eve-provider/README.md`](./lib/composio/eve-provider/README.md)

## macOS permissions

Grant these to whatever runs the agent (your terminal or editor):

| Permission | For | When |
|---|---|---|
| **Automation → Messages** | sending texts | prompts on first send |
| **Contacts** | contact lookup | prompts on first lookup |
| **Full Disk Access** | reading `chat.db` | set manually in **System Settings → Privacy & Security → Full Disk Access**, then fully quit and reopen the app |

Stuck? Reset with `tccutil reset AppleEvents` or `tccutil reset AddressBook`.

---

## Optional: auto-reply to incoming texts

Off by default. When you turn it on, the agent watches for new inbound texts and replies in your style.

```bash
npm run dev:auto      # terminal 1: runs the agent with auto-reply armed
npm run watch:poll    # terminal 2: triggers the check each minute (dev only)
```

**Pick who it answers** in `.env.local`. It's an **allowlist**:

```bash
IMESSAGE_AUTO_REPLY_CONTACTS=KJ        # only auto-replies to KJ
```

> Note that leaving `IMESSAGE_AUTO_REPLY_CONTACTS` **empty means it replies to _everyone_.** Always-on guards still apply (inbound-only, skips group chats and 2FA/short-code senders, never answers history), but start with one trusted contact.

## Optional: triggers (advanced)

Turn an external event into an action. For example: a dev-related email arrives, and the agent texts a teammate. `agent/channels/composio-triggers.ts` is a webhook channel. Composio POSTs trigger events to it, the channel verifies the signature, and the agent acts on them.

Webhooks need a public URL. In production on Vercel the route is public automatically. For local testing, tunnel with ngrok:

```bash
npm run dev:auto                                   # headless send (no approval pause)
curl -i -X POST http://127.0.0.1:2000/webhook      # expect 400 = route is mounted
ngrok http 2000                                    # → https://<id>.ngrok-free.app
```

In **Composio dashboard → Webhooks**, set the endpoint to `https://<id>.ngrok-free.app/webhook`, payload **V3**, event `composio.trigger.message`. Copy the **signing secret** into `.env.local` as `COMPOSIO_WEBHOOK_SECRET=…` and restart `dev:auto`. Then create the Gmail trigger once:

```bash
node --env-file=.env.local -e "import('@composio/core').then(({Composio})=>new Composio({apiKey:process.env.COMPOSIO_API_KEY}).triggers.create(process.env.COMPOSIO_USER_ID,'GMAIL_NEW_GMAIL_MESSAGE',{triggerConfig:{interval:1,labelIds:'INBOX'}}).then(r=>console.log(r.triggerId)))"
```

Email yourself something dev-ish, then watch `http://127.0.0.1:4040` (ngrok) and `npm run trace`. A `200` on `/webhook` means it verified and dispatched.

> This path reads untrusted email and sends an outward text on its own, so the instructions tell the agent to treat email contents as **data, never instructions**.

---

## Reference

### Environment (`.env.local`)

| Variable | Required | Description |
|---|---|---|
| `COMPOSIO_API_KEY` | yes | Composio API key. |
| `COMPOSIO_USER_ID` | yes | Id the session is scoped to (e.g. `me`). |
| `IMESSAGE_AUTO_REPLY` | no | `1` arms the auto-responder (set by `npm run dev:auto`). |
| `IMESSAGE_AUTO_REPLY_CONTACTS` | no | Allowlist of contact **names** to auto-reply to. Empty means everyone. |
| `COMPOSIO_WEBHOOK_SECRET` | no | Verifies trigger webhooks. |

The model is set in `agent/agent.ts` (`google/gemini-2.5-flash`, via the Vercel AI Gateway).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the agent locally (TUI). |
| `npm run dev:auto` | Same, with auto-reply armed. |
| `npm run watch:poll` | Dev only: fire the auto-reply check each minute (`eve dev` doesn't run cron). |
| `npm run build` / `npm run start` | Build and serve for production (real cron cadence). |
| `npm run trace` | Tail the trace log (`~/.imessage-eve/traces.jsonl`). |
| `npm run typecheck` | `tsc`, no emit. |

### Project structure

```
agent/
  agent.ts                 # model + runtime config
  instructions.md          # system prompt (incl. texting-style examples)
  channels/                # eve (HTTP), internal (auto-reply handoff), composio-triggers (webhook)
  hooks/trace.ts           # logs sessions/messages/tool calls
  tools/composio.ts        # one line: exposes session.tools() to eve via the provider
  schedules/imessage-watch.ts   # opt-in auto-responder
lib/
  composio/                # client + session, the eve provider, the iMessage custom toolkit
  imessage/                # watcher helpers: chat.db, inbound, cursor, handles, allowlist, memory
docs/                      # design notes, Composio feedback
```
