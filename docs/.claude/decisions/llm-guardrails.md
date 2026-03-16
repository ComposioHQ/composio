# LLM Guardrails

## Decision

Inject invisible guardrail instructions into every `.md` response so AI code generators use the correct Composio SDK patterns. Guardrails are scoped per-page via frontmatter — different pages can get different instruction sets.

## Problem

LLMs that crawl or receive Composio docs generate code using the old direct tool execution pattern (`composio.tools.get()`, `composio.provider.handle_tool_calls()`) instead of the current session-based pattern (`composio.create()`, `session.tools()`).

## Architecture

```
lib/llm-guardrails/
├── index.ts               ← getGuardrails(type), module-private GuardrailType
├── session.ts             ← SESSION_GUARDRAILS constant (default)
└── direct-execution.ts    ← DIRECT_EXECUTION_GUARDRAILS constant
```

### How it flows

1. `getLLMText()` in `lib/source.ts` reads `page.data.llmGuardrails` from frontmatter
2. Passes it to `getGuardrails(type)` which returns the right guardrail string
3. Appends it to the markdown output

### Scoping via frontmatter

Pages control which guardrails they get:

| Frontmatter value | What gets appended |
|---|---|
| *(omitted — default)* | `SESSION_GUARDRAILS` — full "use composio.create() + session.tools()" instructions, ALWAYS/NEVER rules, deprecated patterns, verification checklist |
| `llmGuardrails: "direct-execution"` | `DIRECT_EXECUTION_GUARDRAILS` — acknowledges direct execution is valid, but strongly recommends sessions unless user explicitly asks for it |
| `llmGuardrails: "none"` | Nothing |

The Zod schema in `source.config.ts` validates the field at build time — typos cause build failures.

### Tagged pages (12 total)

`tools-direct/` (8):
- executing-tools, fetching-tools, authenticating-tools, custom-tools
- toolkit-versioning
- modify-tool-behavior/schema-modifiers, before-execution-modifiers, after-execution-modifiers

`auth-configuration/` (4):
- connected-accounts, custom-auth-configs, custom-auth-params, programmatic-auth-configs

### Endpoint behavior

| Endpoint | Guardrails behavior |
|---|---|
| `/:path*.md` (per-page) | Appended per page based on frontmatter |
| `llms.txt` (index) | One-liner note at top pointing to session pattern |
| `llms-full.txt` (all pages) | `SESSION_GUARDRAILS` once at the top, per-page guardrails disabled (`includeGuardrails: false`) to avoid 1148x repetition |
| Copy Page button | Fetches `.md` endpoint, so guardrails are included automatically |

### getLLMText options

```typescript
getLLMText(page, {
  includeFooter?: boolean;     // default true — nav links at bottom
  includeGuardrails?: boolean; // default true — guardrail block
})
```

`llms-full.txt` passes both as `false` and handles them at the route level instead.

## Why this approach

| Alternative | Why not |
|---|---|
| Per-page component/accordion | Requires adding to every page, new pages miss it |
| URL-path matching in code | Implicit — moving a file breaks it silently |
| Separate "Copy Prompt" button (Clerk-style) | Clashes with existing "Copy Page" button |
| Guardrails in frontmatter content | Visible to humans on the site |

Frontmatter tag + pipeline injection = zero visual impact, zero per-page maintenance, explicit opt-in for different behavior, build-time validation.

## Adding a new guardrail set

1. Create `lib/llm-guardrails/your-set.ts` exporting a string constant
2. Add the enum value to `llmGuardrails` in `source.config.ts`
3. Add a case to `getGuardrails()` in `lib/llm-guardrails/index.ts`
4. Tag pages with `llmGuardrails: "your-set"` in frontmatter

## Session guardrails content

The default guardrails include:
- Correct pattern code (Python + TypeScript)
- Provider packages table (9 providers)
- ALWAYS rules (4)
- NEVER rules (4)
- Deprecated patterns with markers
- Verification checklist (5 items)

## Direct execution guardrails content

The softer guardrails include:
- Note that this page documents the low-level API
- Recommended session pattern code (Python + TypeScript)
- "When to use direct execution" — only when user explicitly asks for it
