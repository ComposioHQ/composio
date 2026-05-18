# Second Iteration Review — Composio Docs Structure

**Branch:** `docs-structure-iteration-7afef2b6` (10 commits ahead of `origin/next`)  
**Scope:** Evaluate whether the new structure better addresses the Slack/video goals: task-first, sessions-first, less concept-first, legacy properly hidden.

---

## Review

### Correct: what is already working well

**Sessions-first structure is now real.**  
- `---Sessions---` is the second section (right after First Steps).  
- `users-and-sessions.mdx` leads with `composio.create(user_id)` + `session.tools()` code immediately in the opening paragraph — no concept preamble.  
- Welcome `index.mdx` description (the OG/SEO string) frames the whole product around sessions: "Create a session for a user, hand the session tools to your agent."  

**Legacy is properly hidden.**  
The original PR blocker (`---Legacy---` being a non-collapsible separator) is fixed. Legacy content is now in `docs/content/docs/legacy/` with `meta.json → "defaultOpen": false`. Both sub-folders (`auth-configuration/` and `tools-direct/`) also have their own `meta.json` with `"defaultOpen": false`. All three are collapsed by default in the sidebar. ✅  

**Redirects are complete and tested.**  
`next.config.mjs` adds 301s for every moved path:
- `/docs/single-toolkit-mcp` → `/docs/legacy/single-toolkit-mcp`
- `/docs/proxy-execute` → `/docs/legacy/proxy-execute`
- `/docs/tools-direct/:path*` → `/docs/legacy/tools-direct/:path*`
- `/docs/auth-configuration/:path*` → `/docs/legacy/auth-configuration/:path*`

`redirects.test.ts` is updated to match. ✅  

**Stale layout.tsx comment fixed.**  
`docs/app/(home)/docs/layout.tsx` searches for `"First Steps"` (not the old `"Get Started"`). ✅  

**Top nav simplified.**  
"Use Composio" was added then removed from the top nav in two successive commits. Final state: `Docs | Toolkits | Reference | Cookbooks` only. No double-highlight issue. ✅  

**Composio Connect title bridges MCP.**  
`composio-connect.mdx` title updated from `"Composio Connect"` to `"Composio Connect (MCP)"`. ✅  

**Inbound links in body text updated.**  
Every link that used to point to `/docs/tools-direct/…` or `/docs/auth-configuration/…` now correctly points to `/docs/legacy/tools-direct/…` and `/docs/legacy/auth-configuration/…` across sessions-vs-direct-execution, glossary, common-faq, cli, manually-authenticating, and shared-connections pages. ✅  

**Tools page renamed to action-oriented title.**  
`tools-and-toolkits.mdx` → title `"How Agents Use Tools"`. Less concept-first. ✅  

**Direct execution Callout added to fetching-tools.**  
`toolkits/fetching-tools-and-toolkits.mdx` now closes with a Callout: "Low-level catalog and direct tool APIs are legacy for new agent builds." The browsing section replaced raw `composio.tools.get()` code samples with a session-native numbered workflow. ✅  

**Providers section collapses by default.**  
`docs/content/docs/providers/meta.json` adds `"defaultOpen": false`. Reduces sidebar depth for users who aren't looking for provider-specific docs. ✅  

---

### Blocker

**`docs/content/docs/index.mdx` — `<Tabs>` component is inside the YAML frontmatter block.**  
**File:** `docs/content/docs/index.mdx`, lines 5–20 (confirmed by `node` script).

The file structure is:
```
---                          ← frontmatter start
title: Welcome
description: Give your AI agent…

<Tabs …>                     ← INSIDE frontmatter (line 5)
<Tab value="Python">
```python
session = composio.create(…)
```
</Tab>
…
</Tabs>
keywords: [getting started, introduction]
---                          ← frontmatter end (line 21)
```

