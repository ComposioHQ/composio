# Apps, Composio Built toolkits, and Provider MCP toolkits

## Decision

When one product ships more than one toolkit, the docs group those toolkits under an **App** and label each member by who maintains it: **Composio Built** for a toolkit Composio builds on the product's public API (descriptors `REST API`, `GraphQL API`, `Graph API`), and **Provider MCP** for a toolkit that connects to the product's own hosted MCP server (descriptor `MCP server`, slug `<slug>_mcp`, name `X MCP`). An App is presentation and decisioning context, not a merge: every member keeps its own slug, auth config, connected account, tool slugs, and readiness, and nothing in the product (sessions, search, execution, auth configs, connected accounts) accepts an App name. You always name an exact toolkit slug.

The docs stop using "native" as a toolkit label anywhere, rename the glossary entry "Native Tools" to "Direct tools (provider package)", and always write "Provider MCP" as the capitalised two-word label so that "provider" on its own keeps meaning an LLM-framework adapter. **Custom MCP** (`CUSTOM_*`, your own remote MCP server registered into your project) stays a separate concept with no App, and Composio's own MCP transports (the session MCP endpoint and Composio Connect) are described as transports, never as toolkits. Decided by JJ on 2026-08-21 after the team's 2026-08-20 `app` grouping decision.

## Context

Provider MCP toolkits are already first-class catalog toolkits (73 `*_mcp` slugs live in the catalog as of 2026-09-01, 30 of them with a Composio Built sibling, including `canva`, `linear`, `notion`, `clickup`, and `supabase`), and the set is still growing. Until now no docs page, glossary term, skill, or toolkit page explained what `tavily_mcp` is or how it relates to `tavily`; the only prose was a changelog line calling them "external MCPs now available as native toolkits". The dashboard ships a grouped catalog and the backend adds an `app` field on the toolkit (PLEN-3109) plus related-toolkit facts in session search (`is_provider_mcp`, auth scheme, triggers, tool count, a reviewed default per ambiguity group, at most one alternative; an explicitly named slug always wins).

The naming choice is constrained by collisions that already live in agent-facing text:

- **native** means three things today: the glossary "Native Tools" (tools called directly through a provider package rather than over MCP), the "native agent plugin" (CLI-backed Codex and Claude Code plugin), and the public API field `type: "native" | "custom"` (catalog vs project-registered, so `tavily_mcp` is itself `type: native`). The dashboard rejected "Native" for the REST sibling for the same reason.
- **provider** means an LLM-framework adapter (`/docs/providers`, "provider package").
- **app** appears in the LLM-guardrail terminology table as a legacy v1/v2 word that agents are told to translate to "toolkit", and "OAuth app" / "managed app" appear throughout the authentication pages.
- **custom** already covers custom auth configs, SDK custom tools (`LOCAL_`), Custom MCP (`CUSTOM_`), custom providers, and the legacy custom MCP server API.
- Internally the same concept has been called family, toolkit group, ambiguity group, app family, implementation, and interface; internal `group` means tenancy.

Alternatives considered: "API toolkit" vs "MCP toolkit" (symmetric, but hides who maintains the toolkit, which is the fact developers ask about first); "Composio Native" vs "Provider MCP" (the 2026-08-18 pill vocabulary, rejected because of the three live meanings of "native"); a blind "prefer MCP" rule in search (rejected on 2026-08-19: Provider MCP toolkits have no triggers and often a narrower surface, and auth scheme is the usual decider).

Facts the docs must not contradict: Provider MCP toolkits have no triggers; tool annotations are dropped on MCP sync today, so tag filters do not apply to their tools; Custom MCP accepts `NO_AUTH`, `API_KEY`, and `DCR_OAUTH` only (classic OAuth2 and CIMD are unsupported as of 2026-08-21, PLEN-3094); `CIMD_OAUTH` exists for Provider MCP toolkits only once the platform change lands; the search-response facts and the `app` field have no shipped engineering artifact as of 2026-08-21.

## Consequences

Vocabulary, to be used identically in docs, dashboard copy, and the agent skills:

| Concept | User-facing | Agent-facing facts | Internal shorthand (never published) |
| --- | --- | --- | --- |
| Group of sibling toolkits for one product | App (field `app`) | `app` on the toolkit; related toolkits under the same app in search | toolkit group, family, ambiguity group |
| Toolkit Composio builds on the product's public API | Composio Built (`REST API` / `GraphQL API` / `Graph API`) | `is_provider_mcp: false`, `auth_schemes`, `triggers_count`, `tools_count` | native toolkit, `toolkit_type: api` |
| Toolkit that connects to the product's own MCP server | Provider MCP (`MCP server`), slug `<slug>_mcp` | `is_provider_mcp: true`; `type: native` | provider MCP, admin MCP, `toolkit_type: mcp` |
| Your own remote MCP server in your project | Custom MCP, slug `CUSTOM_*` | `type: custom`; project-private | custom toolkit (dashboard) |
| In-process SDK tools | Custom tools (`LOCAL_`) | n/a | local tools |
| Composio's MCP transports | Session MCP endpoint (`session.mcp.url`), Composio Connect | n/a | Composio MCP |
| Tools called directly through a provider package | Direct tools (provider package) | n/a | native tools (old glossary name) |

