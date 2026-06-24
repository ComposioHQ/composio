# iMessage: Composio custom toolkit

A self-contained [Composio](https://composio.dev) **custom toolkit** for local iMessage on macOS: send, look up contacts, read messages, and per-contact memory. It's **framework-agnostic** (no eve, no app coupling), so you can drop it into any Composio agent.

## Plug it in

```ts
import { Composio } from "@composio/core";
import { createImessageToolkit } from "./imessage.js";

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

// One session per user (multi-tenant: pass YOUR app's user id).
const session = await composio.create(userId, {
  experimental: { customToolkits: [createImessageToolkit()] },
});

// Discover and run (custom tools execute in-process; they aren't on the MCP URL yet):
session.customTools();                              // [{ slug: "LOCAL_IMESSAGE_SEND", ... }, ...]
await session.execute("LOCAL_IMESSAGE_SEND", { to: "+15551234567", text: "yo" });
```

If your framework owns the agent loop, feed `session.tools()` to it instead. If it consumes MCP, surface `session.customTools()` as native tools, since custom tools aren't exposed over the MCP URL yet.

## Tools (`LOCAL_IMESSAGE_*`)

| Tool | Does | How |
|---|---|---|
| `SEND` | Send an iMessage | `osascript` → Messages.app |
| `FIND_CONTACT` | Fuzzy contact lookup (name/nickname/initials) | `osascript` → Contacts.app + `fuse.js` |
| `READ_MESSAGES` | Recent messages, optionally per-conversation | `sqlite3` → `~/Library/Messages/chat.db` |
| `RECALL` / `REMEMBER` | Per-contact notes for continuity | JSON under `~/.imessage-eve/memory/` |

## Requirements

- **macOS.** It drives Messages.app, Contacts.app, and `chat.db` locally, so it's single-machine by nature.
- **Permissions** for whatever process runs it: Automation → Messages (send), Contacts (lookup), and **Full Disk Access** (read `chat.db`).
- Dependencies: `@composio/core`, `fuse.js`, and `zod` (uses `zod/v3`, which Composio's custom-tool API expects).

## Notes

- **Local only.** iMessage can't be served from a central server, so each user runs their own instance on their own Mac. The *Composio* side (`composio.create(userId, …)`) is multi-tenant; iMessage is per-machine.
- Custom tools execute **in-process** through the SDK session (`session.execute`), not over MCP (that's coming soon).