`gray-matter` (via `js-yaml`) parses strict YAML between the `---` delimiters. A plain scalar like `description: Give your AI agent…` ends at its newline; the blank line and `<Tabs` on its own line are invalid YAML tokens (not a valid key or scalar). `js-yaml` will throw a `YAMLException` and the page will fail to build.

By contrast, the correctly written `users-and-sessions.mdx` places `<Tabs>` on line 9, which is **after** the closing `---` on line 5.

**Fix:** Move the `<Tabs>` + code block snippet from inside the frontmatter to the body (after the closing `---`), either as the first body content before the Cards, or remove it (the description text already conveys the same message).

---

### Note: medium-value cleanup items

**1. `sessions-vs-direct-execution` page belongs in Migration, not Sessions.**  
**File:** `docs/content/docs/meta.json`, line 11.  
The Sessions section currently has five items: `users-and-sessions`, `configuring-sessions`, `native-tools-vs-mcp`, `sessions-vs-direct-execution`, `how-composio-works`. The video is explicit: "Direct tool execution is now legacy and should not show up upfront." A comparison page titled "Sessions vs Direct Execution" keeps direct execution visible as a peer option for new readers browsing the Sessions section. Moving it to `migration-guide` (as a sibling of `direct-to-sessions`) or under Help would better signal that it's a legacy decision path, not a live choice for new builds.

**2. `how-composio-works` is buried as the 5th item in Sessions.**  
**File:** `docs/content/docs/meta.json`, line 12.  
`how-composio-works` is an architecture overview covering sessions, meta tools, auth, and workbench — it reads more naturally as an entry point than as a fifth item inside Sessions. Consider moving it to be the third page under First Steps (after `index` and `quickstart`), or the first page under Sessions. Currently a new developer who skips to the Sessions section will read about users/sessions/sessions-vs-direct before they see the one-page summary of how the whole thing fits together.

**3. "MCP & Clients" section is buried after Platform.**  
**File:** `docs/content/docs/meta.json`, lines 47–50.  
Sidebar order: First Steps → Sessions → Auth → Tools → Triggers → Providers → Platform → MCP & Clients → Help. The video said "Use Composio = MCP, CLI, plugin" and treated this as the prominent no-code entry point. The Welcome page card correctly links to composio-connect, but the sidebar section comes after Platform. Someone scanning the sidebar for MCP will need to scroll past most of the SDK-focused content. Slack feedback also said plugin docs are probably unnecessary — the Claude Code Plugin page (renamed to just "Plugin") still exists in this section. If Slack feedback is adopted and the Plugin page is pruned, this section shrinks to just `composio-connect` and `cli`. Consider collapsing it or merging `composio-connect` into First Steps as a "Use without code" option.

**4. `claude-code-plugin.mdx` title is too generic.**  
**File:** `docs/content/docs/claude-code-plugin.mdx`.  
Renamed from "Claude Code Plugin" to just "Plugin" — but that's ambiguous within a section called "MCP & Clients." If the page stays, `"Claude Code Plugin"` (or even `"Claude Code & Cursor Plugin"`) is less confusing than the bare "Plugin". If Slack's intent is to remove it, this is moot.

**5. `legacy/tools-direct/meta.json` title lacks "(Legacy)" marker.**  
**File:** `docs/content/docs/legacy/tools-direct/meta.json`.  
The title is `"Direct tool execution"` without any `(Legacy)` qualifier. The parent `legacy/meta.json` has `"title": "Legacy"` so the sidebar group already says Legacy at the top level — this is acceptable. But adding `"(Legacy)"` to the subsection title would make it unambiguous if a user deep-links into it from an external site.

---

### Summary

The iteration substantially improved the structure. Sessions-first narrative is real and the Welcome page now leads with code. Legacy content is properly collapsed. Redirects are complete. The only hard build-blocker is the `<Tabs>` component inside the YAML frontmatter in `index.mdx` (lines 5–20) — this will throw a YAML parse error. The structural notes (sessions-vs-direct placement, MCP & Clients position) are high-value cleanup but not blockers.
