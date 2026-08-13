# Composio For You in the developer docs

## Decision

"Composio Connect" is now **Composio For You**. Do not reintroduce the old name for the product.

These docs cover the parts of Composio For You that a developer drives from their own machine —
the agent plugins and the CLI — grouped under a `Composio For You` sidebar section. They do not
cover **Composio MCP** setup; that lives at <https://composio.dev/for-you>.

Do not describe any specific client as lacking a native plugin. The set of hosts with one is
growing (Claude Code, Codex, and Cursor each have their own repo as of August 2026), so name the
transport, not the client.

## Context

`/docs/composio-connect` was a 524-line setup guide for `connect.composio.dev/mcp`, with per-client
instructions for ten MCP clients and an `x-consumer-api-key` header. A daily Claude Code workflow
kept its client list in sync with `ComposioHQ/composio_dashboard`, so a consumer-side UI change could
open a PR against the developer docs. That guide is the marketing site's to own, and keeping a second
copy here meant two sources of truth for the same ten setup flows.

The agent plugins and the CLI are a different case. They authenticate with a developer API key, they
are driven from a terminal, and the CLI is the runtime underneath both plugins — so they stay
documented here. Before this change they sat under `Get Started` with no shared label, next to the
SDK quickstart, which gave a reader no way to tell which pages assumed they were building an
application and which did not.

## Consequences

- `content/docs/composio-connect.mdx` is deleted. `/docs/composio-connect` permanently redirects to
  `https://composio.dev/for-you` (see `next.config.mjs`).
- `agent-plugins` and `cli` sit under a `---Composio For You---` separator in
  `content/docs/meta.json`, after the SDK pages in `Get Started`.
- `claude-code-plugin` stays an orphan page reachable from `agent-plugins`, matching how the
  authentication sub-guides are organized.
- The home card is titled "Composio For You" and carries both docs pages plus an outbound link for
  MCP-client setup. `HomeIntentLink.external` marks links that leave the site.
- `.github/workflows/docs.sync-connect-clients.yml` and
  `agent-guidance/agents/connect-clients-sync.md` are deleted. The dashboard repo still emits a
  `dashboard-production-deploy` repository dispatch; nothing here listens for it now, which is a
  no-op. Remove the dispatch on the dashboard side when convenient.
- `ConnectFlow` / `ConnectClientOption` and the eleven client logos only that page used are gone.
  `claude.svg` and `chatgpt.png` stay — other components use them.

## Two things that keep the old name, deliberately

Neither is the consumer product, and renaming either in docs alone would make the docs wrong:

- **Composio Connect Link** — the hosted auth sign-in page at `connect.composio.dev/link/…`. It is a
  developer auth feature, and `Composio Connect Link` is the wording in both SDKs
  (`ts/packages/core/src/models/ConnectedAccounts.ts`, `python/composio/core/models/connected_accounts.py`).
  Rename the SDK first, then the docs.
- **`/composio-connect`** — the Claude Code slash command. As of 2026-08-12 the file is still
  `plugins/composio/commands/composio-connect.md` in `ComposioHQ/composio-plugin-cc`, and
  `ts/packages/cli/src/services/setup.ts` still installs from that repo. Rename the command there
  first, then the docs.

## Plugin repos, as of 2026-08-12

Three, one per host. `composio-mcp-plugin` is **not** a replacement for `composio-plugin-cc`:

| Repo | Host | Wired into the CLI? |
|---|---|---|
| `composio-plugin-cc` | Claude Code | yes, `CLAUDE_PLUGIN_MARKETPLACE` |
| `composio-plugin-openai` | Codex | yes, `CODEX_PLUGIN_MARKETPLACE` |
| `composio-mcp-plugin` | Cursor | no — installed from the Cursor marketplace, undocumented here |

## Verification

- `bun run test` — `tests/static/home-navigation.test.ts` pins the home card's contents and asserts
  the serialized Markdown contains no `/docs/composio-connect`. `tests/static/navigation.test.ts`
  pins the `Composio For You` separator and the pages under it.
- `bun run lint:links` — catches any internal link reintroduced to the deleted page.
- `bun run build` — fails if an MDX file references the removed `ConnectFlow` components.