Operational rules for docs and agent surfaces:

- Tavily is the canonical example pair (`tavily`, API key, 5 tools; `tavily_mcp`, DCR OAuth, 5 tools, different tool set).
- A Provider MCP toolkit page states in its first line that it connects to the product's own MCP server. Toolkit pages with siblings render a "Part of the App" strip; derive siblings from the `_mcp`, `_graphql`, `_graph` slug suffix until the `app` field is available, then switch.
- The guide describes the search contract (facts, reviewed default, explicit slug wins) as rolling out until the platform ships it, and never calls a sibling "recommended" until the API returns a reviewed default.
- The LLM-guardrail terminology row for "apps / appType" states that the legacy v1/v2 word meant toolkit and that the current App is a grouping of sibling toolkits; agents must not translate the current term.
- "App" is never used for an OAuth app; the authentication pages say "OAuth app" or "managed app".
- The `composio` skill carries one stable rule: siblings are separate toolkits with separate connections; use the slug the user or code names; when unspecified, read the facts (auth scheme, connected state, triggers, tool count), prefer the toolkit the user can authenticate, and say which one you chose; do not assume `_mcp` is newer, larger, or shares a connection. The `composio-cli` and `composio-runtime` skills get the same rule as follow-ups.
- Pages that carry the vocabulary: `content/docs/apps-and-toolkits.mdx` (guide, Core concepts), `how-composio-works.mdx`, `configuring-sessions.mdx`, `reference/glossary.mdx`, `extending-sessions/custom-mcp.mdx`, `sessions-via-mcp.mdx`, `composio-connect.mdx`, `authentication/custom-app-vs-managed-app.mdx`, `toolkits/managed-auth.mdx`, `agent/knowledge.md`, `agent/instructions/context.md`, `lib/llm-guardrails/session.ts` and `terminology.ts`, `components/toolkits/toolkit-detail.tsx` with `scripts/generate-toolkits.ts` and the toolkit `.md` renderer, and `skills/composio/*`. Generated pages (`toolkits/meta-tools/*`, API reference) change only through their generators.

Follow-up work, each gated on engineering: mirror the exact `app` JSON shape (PLEN-3109); mirror the search fields and the reviewed-default list; add `DCR OAuth` and `CIMD` to the glossary auth schemes when `CIMD_OAUTH` is public; update the Custom MCP page if plain OAuth2 lands (PLEN-3094); write the changelog entry on GA; flip "rolling out" callouts; realign the 2026-09-02 changelog entry, which still calls these "native toolkits"; render the App strip and sibling slug on toolkit pages (`components/toolkits/toolkit-detail.tsx` plus `scripts/generate-toolkits.ts`); regenerate the toolkit snapshot so `/toolkits/notion_mcp.md` resolves.

## Verification

- `bun run build`, `bun run lint:links`, and `bun run test` pass from `docs/`.
- `git grep -n "Native Tools" docs/content docs/lib docs/agent` returns only the alias sentence in the glossary. `git grep -n -i "native toolkit" docs/content skills` still returns `docs/content/changelog/02-09-26.mdx` lines 3 and 7, which keep their original wording as a dated historical record; realigning that entry is tracked as follow-up work below.
- `reference/glossary.mdx` defines App, Composio Built, Provider MCP, Custom MCP, and Direct tools (provider package).
- Not yet true, tracked as follow-up: toolkit pages do not render the App strip or the sibling slug. `/toolkits/tavily_mcp.md` mentions its App context, `/toolkits/tavily.md` does not, and no toolkit renderer or generator changed in this pass.
- The agent eval (12 questions, kept in the docs PR description) passes against the preview `.md` endpoints and the updated `composio` skill: siblings do not share a connection, `toolkits: ["tavily"]` does not expose `tavily_mcp`, App names are not valid in `toolkits`, `CUSTOM_ACME` is unrelated to `acme_mcp`, `session.mcp.url` does not mean Provider MCP toolkits, triggers imply Composio Built, and "native tool" means direct tools through a provider package.
- The shipped dashboard tooltip and switcher heading use the same three labels as the guide.

## Update 2026-09-01

The dashboard grouping shipped with the labels "Composio Built", "Provider MCP", and "Custom" (Type filter, badges, app drawer, and the toolkit-detail comparison strip). A live probe of the public API on 2026-09-01 (`GET /api/v3.1/toolkits/{slug}`) shows no `app` field and no `toolkit_type` field, and session search returns no related-toolkit facts. The customer docs therefore describe the dashboard experience and exact toolkit slugs only, and document no grouping or search API fields until they ship. The shipped docs and skills use Notion (`notion` / `notion_mcp`, both verified live) as the canonical example pair instead of Tavily, because Notion is the pair shown in the dashboard screenshots and it is the only candidate pair whose tool and trigger counts (53 tools / 8 triggers against 37 / 0) illustrate the triggers difference. Tavily does still have both toolkits; the earlier note that it did not was wrong. The markdown exporter's fallback tab label in `docs/lib/source.ts` was also updated from "Native Tools" to "Direct tools" in this pass, so the Verification grep for "Native Tools" now returns only the glossary alias sentence.
