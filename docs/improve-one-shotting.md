# Improving one-shotting: docs MCP server + SDK error links

Goal: an agent asked to "add Composio triggers to my app" should reach working,
verified code without the user pasting docs context. The docs side already
ships the structural half — per-section `For AI agents` blocks in every page's
`.md`, `llms.txt` discovery, `/skill.md`, `/api/docs-search`, and `Link:
rel=alternate` headers. The two remaining levers live outside the docs content
and are specced here.

## 1. Docs MCP server

### Why

`.md` endpoints require the agent to *know the convention*; a rules file
requires the user to install it. MCP is the one channel where the user's
existing muscle memory ("add an MCP server") gives every future session
queryable docs with zero per-session setup. It is also the only option that
works in clients that can't fetch arbitrary URLs.

### What to build

An MCP server exposing three tools, mounted in the docs Next app (same Vercel
deploy, no new infra):

| Tool | Contract | Backed by |
|---|---|---|
| `search_docs` | `{ query, limit? } → [{ title, description, snippet, url, markdown_url }]` | `agent/lib/docs-search.ts` (`searchDocs`, BM25 over 134 pages + 1000 toolkits) |
| `get_page` | `{ path } → markdown` | `getLLMText` via the `/llms.mdx/*` machinery — returns the same `.md` an agent would fetch, `For AI agents` sections included |
| `get_toolkit` | `{ slug } → markdown` | the `/toolkits/{slug}.md` renderer (tools, triggers, auth quirks per app) |

Implementation notes:

- Use the streamable-HTTP transport via `mcp-handler` (the Vercel adapter) as
  an app route, e.g. `app/mcp/[transport]/route.ts`. The BM25 index
  (`agent/lib/docs-index.ts`) is already bundled server-side; `searchDocs` is
  synchronous and needs no auth.
- **Search results must carry the implementation-detail signal**: include each
  hit's `For AI agents` section headings in the snippet field (the index
  already stores headings), so the agent knows the details exist before it
  fetches.
- Keep the server *read-only and unauthenticated* — it serves public docs.
  Rate-limit at the edge like the search route.
- Advertise it in `llms.txt`, `/skill.md`, and the dashboard's "connect your
  IDE" surface: one JSON snippet for Cursor/Claude Code/Windsurf configs.
- Acceptance: from a clean Claude Code session with only the MCP server
  configured, "build a Slack trigger handler" should produce code that calls
  `triggers.parse()` and dedups deliveries — i.e. the field lessons reached
  the agent through search alone.

Effort: ~1 day. Risks: none structural; the index rebuilds on deploy so
content stays fresh.

## 2. SDK error messages that link the docs

### Why

During one-shotting, the highest-attention text an agent reads is the error
message it just caused. Errors are the only discovery channel that requires
*zero* prior setup — no skill install, no MCP config, no llms.txt knowledge.
Every actionable error should teach the fix.

### What to change

Central pattern in both SDKs — a `docs(slug)` helper that appends a stable
deep link, so messages end with `→ https://docs.composio.dev/docs/....md#anchor`:

**TypeScript (`ts/packages/core`)** — error classes already exist; add the
link at construction. **Python (`python/composio/exceptions.py`)** — same,
message suffix.

Target the errors that map to known one-shot failure modes (each anchor
already exists in the docs):

| Error | Link target |
|---|---|
| `ToolVersionRequiredError` ("latest" in manual execution) | `/docs/triggers.md#creating-triggers` (version-pinning lesson) |
| No connected account for user | `/docs/authentication.md` + the user_id-must-match lesson |
| Webhook signature verification failure | `/docs/triggers/receiving-events.md#verifying-signatures` |
| Unknown tool/trigger slug (404) | `/docs/triggers.md#creating-triggers` (discover-slugs recipe) |
| Session has workbench enabled when creating a local sandbox | `/docs/sandbox/local-sandbox.md` |
| Trigger config validation errors | `/toolkits/{slug}.md` for the toolkit in question |

Also add `@see` doc links in JSDoc/docstrings for the ~10 highest-traffic
surfaces (`triggers.parse`, `triggers.create`, `session.tools`,
`session.experimental.files`, `composio.create`) — agents read `.d.ts` files
in `node_modules` constantly.

### Keeping the links alive

Doc links inside SDK releases outlive docs restructures, so make the contract
enforceable:

1. Only link **page URLs + anchors that the docs repo tests**: add a small CI
   check in `docs/` that greps both SDKs for `docs.composio.dev` URLs and runs
   them through the existing link validator (`scripts/validate-links.ts`
   already validates fragments). A docs restructure that breaks an SDK-linked
   anchor then fails docs CI, not a user's session.
2. Prefer linking the `.md` URL — it's what an agent will fetch anyway, and
   the redirect layer (`next.config`) covers moved pages.

Effort: ~½ day per SDK + ½ day for the CI contract. Risks: message-format
churn can break tests that assert on exact error strings — append the link on
its own trailing line to keep prefix assertions stable.

## 3. CLI skill install channel

The CLI already owns skill installation: `composio --install-skill claude`
downloads `composio-skill.zip` from the CLI GitHub release and unpacks it to
`~/.agents/skills/` with per-tool symlinks (`ts/packages/cli/src/effects/install-skill.ts`).
Today it only carries the CLI skill. Extend it to install the docs skill too:

- `composio --install-skill composio-docs claude` fetches
  `https://docs.composio.dev/skill.md` (always fresh — no release coupling)
  and writes `~/.agents/skills/composio-docs/SKILL.md`, reusing the existing
  target-symlink logic.
- Mention it in `composio login`'s auto-install path so every CLI user's
  agents learn docs discovery for free.

Effort: small CLI PR; the installer's name parameter and target plumbing
already exist.

## Sequencing

1. SDK error links first — smallest, zero-discovery channel, immediately
   benefits every agent regardless of tooling.
2. MCP server second — biggest per-user win once installed.
3. The CI link contract lands with (1) and protects both.
