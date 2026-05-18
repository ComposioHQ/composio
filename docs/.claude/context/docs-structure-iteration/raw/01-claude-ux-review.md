# Composio Docs UX Review — Claude/Human "Show Me How to Use" Lens

**Reviewed files:** meta.json, index.mdx, quickstart.mdx, how-composio-works.mdx, users-and-sessions.mdx, tools-and-toolkits.mdx, authentication.mdx, triggers.mdx

---

## Review

### Correct: what is already good

**`quickstart.mdx` is the strongest page in the set.** It starts with a framework selector and goes immediately to `pip install / npm install` → API keys → code. The PromptBanner components (AI agent rules + anti-patterns) are well-conceived. The "Never: call tools directly without a session" section is exactly the "show me how, and show me what NOT to do" philosophy the Slack critique is asking for. This page should be the template for all others.

**`authentication.mdx` decision tree is well done.** The "Which approach should I use?" block appears before any explanation, telling the reader exactly which path to take. The in-chat example conversation (`You: Summarize my emails → Agent: Click here to authorize...`) is show-don't-tell at its best.

**`tools-and-toolkits.mdx` "How it works" numbered flow** (User → SEARCH_TOOLS → MANAGE_CONNECTIONS → EXECUTE_TOOL → Done) is the right format for a busy reader. The meta tools table is clean.

**`meta.json` structure is sound at the top level.** First Steps → Use Composio → Build with Composio → Sessions → Auth → Tools → Triggers → Platform → Help → Legacy maps to the video's intent.

---

### Blocker: critical issues

#### B1 — `how-composio-works.mdx` contains a factual lie: "Sessions are immutable"
**File:** `docs/content/docs/how-composio-works.mdx` — "Sessions" section

> "Sessions are immutable. Their configuration is fixed at creation. If the context changes…, create a new session."

`users-and-sessions.mdx` directly contradicts this with a full `session.update()` example that changes toolkits, auth_configs, and connected_accounts. A reader who reads how-composio-works first will be confused or write worse code. The sentence needs to be corrected to match reality:

> Sessions can be reused with `composio.use()` and updated with `session.update()`. Every `create()` call returns a new session ID for clean task isolation.

#### B2 — `tools-and-toolkits.mdx` actively promotes the deprecated pattern
**File:** `docs/content/docs/tools-and-toolkits.mdx` — "Toolkits and tools" section

> **Callout:** "If you know exactly which tools you need, you can [execute them directly](/docs/tools-direct/executing-tools) without meta tools."

This appears in the main Tools page, which is the primary reference for agents building with sessions. It sends readers to a legacy page as if it is a peer option. The Slack critique and the video are explicit: direct execution is legacy and should not be surfaced in the main flow. Either remove this callout entirely, or replace it with:

> **Callout (type=warn):** "Direct tool execution is a legacy pattern. For new projects, use sessions and meta tools."

---

### Fixed: issues with concrete file+line changes

#### F1 — `index.mdx`: "Build with Composio" card goes nowhere useful
**File:** `docs/content/docs/index.mdx`

The card:
```jsx
<Card
  icon={<Code />}
  title="Build with Composio"
  href="#get-started"
  ...
/>
```
`href="#get-started"` is an anchor to a heading two paragraphs below on the same page — not a destination. A reader clicking "Build with Composio" expects to land somewhere they can start building, not scroll 200px. Change to `href="/docs/quickstart"`.

#### F2 — `index.mdx`: opens with a feature-list paragraph, not an action
**File:** `docs/content/docs/index.mdx` — first content line

> "Composio powers 1000+ toolkits, tool search, context management, authentication, and a sandboxed workbench to help you build AI agents that turn intent into action."

This is the exact "concept-first" anti-pattern from the Slack critique. The sentence is a feature inventory, not an invitation. Compare to Modal's guide (cited as the ideal): it opens with a single-sentence "what you'll be doing" and immediate code.

**Recommended change:** Replace the opening paragraph with a two-line hook + a mini code snippet showing the session pattern in 3 lines, then the two path cards.

