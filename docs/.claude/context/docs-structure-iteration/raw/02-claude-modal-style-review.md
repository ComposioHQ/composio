# Modal-Style Docs Review: Composio PR #3443 Structure

**Reviewer stance:** Skeptical. I like Modal's task-first, show-don't-tell approach and I'm checking whether the proposed nav structure earns its complexity or just shuffles concept walls around.

---

## TL;DR

The Quickstart page is excellent — code-first, framework-tabbed, sessions-first, best file in the repo. But the surrounding structure undermines it. The two-category split at the top of the nav ("Use Composio" vs "Build with Composio") is the central problem. It forces users to self-classify before they understand the product, buries the core pattern (Sessions) in the fourth group, and makes the MCP/CLI content feel like a co-equal offering to SDK development. **The proposed structure makes docs easier than the current state but still creates concept-first confusion in specific places described below.**

---

## What's Good (Evidence)

**1. Quickstart is modal-style already.**
`quickstart.mdx` does the right thing: no preamble, immediate `pip install`, then `composio.create(user_id)` → `session.tools()` → pass to agent. The `<PromptBanner>` anti-patterns block is a nice touch. Framework tabs and MCP/Native tabs match how real users arrive. This page should be the template for every other page.

**2. Sessions page is solid and task-oriented.**
`users-and-sessions.mdx` leads with the concept briefly, then gives API signatures immediately. The "When should I create a new session?" accordion is the right level of progressive disclosure.

**3. `sessions-vs-direct-execution` page exists and the content is accurate.**
The comparison table is exactly what a builder needs early. The problem is placement (see below).

**4. Auth section hierarchy is correct.**
`authentication.mdx` → "which approach?" → in-chat vs manual → advanced configs. That's a genuine progressive disclosure path. The "Not sure? Start with in-chat" callout is exactly right.

**5. Tools page title is honest about what it does.**
`tools-and-toolkits.mdx` (titled "How Agents Use Tools") explains meta tools with a table and a concrete step-by-step flow. This is the right level of task grounding.

**6. Legacy section exists.**
Having it is correct. The content placement is correct. The mechanism is broken (see Blockers below).

---

## Blockers

**B1. `---Legacy---` separator does not collapse.**
Evidence: `meta.json` line `"---Legacy---"` is a plain section label, not a collapsible group. Four pages of deprecated content (single-toolkit-mcp, proxy-execute, tools-direct, auth-configuration) are fully visible in the sidebar by default. A user scanning the nav will see "proxy-execute" and "tools-direct" alongside current patterns and be confused about what to use. This was called out in every automated PR review and has not been fixed in the current structure.

Fix: Move legacy pages into `docs/content/docs/legacy/` with their own `meta.json` containing `"defaultOpen": false`. Replace the four inline entries in the root `meta.json` with a single `"legacy"` folder reference.

**B2. "Build with Composio" section has two pages, both wrong for their position.**
`how-composio-works.mdx` is a concept overview (Sessions → Meta Tools → Auth → Workbench) with light code. `providers/index.mdx` is a link grid. Neither page teaches you to *build* anything. A user landing on "Build with Composio" → "How Composio Works" after doing the Quickstart gets a prose re-explanation of things the Quickstart already showed them in code. A user who skips the Quickstart and starts here gets a concept wall before a single working example.

The `how-composio-works` content is genuinely good as *reference* — but it's in the wrong position as an *entry point* to building.

---

## Structural Issues (should be fixed before shipping)

**S1. Sessions are the core pattern but are the fourth top-level section.**
The docs organizer principle says: "`composio.create(user_id)` is THE pattern." Yet in the nav:

```
--- First Steps ---        ← 1
--- Use Composio ---       ← 2 (MCP/CLI/Plugin)
--- Build with Composio -- ← 3 (conceptual overview + provider grid)
--- Sessions ---           ← 4 ← THE core pattern
```

