# Iteration 2 difficulties

Second review loop: Claude and Codex reviewed the first implementation pass.

## Claude second-pass difficulties

Claude agreed the big direction was improved:

- Sessions-first narrative was now real.
- Legacy content was moved into a collapsible folder.
- Redirects and most links were updated.
- Composio Connect title bridged MCP/product naming.
- Tools browsing guidance became session-native.

But Claude found one blocker and a few IA tensions:

1. **Malformed `index.mdx` frontmatter**
   - The new `<Tabs>` snippet had been inserted inside YAML frontmatter.
   - Difficulty: task-first code examples are good, but MDX/frontmatter boundaries make homepage snippets easy to break.

2. **`sessions-vs-direct-execution` placement remained debatable**
   - Moving it into Sessions helps builders make the key decision.
   - But the video also said direct execution should not appear up front.
   - Difficulty: the page is both an important decision doc and a legacy-path comparison.

3. **`how-composio-works` placement remained debatable**
   - It was in Sessions after task pages.
   - Difficulty: architecture overview is useful, but it can become concept-first if placed before task pages.

4. **MCP & Clients section moved late**
   - This aligns with SDK-first/session-first docs, but differs from the video's initial Use Composio grouping.
   - Difficulty: Slack feedback pushed against over-promoting plugin/client docs, while the video still wanted Use Composio recognized.

5. **Claude Code Plugin title remained ambiguous**
   - If kept, a generic `Plugin` title is weak.

## Codex second-pass difficulties

Codex confirmed most link and route work, then found exact fixes:

1. **Malformed `index.mdx` frontmatter**
   - Same blocker as Claude.
   - Resolution required moving the snippet below the closing `---`.

2. **Wildcard redirects dropped `:path*`**
   - `/docs/tools/modify/:path*` and `/docs/modifiers/:path*` redirected to the folder root instead of preserving deep links.

3. **`/docs/authenticating-users` redirected to legacy direct auth**
   - This conflicted with current Auth IA.
   - It should redirect to `/docs/authentication`.

4. **Optional `COMPOSIO_WAIT_FOR_CONNECTIONS` omitted from Connect tools**
   - Removing the 7-tool claim was good, but the available tools list should mention the optional wait tool.

5. **FAQ still treated direct execution as peer guidance**
   - The top FAQ still said agent builders could fetch specific tools and pass them directly.
   - Difficulty: even one early FAQ can undermine sessions-first guidance.

## Fixes applied after iteration 2

- Moved homepage code snippet out of YAML frontmatter.
- Added TypeScript imports so Twoslash/build passes.
- Preserved `:path*` on legacy modifier redirects.
- Redirected `/docs/authenticating-users` to `/docs/authentication`.
- Added optional `COMPOSIO_WAIT_FOR_CONNECTIONS` to Composio Connect MCP tools.
- Reworded FAQ to make sessions/meta tools the new-agent default and direct execution legacy/maintenance-only.
- Re-ran `validate-links`, `build`, and static tests.