```
Give your AI agent access to 1000+ apps in minutes.

```python
session = composio.create(user_id="user_123")
tools = session.tools()
# → your agent now has access to Gmail, GitHub, Slack, and 1000+ more
```

Then the path cards. Providers grid should move further down the page, not appear before users have made a decision about which path to take.

---

### Note: observations, risks, and follow-ups

#### N1 — `users-and-sessions.mdx` opens with concept prose before any code
**File:** `docs/content/docs/users-and-sessions.mdx` — first three sections

The page structure is: Users (concept paragraph → accordion → two link cards → more concept) → Sessions (concept paragraph → Creating a session → code). A reader has to read ~300 words and click through two accordions before seeing their first `composio.create()` call.

**Recommended reorder:**
1. Open with `composio.create(user_id="user_123")` and `composio.use(session_id)` — what users actually call.
2. Put the "what is a user / what is a session" definition in a collapsible accordion or secondary paragraph.
3. Move "best practices for user IDs" accordion to the bottom; it's advanced.

This does not require rewriting, only reordering. The content is good — the problem is placement.

#### N2 — `---Legacy---` separator in `meta.json` does not actually collapse
**File:** `docs/content/docs/meta.json`

`---Legacy---` renders as a label, not a collapsible group. The four legacy pages (`single-toolkit-mcp`, `proxy-execute`, `tools-direct`, `auth-configuration`) appear at full sidebar prominence alongside current content. This is a technical gap noted by the automated PR reviewer and confirmed in the context file.

**Fix:** Create `docs/content/docs/legacy/` with its own `meta.json` containing `"defaultOpen": false` and move the four files there. Replace the four entries + separator in parent meta.json with a single `"legacy"` reference.

Until this is done, the sidebar sends mixed signals about what is current vs deprecated.

#### N3 — `authentication.mdx` leads with a video before any explanatory text
**File:** `docs/content/docs/authentication.mdx` — second content element

```mdx
<Video src="/images/connect-link-auth-flow-recording.mp4" autoPlay />
```

This appears immediately after the frontmatter description, before the "Which approach should I use?" decision block. Auto-playing video as the first meaningful content element is jarring on first visit and breaks screen readers / search indexing. Move the `<Video>` to after the in-chat authentication example section, where it would illustrate the flow visually.

#### N4 — `meta.json`: `claude-code-plugin` as a top-level "Use Composio" entry is over-weighted
**File:** `docs/content/docs/meta.json`

The Slack critique specifically: "you probably do not want use composio to have much docs — why does claude code plugin even have a doc?" The current "Use Composio" section has only three entries: composio-connect, cli, claude-code-plugin. The plugin is a narrow integration (one AI tool, one workflow) that doesn't need to sit at the same level as the MCP server and CLI. Consider moving it under a "Plugins" sub-page or into a cookbook.

#### N5 — `how-composio-works.mdx` is in "Build with Composio" but links to four other sections
**File:** `docs/content/docs/how-composio-works.mdx`

This page lives in the "Build with Composio" section (meta.json) alongside only "providers", but links readers to Sessions, Auth, Tools, and Triggers — each of which is a separate top-level section. A reader following the sidebar linearly would read this page, click into Sessions, then have to navigate back to the sidebar to find Auth. The page functions as a gateway/overview but isn't positioned as one.

**Options:** (a) Rename this section "Overview" and move it before "Sessions"; (b) Add a "reading order" callout at the top of how-composio-works that says "Read this first, then go through Sessions → Auth → Tools in order"; (c) Accept that readers use the sidebar, not linear reading, and leave it. At minimum, the cross-section links should be clearer about what section they're jumping to.

#### N6 — `triggers.mdx` accordion definitions feel concept-first
**File:** `docs/content/docs/triggers.mdx`

The "What is a trigger type?" and "What is a trigger instance?" accordions appear *before* the "Next steps" cards and therefore before any instruction on how to create one. For a reader who skips the accordion (most), they'll hit "Creating triggers" without understanding the type/instance distinction. For a reader who opens them, they get definitions mid-explanation. Better: integrate the definitions inline in the numbered "Working with triggers" list at the point where each term first appears.

---

## Priority summary

| Priority | File | Change |
|---|---|---|
| **Blocker** | `how-composio-works.mdx` | Fix "Sessions are immutable" factual error |
| **Blocker** | `tools-and-toolkits.mdx` | Remove or warn-label the direct execution callout |
| **High** | `index.mdx` | Fix `href="#get-started"` → `/docs/quickstart` |
| **High** | `index.mdx` | Replace opening feature-list with action hook + code sample |
| **High** | `meta.json` | Move legacy pages to `legacy/` subfolder with `defaultOpen: false` |
| **Medium** | `users-and-sessions.mdx` | Reorder: code first, definitions second |
| **Medium** | `authentication.mdx` | Move `<Video>` below the in-chat example |
| **Low** | `meta.json` | Consider demoting `claude-code-plugin` out of top-level Use Composio |
| **Low** | `how-composio-works.mdx` | Add reading-order callout or restructure cross-section linking |
| **Low** | `triggers.mdx` | Inline trigger type/instance definitions into the numbered steps |
