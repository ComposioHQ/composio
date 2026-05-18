# Third-iteration review — docs-structure-iteration PR #3446

Reviewed: `git diff origin/next..HEAD -- docs/`, `meta.json`, all pages referenced in decisions-and-resolutions.md and the review checklist.

---

## Review

### Correct

- **Sessions-first IA is real.** `meta.json` now puts Users & Sessions immediately after First Steps. Sessions → Auth → Tools → Triggers → Providers → Platform → MCP & Clients → Help → Legacy is the correct order.
- **Homepage is task-first.** `index.mdx` opens with a two-tab code snippet (`composio.create` / `session.tools()`), then two action cards ("Use Composio" → composio-connect, "Build with Composio" → quickstart). No concept wall, no provider grid above the fold.
- **Legacy is a real collapsed folder.** `docs/content/docs/legacy/` has `meta.json` with `"defaultOpen": false`. Tools-direct, auth-configuration, proxy-execute, and single-toolkit-mcp are all in there. Titles are "Direct tool execution" and "Auth configuration (legacy)" — no false peer-level naming.
- **Redirects are intact.** Old `/docs/tools-direct/:path*`, `/docs/auth-configuration/:path*`, and wildcard modifier paths all redirect to `/docs/legacy/…` with `:path*` preserved. `/docs/authenticating-users` → `/docs/authentication` is in place.
- **FAQ is mostly session-first.** The top FAQ entry correctly starts with sessions/meta tools. Direct execution in the FAQ is framed as "not the recommended path for new agent builds."
- **"tool-router" wording cleared from most pages.** Auth pages, sessions pages, and Tools pages no longer say "tool-router session" for the current API. `sessions-vs-direct-execution.mdx` links back to `/docs/legacy/` for connect links and auth-configs.
- **session lifecycle in `users-and-sessions.mdx` is correct.** The page says: "For multi-turn conversations, store the session ID and reuse it with `composio.use()` rather than calling `create()` again." — consistent with the quickstart PromptBanner.

---

### Blocker

**1. Session lifecycle contradiction survives in the FAQ**

`docs/content/docs/common-faq.mdx`, line 42 ("When should I create a new session?"):

> "Create a new session when the config changes: different toolkits, different auth config, or a different connected account. **You don't need to store or manage session IDs. Just call `create()` each time.**"

`docs/content/docs/users-and-sessions.mdx` (and the quickstart PromptBanner) say the opposite:

> "For multi-turn conversations, store the session ID and reuse it with `composio.use()` rather than calling `create()` again."

This is the original iteration-1 Difficulty #1 — the session lifecycle contradiction — still alive in the FAQ. An AI code generator reading just the FAQ will learn to call `create()` on every request, wasting server-side session isolation and breaking multi-turn context. This is the one item that was flagged in every review loop as must-fix.

**Minimal patch** — replace the accordion body at line 42 of `common-faq.mdx`:

```diff
-Create a new session when the config changes: different toolkits, different auth config, or a different connected account. You don't need to store or manage session IDs. Just call `create()` each time. See [Users and sessions](/docs/users-and-sessions).
+For multi-turn conversations, store the session ID and reuse it with `composio.use()` — do not call `create()` on every request. Create a new session only when the setup changes fundamentally: a different user, a completely different toolkit set, or a changed auth config. See [Users and sessions](/docs/users-and-sessions).
```

---

### High-value fixes

**2. `sessions-vs-direct-execution.mdx` — Direct execution section has no legacy label**

`## Direct execution` (line 112) opens with:

> "Fetch tools by slug or toolkit. Pass them to your LLM or call `tools.execute()` without one."

No callout, no deprecation framing, no "legacy" label. A reader (especially an AI code generator) who skips straight to this section has no signal that this is a maintenance path. The rest of the page provides good framing in the intro, but the section heading itself is a clean entry point.

Worse, the callout on lines 76–79 inside the Sessions section says:

> "`session.tools()` returns **meta tools** … For app tools directly, use direct execution."

This sentence is an unprefaced recommendation to "use direct execution" with no legacy qualifier, appearing _inside the Sessions section_. An AI reading this can treat it as official guidance.

**Minimal patches:**

a) `sessions-vs-direct-execution.mdx`, replace the callout text at line 77:
```diff
-`session.tools()` returns **meta tools** (COMPOSIO_SEARCH_TOOLS, etc.), not app tools (GMAIL_SEND_EMAIL, etc.). The agent discovers app tools at runtime through search. For app tools directly, use direct execution.
+`session.tools()` returns **meta tools** (COMPOSIO_SEARCH_TOOLS, etc.), not app tools (GMAIL_SEND_EMAIL, etc.). The agent discovers app tools at runtime through search. To load specific app tool schemas outside a session, see [Direct execution (legacy)](#direct-execution).
```

b) `sessions-vs-direct-execution.mdx`, insert a callout immediately after `## Direct execution` (before line 114):
```diff
 ## Direct execution
 
+<Callout type="warn">
+Direct execution is a legacy/maintenance path. New agent builds should use sessions and meta tools. Use this section if you are maintaining an older integration or migrating to sessions.
+</Callout>
+
 Fetch tools by slug or toolkit. Pass them to your LLM or call `tools.execute()` without one.
```

**3. `observability/usage.mdx` — stale "tool router session" wording**

Line 68:
```
| `filters.session_id` | string \| string[] | — | Filter events by tool router session |
```

The stable public name is "session", not "tool router session". Fix:
```diff
-| `filters.session_id` | string \| string[] | — | Filter events by tool router session |
+| `filters.session_id` | string \| string[] | — | Filter events by session |
```

---

### Notes (deferred, non-blockers)

**4. `claude-code-plugin.mdx` title is now just "Plugin"**  
Sidebar shows "Plugin" under "MCP & Clients" — still ambiguous without "Claude Code". The page body still says "Composio plugin for Claude Code" in the first sentence. Acceptable for now; could be renamed "Claude Code Plugin" in a follow-up without changing routing.

**5. `index.mdx` Playground link still points to `/tool-router`**  
`href="https://platform.composio.dev/auth?next_page=%2Ftool-router"` — this is a platform URL and presumably redirects to the sessions UI. Not a docs blocker; platform team can update the URL.

**6. `how-composio-works` at the end of Sessions is fine**  
The current order in meta.json: users-and-sessions → configuring-sessions → native-tools-vs-mcp → sessions-vs-direct-execution → how-composio-works. Architecture overview last is correct; it won't gate task pages. The `decisions-and-resolutions.md` intentional-tension is resolved correctly here.

**7. `providers/custom-providers` uses `composio.tools.get`**  
These are legitimate examples for building a custom framework provider, not the standard agent flow. They are in a clearly scoped folder and do not need a legacy callout.

**8. "tool router session" in changelog and reference SDK files**  
Several changelog entries and auto-generated SDK reference files still use "tool router session" terminology. Changelog entries are historical records; auto-generated references mirror the SDK internal naming. Neither is user-facing in the new nav, and both are out of scope for this PR.

---

## Summary

The docs restructuring is **good enough for PR review** except for the three fixes above. The session lifecycle contradiction in the FAQ (Fix 1) is the only true blocker — it directly contradicts the page it links to and would mislead AI code generators. Fixes 2 and 3 are high-value and small; they close the last two points the review checklist explicitly flags. All other issues are cosmetic or deferred.