A builder who finishes the Quickstart needs to find Sessions next. They have to scroll past "Use Composio" (which isn't for them) and "Build with Composio" (which has no session content) to reach it. Modal's docs put the thing you do most, soonest.

**Recommendation:** Move `Sessions` to position 2, immediately after `First Steps`. Cut "Build with Composio" as a top-level group entirely (its content gets redistributed, see S3).

**S2. "Use Composio" is the first substantive section and it's the wrong audience.**
The current second group is: composio-connect, cli, claude-code-plugin. These are for people connecting Claude Code, Cursor, or other MCP clients — not for people building agents with the SDK. Placing this above Sessions means the first thing a builder encounters after the Quickstart is documentation for a different use case.

The Slack feedback was direct: "why does claude code plugin even have a doc [in this position]." The plugin page (`claude-code-plugin.mdx`) is ~110 lines and describes an alternative install path for a single client. It doesn't belong as a first-class top-nav item.

**Recommendation:** Rename "Use Composio" → "MCP & Clients" and move it to the bottom of the nav, above Help. Merge or link `claude-code-plugin` from within `composio-connect` rather than as a separate sidebar entry. The CLI page can stay (it has real utility) but is a niche tool, not a primary onboarding path.

**S3. `how-composio-works` is misplaced as a building entry point.**
Its current position: "Build with Composio" → first page. It reads like "read this before you code." But the Quickstart is the right before-you-code page. `how-composio-works` is valuable as a "what's happening under the hood" reference, reachable after you've seen sessions and tools in practice.

**Recommendation:** Demote `how-composio-works` to the bottom of the Sessions section or create a small "Reference" sub-section within Sessions for architecture content. The "Build with Composio" section title either gets retired or gets replaced by a thin "Providers & Integrations" section containing just `providers/index.mdx`.

**S4. `sessions-vs-direct-execution` is buried in Help.**
This is the most important decision a new SDK user makes: "do I use sessions (meta tools) or do I fetch specific tools directly?" Currently it lives in Help between migration-guide and glossary. Any user who hits the Sessions section or Auth section and wonders "wait, is there another way?" will not find this page until they're frustrated.

**Recommendation:** Move `sessions-vs-direct-execution` into the Sessions section, at position 4 after `native-tools-vs-mcp`. It fits there logically: create session → configure it → choose transport (native vs MCP) → choose approach (sessions vs direct).

---

## Homepage Card Strategy

The current `index.mdx` Welcome page has:
- 2 large audience-split cards ("Use Composio" / "Build with Composio")
- 1 card group for "Get Started" (just Quickstart)
- 1 "Explore" group (Toolkits + Playground)
- A full Providers grid
- A "Features" group (Auth, Triggers, CLI, White Labeling)

**What's wrong:** The two-audience-split cards at the top ask users to classify themselves ("are you a no-code user or a builder?") before they understand what Composio is. Neither card description establishes the product clearly. "No code required. Connect your AI tools via MCP, CLI, or Plugin." sounds like a different product from "Integrate Composio into your app with our SDK."

The "Features" card group at the bottom (Auth, Triggers, CLI, White Labeling) duplicates the sidebar nav at a low level of specificity. It doesn't help a user decide what to do next.

**What Modal does:** The guide page starts with "Getting started" and immediately shows runnable code. No audience split. The section heading *is* the task ("Run a function on Modal", "Build a web app"). Cards are used sparingly for cross-references.

**Recommended homepage changes:**

1. **Remove the two-audience-split cards.** Replace them with a single code block showing the four-line core pattern:
   ```python
   composio = Composio(provider=OpenAIAgentsProvider())
   session = composio.create(user_id="user_123")
   tools = session.tools()  # framework-ready meta tools
   # pass tools to your agent
   ```
   Below it: one button → "Quickstart (5 min)".

2. **Keep the Providers grid** but move it up to directly below the code snippet. "Which framework?" is the first real question for an SDK user. The grid answers it immediately.

3. **Keep the Toolkits explore card** as-is. "Browse 1000+ toolkits" is a genuine next action.

4. **Drop the "Features" card group.** Auth, Triggers, CLI, and White Labeling belong in the sidebar. Surfacing them on the homepage at this level adds noise without guiding the user.

5. **Keep the Community link** at the bottom.

---

## Recommended Revised Top-Level Nav Order

```
--- First Steps ---
index
quickstart

--- Sessions ---               ← promoted to #2 (THE core pattern)
users-and-sessions
configuring-sessions
native-tools-vs-mcp
sessions-vs-direct-execution   ← moved from Help

--- Auth ---
authentication
authenticating-users
managing-multiple-connected-accounts
importing-existing-connections
subscribing-to-connection-expiry-events
using-custom-auth-configuration
white-labeling-authentication
[OAuth2 Guides]

--- Tools ---
tools-and-toolkits
workbench
toolkits/fetching-tools-and-toolkits
toolkits/enable-and-disable-toolkits
toolkits/custom-tools-and-toolkits

--- Triggers ---
triggers
setting-up-triggers/creating-triggers
setting-up-triggers/subscribing-to-events
setting-up-triggers/managing-triggers
webhook-verification

--- Providers ---               ← replaces "Build with Composio"
providers                       ← the grid, not an overview page
how-composio-works              ← demoted to reference, still discoverable

--- Platform ---
projects
observability/logs
observability/usage
signing-up-as-an-agent

--- MCP & Clients ---           ← demoted, was "Use Composio"
composio-connect
cli
(claude-code-plugin removed from sidebar; linked from composio-connect)

--- Help ---
migration-guide
glossary
debugging-info
troubleshooting
common-faq
custom-app-vs-managed-app

--- Legacy ---                  ← properly collapsible folder, defaultOpen:false
(single-toolkit-mcp, proxy-execute, tools-direct, auth-configuration)
```

**The core logic of this order:**
- Sessions first because sessions are what every SDK user does on line 3 of any example.
- Auth, Tools, Triggers follow in the order a builder encounters them when building a real agent.
- Providers is a reference grid, not an entry point, so it's late.
- MCP & Clients is for a different user journey; it's available but not prominent.
- `how-composio-works` stays in the nav as a reference, but no longer implies it's a prerequisite.

---

## Minor Notes

**N1. Stale layout comment.** `docs/app/(home)/docs/layout.tsx` still says "Get Started" per PR review. Low priority but confusing.

**N2. `composio-connect.mdx` title is "MCP" not "Composio Connect".** The page title should match the product name. The file uses "Composio Connect" in prose but the frontmatter title is `MCP`. A first-time visitor hitting this page via search won't see the product name in the browser tab.

**N3. `signing-up-as-an-agent` is under Platform but it's an onboarding page.** The target audience (an AI agent onboarding itself) will arrive before they need platform concepts. Consider moving it to First Steps, or at minimum noting in the Quickstart that agents should see this page.

**N4. The `---Use Composio---` nav active-highlight problem noted in PR reviews** (only lights up on `/docs/composio-connect`, not CLI/plugin siblings) becomes moot if you rename and demote this section. If you keep the current structure, the `active: 'url'` fix from the PR reviews is required.

---

## Summary Assessment

The proposed structure is an improvement over the current state: it groups scattered auth/trigger/tool content, introduces sessions as a concept, and separates legacy patterns. But it still leads with the wrong section for the primary builder audience and puts the core pattern (Sessions) too far down the nav. The homepage forces a self-classification that confuses rather than guides. Neither of these is a content problem — the content is largely good — it's purely a sequencing and hierarchy problem.

The two changes with the biggest impact for minimal effort:
1. **Move Sessions to position 2** (immediately after First Steps).
2. **Fix Legacy collapse** (folder + `defaultOpen:false`).

Everything else in the recommended structure above is still correct but less urgent.
