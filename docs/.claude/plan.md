# Cookbooks Complete Revamp — Task Tracker

**Goal:** Transform cookbooks into a use-case-driven section with scannable card overview, concise dual-language examples, problem-first framing, and a Modal-inspired index page. All code uses the `session.create` paradigm exclusively.

---

## Phase 1: Foundation & Structure

### 1.0 Rename Examples → Cookbooks ✅

- [x] Renamed `content/examples/` → `content/cookbooks/`
- [x] Updated all source configs, routes, nav, search, LLM endpoints, sitemap
- [x] Added `/examples/` → `/cookbooks/` permanent redirects
- PR #2638 (merged)

### 1.1 Review & Update Provider Pages

**LLM Guardrails** ✅

- [x] Session guardrails (default, ~1100+ pages)
- [x] Direct execution guardrails (12 tagged pages)
- [x] Pipeline injection via `getLLMText()`
- [x] `llms-full.txt` and `llms.txt` updated

**Existing Providers (review & update)** ✅

- [x] `openai.mdx` — Responses API + Chat Completions
- [x] `anthropic.mdx` — Messages API, Steps pattern
- [x] `google.mdx` — Chat API, Steps pattern
- [x] `vercel.mdx` — Native tools only, Steps pattern
- [x] `langchain.mdx` — PR #2651
- [x] `llamaindex.mdx` — PR #2651
- [x] `mastra.mdx` — PR #2651
- [x] `crewai.mdx` — PR #2651 + PR #2650 (strict mode fix)
- [x] `openai-agents.mdx` — PR #2651

**New Providers (write from scratch)**

