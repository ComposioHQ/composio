# Custom MCP Lifecycle Documentation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the Custom MCP guide into an API-first lifecycle that takes a developer from registration through authenticated setup, syncing, SDK usage, and deletion.

**Architecture:** Keep the existing `custom-mcp.mdx` route and verified endpoint examples. Reorder its content into one lifecycle, move reference material after the lifecycle, and add a compact operational responsibility boundary without changing platform or SDK contracts.

**Tech Stack:** MDX, Fumadocs components, cURL, Python SDK examples, TypeScript SDK examples

## Global Constraints

- Custom MCP remains marked experimental.
- Registration uses `POST /api/v3/custom/toolkits/upsert` and is insert-only.
- Sync uses `POST /api/v3/custom/toolkits/sync`.
- Delete uses `DELETE /api/v3.1/custom/toolkits/{slug}`.
- No-auth registration performs the initial sync automatically.
- API-key and DCR OAuth toolkits require an active connected account before syncing.
- Later tool changes require manual resync.
- A Custom MCP toolkit contains at most 500 tools.
- Lifecycle operations are not exposed through the Python or TypeScript SDKs.
- The dashboard remains a short alternative callout, not a parallel walkthrough.
- Do not add a changeset for this docs-only change.

---

### Task 1: Reflow the Custom MCP lifecycle guide

**Files:**
- Modify: `docs/content/docs/extending-sessions/custom-mcp.mdx`

**Interfaces:**
- Consumes: Existing Custom MCP endpoint contracts, SDK examples, versioning guidance, and known gaps.
- Produces: One API-first lifecycle guide at `/docs/extending-sessions/custom-mcp`.

- [x] **Step 1: Replace the current disconnected section order**

Reorder the existing content into:

```text
Introduction
Custom MCP lifecycle
Register a Custom MCP
Complete setup for your authentication mode
Sync and resync tools
Delete or replace a Custom MCP
Authentication types
Use Custom MCP in a session
What you manage and what Composio handles
Technical behavior
Known gaps
Related guides
```

- [x] **Step 2: Keep registration API-first**

Place the three existing `POST /api/v3/custom/toolkits/upsert` cURL examples under registration. Follow the response with the existing insert-only warning and a short callout linking to the dashboard Toolkits page as an alternative.

- [x] **Step 3: Explain the authentication branch**

Add a compact table immediately after registration:

```text
No auth -> initial sync happens during registration -> no connected account
API key -> create and activate connected account -> sync with connected_account_id
DCR OAuth -> complete user authorization -> sync with connected_account_id
```

- [x] **Step 4: Separate ongoing sync behavior**

Keep the existing sync request and response. State directly that Composio does not continuously watch the server, later tool changes require another sync, each successful sync creates a version, and more than 500 tools causes the sync to fail without replacing the last successful version.

- [x] **Step 5: Pair deletion with replacement semantics**

Keep the existing delete request and response. State that the current replacement flow is delete, then register again, and that deletion revokes and removes the toolkit's existing authentication resources and connections.

- [x] **Step 6: Move SDK usage after lifecycle management**

Retain the Python and TypeScript examples for no-auth and authenticated sessions. Keep explicit `connected_accounts` and `connectedAccounts` selection for authenticated toolkits.

- [x] **Step 7: Add the operational responsibility boundary**

Add a two-column table:

```text
You manage -> remote server hosting and HTTPS availability; tool implementation; auth-provider behavior; deciding when to resync
Composio handles -> project-scoped toolkit registration; connected-account credential storage; tool-schema sync and versions; proxied execution; session exposure
```

Use operational wording rather than contractual ownership language.

- [x] **Step 8: Preserve technical behavior and known gaps**

Keep toolkit slug behavior, Tool Router discovery, v3 versus v3.1 version selection, and every current known-gap row. Remove only duplicate prose that the lifecycle now explains more clearly.

### Task 2: Verify the page

**Files:**
- Test: `docs/content/docs/extending-sessions/custom-mcp.mdx`

**Interfaces:**
- Consumes: The reflowed MDX page.
- Produces: A buildable page whose rendered order matches the approved lifecycle.

- [x] **Step 1: Check the diff**

Run:

```bash
git diff --check
git diff -- docs/content/docs/extending-sessions/custom-mcp.mdx
```

Expected: no whitespace errors and no endpoint or SDK contract drift.

- [x] **Step 2: Validate links and types**

Run from `docs/`:

```bash
bun run lint:links
bun run types:check
```

Expected: zero link errors and successful type generation.

- [x] **Step 3: Build the docs site**

Run from `docs/` with Node.js 24:

```bash
PATH=/Users/shamsharoon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH bun run build
```

Expected: the production build completes and generates all docs pages.

- [x] **Step 4: Verify localhost**

Run:

```bash
curl --fail http://localhost:3000/docs/extending-sessions/custom-mcp
```

Expected: HTTP `200`. Inspect the rendered HTML for lifecycle headings, the insert-only warning, manual resync, delete consequences, responsibility boundaries, and the 500-tool limit.

### Task 3: Commit and update the existing PR

**Files:**
- Modify: `docs/content/docs/extending-sessions/custom-mcp.mdx`
- Include: `docs/superpowers/specs/2026-07-29-custom-mcp-lifecycle-doc-flow-design.md`
- Include: `docs/superpowers/plans/2026-07-29-custom-mcp-lifecycle-doc-flow.md`

**Interfaces:**
- Consumes: Verified documentation changes.
- Produces: An updated `codex/docs-custom-mcp-servers` branch and PR #3975.

- [ ] **Step 1: Commit the implementation**

Run:

```bash
git add docs/content/docs/extending-sessions/custom-mcp.mdx docs/superpowers/plans/2026-07-29-custom-mcp-lifecycle-doc-flow.md
git commit -m "docs: reflow custom MCP lifecycle guide"
```

- [ ] **Step 2: Push the branch**

Run:

```bash
git push origin codex/docs-custom-mcp-servers
```

- [ ] **Step 3: Verify the PR head**

Run:

```bash
gh pr view 3975 --repo ComposioHQ/composio --json url,state,isDraft,headRefOid
```

Expected: the PR is open and its head matches the pushed local commit.
