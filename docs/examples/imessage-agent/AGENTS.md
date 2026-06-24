# eve Agent App

This project is an [eve](https://github.com/vercel/eve) agent that uses **Composio** for real-world tool access (email, calendar, GitHub, Slack, and the rest of the Composio catalog).

## Docs: source of truth

Read these before changing related code; don't rely on memory.

- **eve framework**: `node_modules/eve/docs/` (start with `tools/`, `connections.mdx`, `agent-config.md`, `guides/dynamic-capabilities.md`).
- **Composio**: [docs.composio.dev](https://docs.composio.dev), especially Tool Router, configuring sessions, and in-chat authentication.
- **Composio SDK API**: the installed types in `node_modules/@composio/core/dist/*.d.mts` are authoritative for exact signatures.

## Architecture & decisions

**One Composio session, driven natively through the SDK: no MCP connection, no hardcoded URL.** Everything (the catalog plus the local iMessage toolkit) runs through a single session created at runtime in `lib/composio/session.ts` (`composio.create(userId, { experimental: { customToolkits: [imessageToolkit] } })`, which defaults to the whole catalog). One shared client lives in `lib/composio/client.ts`, configured with the `EveProvider`.

- **The eve provider is the single tool source.** `lib/composio/eve-provider/` is a self-contained Composio provider (`BaseAgenticProvider`, the seed of a future `@composio/eve` package) that wraps Composio tools as eve `defineTool`s, so `session.tools()` returns eve-native tools directly. The agent gets the Tool Router **meta-tools** (`COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_MULTI_EXECUTE_TOOL`, `COMPOSIO_MANAGE_CONNECTIONS`) plus the preloaded `LOCAL_IMESSAGE_*` toolkit, all from one call, with no per-tool hand-wrapping. `defineComposioTools(session)` is the replay-safe resolver the app uses. It also supports **hooks** (`new EveProvider({ hooks })`): Pi-style `(ctx, next)` middleware that can rewrite, deny, or transform meta-tool calls. See `lib/composio/eve-provider/README.md`.
- **Why not MCP?** We used to point eve at the Tool Router's MCP URL via `defineMcpClientConnection`, but (a) it needs a hardcoded, manually-provisioned session URL, and (b) custom tools aren't exposed over MCP, so the experience was split (catalog over MCP, custom over SDK). Going fully native unifies both onto one session and drops the pinned URL.
- **Auth is in-chat** via `COMPOSIO_MANAGE_CONNECTIONS`, which returns an authorization link. No pre-connect scripts.
- **Single-user.** One session scoped to `COMPOSIO_USER_ID`, created at boot. A multi-user product would create or reuse a session per authenticated caller (`user_id` from `ctx.session.auth`).

## iMessage (Composio custom toolkit)

iMessage is built as a **Composio custom toolkit**, not a catalog connection. It's preloaded into the session and surfaced through the same `session.tools()` provider path as the catalog; eve is still the runtime.

- `lib/composio/imessage.ts`: the toolkit, `experimental_createToolkit("IMESSAGE", { tools: [SEND, FIND_CONTACT, READ_MESSAGES, RECALL, REMEMBER] })`, exposed as `LOCAL_IMESSAGE_*`, each marked `preload: true`. Uses `zod/v3` (what Composio's custom-tool API expects).
  - **SEND**: `osascript` → Messages.app (swap to the Beeper Desktop API there without touching anything else). Optional `name` input for display. Always waits a randomized human-paced delay (think time plus ~per-char typing, capped at 12s) before sending, so messages don't fire instantly.
  - **RECALL / REMEMBER** (`lib/composio/memory-tools.ts`): per-contact memory. Notes live in `~/.imessage-eve/memory/<handle>.json` (`lib/imessage/memory.ts`); the agent recalls before replying and rewrites the notes after. The auto-responder also injects the recalled notes into its prompt.
  - **FIND_CONTACT**: `osascript` → Contacts.app (bulk property fetch, then assemble locally, since per-contact Apple Events reads are what made it slow), fuzzy-matched with `fuse.js` over name/nickname/initials. Cached in-process; returns the top ~5 candidates with labeled numbers, never the whole address book.
  - **READ_MESSAGES**: reads `~/Library/Messages/chat.db` via the `sqlite3` CLI (`-readonly -json`). Defaults to the last 5; optional `handle` filters to one conversation. Message body is the `text` column, falling back to a **best-effort** decode of the `attributedBody` blob when `text` is NULL (modern macOS). That decode is heuristic and the most likely thing to need tuning.
- `lib/composio/session.ts`: one shared Composio session with the toolkit registered. Workbench (remote code-execution meta-tools) is disabled, since this agent only texts and reaches catalog apps.
- `agent/hooks/trace.ts`: a hook that appends session/message/tool events to `~/.imessage-eve/traces.jsonl` (tail with `npm run trace`). Observe-only.
- `agent/tools/composio.ts`: one line, `export default defineComposioTools(composioSession)`. That helper (from the provider package) returns the eve **dynamic tools** resolver that hands the agent `session.tools()`: catalog meta-tools plus `LOCAL_IMESSAGE_*`. It resolves on **`step.started`, not `session.started`** (the provider's tools carry live `execute` closures, which eve only keeps for step-scoped tools) and memoizes `session.tools()` (a network call) so it fetches once per session. See `lib/composio/eve-provider/README.md`.

Both the catalog and this custom toolkit run on the **same SDK session**, surfaced through the **same provider call** (`session.tools()`). Custom tools execute **in-process** and aren't on MCP, which is why we drive everything natively rather than over an MCP connection.

**macOS requirements:** SEND needs Automation permission (terminal/editor → Messages); FIND_CONTACT needs Contacts access (terminal/editor → Contacts); READ_MESSAGES needs **Full Disk Access** for whatever runs the agent (to read `chat.db`). First use of SEND or FIND_CONTACT prompts; Full Disk Access must be granted manually in System Settings → Privacy & Security. If they wedge, reset with `tccutil reset AppleEvents` or `tccutil reset AddressBook`. All Mac-only, running wherever the agent process runs.

## Auto-responder (opt-in)

`agent/schedules/imessage-watch.ts` is a handler-form schedule (cron `* * * * *`) that auto-replies to incoming texts. **Off unless `IMESSAGE_AUTO_REPLY=1`** (`npm run dev:auto`). Each tick: read new inbound since a cursor → filter → for each thread, `receive(eveChannel, …)` hands the agent a prompt to read the thread and reply in your style.

- **The flag is just the on switch.** `IMESSAGE_AUTO_REPLY=1` arms the watcher. Sends run without an approval prompt (a headless schedule run can't park for a human); the allowlist plus the always-on guards below are the safety, not a per-send prompt.
- **Allowlist.** `IMESSAGE_AUTO_REPLY_CONTACTS` = comma-separated contact **names** (resolved to handles via `searchContacts`). **Empty or unset ⇒ replies to everyone**, your explicit choice. This is the reply-loop risk, so the hard guards below stay on regardless.
- **Always-on guards.** Inbound-only, skip threads in groups, skip short-code/2FA senders, dedup via an on-disk cursor (`~/.imessage-eve/cursor.json`, `lib/imessage/cursor.ts`), and **baseline the cursor on first run** so history is never answered. One reply per thread per tick (latest message wins).
- **Shared chat.db helpers.** `lib/imessage/chat-db.ts` (`runSqlite`, `decodeAttributedBody`, FDA error). `lib/imessage/inbound.ts` reads new inbound; `lib/imessage/handles.ts` normalizes handles and detects short codes; `lib/imessage/allowlist.ts` resolves the allowlist.
- **Dev firing.** `eve dev` never runs cron. Run `npm run dev:auto` in one terminal and `npm run watch:poll` in another (it POSTs `/eve/v1/dev/schedules/imessage-watch` every 60s). Production (`eve build && eve start`, or Vercel Cron) fires it for real.

## Composio triggers (webhook channel)

`agent/channels/composio-triggers.ts` is the proper trigger integration, a **webhook channel** rather than a standalone listener. Composio POSTs trigger events to its `POST /webhook` route; it verifies the signature with `composio.triggers.verifyWebhook({ payload, signature, id, timestamp, secret })` (secret = `COMPOSIO_WEBHOOK_SECRET`), then `send(...)`s an agent session with the email facts. The agent acts per the **Incoming email events** instructions (dev-related → `find_contact` KJ → text him asking if he wants to work on it).

- **Why a channel, not a script.** Webhooks are how Composio delivers triggers; a channel makes it part of the app (works in prod with no extra process). The trade-off is it needs a public URL, so deploy it or tunnel `eve dev` for local testing.
- **Setup.** Expose the route publicly → set the project webhook URL plus `COMPOSIO_WEBHOOK_SECRET` in the Composio dashboard → create the trigger instance (`composio.triggers.create(userId, "GMAIL_NEW_GMAIL_MESSAGE")`). Gmail triggers poll (~15min); Slack and Notion are realtime.
- **Security.** The agent reads untrusted email and sends an outward text to a third party (KJ) on its own, which is a lethal-trifecta shape. It needs headless send (`IMESSAGE_AUTO_REPLY=1`); the instructions tell it to treat email contents as data, never as instructions.

## Environment (`.env.local`)

- `COMPOSIO_API_KEY`: Composio API key.
- `COMPOSIO_USER_ID`: the id the session is scoped to (e.g. `me`).
- `COMPOSIO_WEBHOOK_SECRET`: Composio webhook signing secret (for the trigger channel).

## Setup

1. Set `COMPOSIO_API_KEY` and `COMPOSIO_USER_ID` in `.env.local`.
2. Run `npm run dev`. The Composio session is created at runtime, so there's no URL to provision.