- [x] `claude-agent-sdk.mdx` — Python + TS (PR #2651)
- [x] `autogen.mdx` — Python only (PR #2651, SDK has broken imports — PLEN-1603)
- [x] `google-adk.mdx` — Python only (PR #2651)
- [ ] `langgraph.mdx` — Python only (not started)
- [x] Providers index page with card grid (PR #2655)
- Cloudflare removed (PLEN-1602 for e2e testing)

**PRs:**
- #2651 — Providers revamp (merged into next)
- #2655 — Providers index page + reorder
- #2650 — CrewAI strict mode fix
- #2647 — LangChain serialization fix

**Linear Tickets:**
- PLEN-1602 — Cloudflare e2e testing
- PLEN-1603 — AutoGen broken imports

### 1.2 Move existing cookbooks to guides/ subfolder — DEFERRED

- [ ] Move `fast-api`, `hono`, `slack-summariser`, `vercel-chat`, `tool-generator` to `content/cookbooks/guides/`
- [ ] Delete `gmail-labeler.mdx` and `supabase-sql-agent.mdx`
- [ ] Add redirects
- Deferred until after Phase 2

### 1.3 Rewrite cookbooks meta.json — DEFERRED

- [ ] New category structure (Code & DevOps, Communication, Sales, Research, etc.)
- Deferred until after Phase 2

### 1.4 Create "Use Composio With" section — DEFERRED

- [ ] chatgpt, agent-builder, claude-desktop, claude-code, cursor, vscode, mcp-url, n8n
- Deferred until after Phase 2

### 1.5 Rewrite cookbooks index page — DEFERRED

- [ ] Card-grid overview inspired by Modal
- Deferred until after Phase 2

---

## Phase 2: Write New Use-Case Cookbooks

**Template for each cookbook:**
- Title + 1-paragraph description
- What You'll Build (2-3 bullets)
- Prerequisites (API keys, connected accounts)
- Implementation (code in files, imported via include)
- How It Works
- Next Steps

**Key rules:**
- All code uses `session.create` paradigm exclusively
- No auth boilerplate — link to `/docs/authentication`
- Code lives in `docs/cookbooks/{name}/` directory, imported into MDX via include
- Action-oriented titles

### Priority 1 (highest impact)

- [x] `chat-app` — Build a Chat App (PR #2728, branch: `docs/chat-app-1`)
- [ ] `slack-bot` — Build a Slack Bot (Vercel AI SDK + Composio)
- [ ] `pr-review-agent` — Build a PR Review Agent (GitHub)
- [ ] `gmail-auto-labeler` — Build a Gmail Auto-Labeler (Gmail)
- [ ] `slack-summarizer` — Build a Slack Channel Summarizer (Slack)
- [ ] `mcp-setup` — Connect Composio Tools via MCP
- [ ] `research-agent` — Build a Research Agent (Web Search, Scraping)

### Priority 2

- [ ] `lead-enrichment` — Build a Lead Enrichment Agent (HubSpot, Web)
- [ ] `email-at-scale` — Send Personalized Emails at Scale (Gmail)
- [ ] `issue-triage` — Auto-Triage GitHub Issues (GitHub)
- [ ] `meeting-notes-to-notion` — Sync Meeting Notes to Notion (Notion)
- [ ] `sheets-sync` — Sync Data to Google Sheets (Google Sheets)

### Priority 3

- [ ] `email-trigger-agent` — Run an Agent on New Emails (Gmail, Triggers)
- [ ] `daily-digest` — Daily GitHub Digest to Slack (GitHub, Slack)
- [ ] `calendar-agent` — Create Calendar Events from Natural Language (Google Calendar)
- [ ] `ci-failure-notifier` — Post CI Failures to Discord (GitHub, Discord)
- [ ] `social-posting` — Social Media Content Agent (LinkedIn, Twitter)
- [ ] `voice-agent` — Build a Voice Agent with Tool Calling (Voice, TBD)

---

## Phase 3: Write Framework Cookbooks

Full-stack templates live as cloneable repos on GitHub. Docs pages describe what the template does, show key snippets, and link to the repo.

### TypeScript Frameworks

- [ ] `express.mdx`
- [ ] `fastify.mdx`
- [ ] `hono.mdx`
- [ ] `nextjs.mdx`
- [ ] `nestjs.mdx`
- [ ] `nuxt.mdx`
- [ ] `sveltekit.mdx`
- [ ] `node-http.mdx`

### Python Frameworks

- [ ] `fastapi.mdx`
- [ ] `flask.mdx`
- [ ] `django.mdx`

---

## Phase 4: Polish

- [ ] Run `bun run build` to validate all TypeScript code blocks
- [ ] Test mobile layout
- [ ] Verify all cross-links work
- [ ] Update `.claude/decisions/examples.md` with status

---

## Phase 5: Revamp Cookbooks Index Page

- [ ] Visual card grid with categories (Modal-inspired)
- [ ] Each card: title, short description, toolkit tags
- [ ] Featured/popular section at top
- [ ] Update incrementally as cookbooks are added

---

## Decisions & Notes

- Code files live at `docs/examples/{cookbook-name}/` (excluded from tsconfig, type-checked by twoslash via `<include>`)
- MDX pages use fumadocs `<include>` component to import code from files
- Cookbooks link to GitHub source: `github.com/ComposioHQ/composio/tree/master/docs/examples/{name}`
- Tools count is now 1000+ (not 250+)
- Phase 1.2–1.5 deferred until after Phase 2 for continuous shipping
- Twoslash JSX fix: added `jsx: ReactJSX` + `jsxImportSource: react` to twoslash compilerOptions in source.config.ts (global fix for all TSX code blocks)
- `examples/` excluded from tsconfig.json (twoslash handles type-checking via `<include>`, Next.js `tsc` can't resolve local relative imports)
- Welcome page revamped: hero cards (Tutorial + How it works), full-width Quickstart, AIToolsBanner component, Explore section
- AIToolsBanner component has markdown fallback in `lib/source.ts` for LLM crawlers

---

## Summary

| Phase | Status |
|-------|--------|
| 1.0 Rename Examples → Cookbooks | ✅ Done |
| 1.1 Provider Pages | ✅ Done (except `langgraph.mdx`) |
| 1.2–1.5 Structure & Index | Deferred |
| 2 Use-Case Cookbooks | In progress (1 done, 17 remaining) |
| 3 Framework Cookbooks | Not started (11 cookbooks) |
| 4 Polish | Not started |
| 5 Index Page Revamp | Not started |
