# Composio For You lives outside the developer docs

## Decision

Composio For You — the no-code consumer product, previously documented here as "Composio Connect" —
is not documented on docs.composio.dev. These docs cover the platform: the SDK, the API, the CLI,
and the agent plugins. Anyone who wants to connect their own apps to Claude, Codex, or another MCP
client without writing code is sent to <https://composio.dev/for-you>.

Do not add a page, section, or setup guide for it back into `docs/content/`. Link out instead.

## Context

`/docs/composio-connect` was a 524-line setup guide for `https://connect.composio.dev/mcp`, with
per-client instructions for ten MCP clients and an `x-consumer-api-key` header. It documented a
consumer product inside a developer reference, and it duplicated setup instructions that the
marketing site and the dashboard both own. The client list was kept in sync by a daily Claude Code
workflow reading from `ComposioHQ/composio_dashboard`, so a consumer-side UI change could open a PR
against the developer docs.

The docs home offered "two ways to start": build with the platform, or use Composio from an existing
agent. The second card carried a "For you" badge and pointed at three docs pages. That framing put
the consumer funnel inside the developer funnel.

## Consequences

- `content/docs/composio-connect.mdx` is deleted. `/docs/composio-connect` permanently redirects to
  `https://composio.dev/for-you` (see `next.config.mjs`).
- The home "For you" card holds a single outbound link to `https://composio.dev/for-you`.
  `HomeIntentLink.external` marks links that leave the site; the card opens them in a new tab.
- The Composio CLI (`/docs/cli`) and agent plugins (`/docs/agent-plugins`,
  `/docs/claude-code-plugin`) stay. They are developer tooling, authenticated with a developer API
  key, and they remain in the sidebar.
- `.github/workflows/docs.sync-connect-clients.yml` and
  `agent-guidance/agents/connect-clients-sync.md` are deleted. The dashboard repo still emits a
  `dashboard-production-deploy` repository dispatch; nothing in this repo listens for it now, which
  is a no-op. Remove the dispatch on the dashboard side when convenient.
- `ConnectFlow` / `ConnectClientOption` and the eleven client logos that only that page used are
  gone. `claude.svg` and `chatgpt.png` stay — other components use them.
- Prose that referred to the product by name (the MCP-to-sessions migration guide, the agent-plugin
  and sessions-via-MCP callouts, the `llms.txt` routing paragraph) now links to
  `https://composio.dev/for-you` rather than to a docs page.
- Changelog entries are dated records and keep their original wording and links.

## Verification

- `bun run test` — `tests/static/home-navigation.test.ts` asserts the home card holds exactly the
  outbound For You link and that the serialized Markdown contains no `/docs/composio-connect`.
  `tests/static/navigation.test.ts` pins the Get Started nav order.
- `bun run lint:links` — catches any internal link reintroduced to the deleted page.
- `bun run build` — fails if an MDX file references the removed `ConnectFlow` components.
