# Decisions and resolutions

## Fixed in PR #3446

### Sessions-first IA

Decision: Put Sessions immediately after First Steps.

Why: If `composio.create(user_id)` is the core pattern, the sidebar should teach it before Auth, Tools, Triggers, Providers, or MCP clients.

### Task-first homepage

Decision: Replace feature/provider-grid overload with a short action-oriented intro and immediate session code.

Why: Slack feedback explicitly rejected concept-first docs. The homepage should point people to a concrete next step.

### Legacy collapse

Decision: Move direct execution and old auth-config docs under `docs/content/docs/legacy/` with `defaultOpen: false`.

Why: Fumadocs separators cannot collapse. Deprecated paths should not render as peer-level pages.

### Direct execution language

Decision: Keep legacy docs available, but relabel links and callouts as legacy/maintenance context.

Why: Users maintaining older integrations still need docs, but new agent builds must not treat direct execution as the default.

### Session lifecycle contradiction

Decision: Make `how-composio-works` match `users-and-sessions`: sessions persist, can be reused with `composio.use()`, and can be updated with `session.update()`.

Why: Conflicting session lifecycle descriptions are especially harmful for AI code generators.

### Composio Connect tools

Decision: Avoid hard-coding “7 meta-tools” in overview copy, but list `COMPOSIO_WAIT_FOR_CONNECTIONS` as optional in the tools list.

Why: The default/core tools and optional enabled tools differ; the docs should not imply the optional tool is always present or nonexistent.

### Redirects and tests

Decision: Add redirects for moved legacy paths, preserve wildcard suffixes, and teach the static navigation test that external Markdown links in `meta.json` are valid.

Why: Moving legacy docs is only safe if existing inbound links and tests continue to work.

## Intentional tensions to re-check

### `sessions-vs-direct-execution` placement

Current state: In Sessions.

Why: It answers a high-value builder decision early: use sessions/meta tools, not direct APIs.

Risk: Because it mentions direct execution, it could still feel like a peer option. Keep checking that the page title/body clearly says sessions are recommended and direct execution is legacy/maintenance.

### `how-composio-works` placement

Current state: In Sessions after task-oriented session pages.

Why: It is useful architecture context, but should not come before runnable setup.

Risk: It may still be too conceptual. Keep checking whether the page opens with enough task framing.

### MCP & Clients prominence

Current state: Late section after Platform.

Why: Slack feedback warned not to over-expand “Use Composio” or elevate narrow plugin docs.

Risk: The video still wanted MCP/CLI/plugin grouped clearly. Keep checking whether MCP users can still find Composio Connect quickly from the homepage.

### Claude Code Plugin page

Current state: Kept under MCP & Clients.

Why: Existing docs page remains, but demoted.

Risk: It may be too narrow for sidebar prominence. Future cleanup may fold it into Composio Connect.
