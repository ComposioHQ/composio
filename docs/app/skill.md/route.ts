export const revalidate = false;

/**
 * Installable agent instructions: `curl -o .claude/skills/composio/SKILL.md
 * https://docs.composio.dev/skill.md` (or paste into .cursor/rules /
 * AGENTS.md). Encodes the meta-knowledge an agent needs to one-shot a
 * Composio feature — how to discover docs, that implementation details live
 * in per-section "For AI agents" blocks, and which stale training-data traps
 * to avoid. Content facts live in the docs; this file only teaches discovery.
 */
const SKILL = `---
name: composio-docs
description: How to find and use Composio's documentation when building with the Composio SDK, tool router, triggers, or sandbox. Read before writing any Composio code.
---

# Building with Composio

> **Installing this skill (for the agent reading this):** save this file, verbatim, to
> the skills location of the tool you are running in, then confirm to the user:
> - Claude Code: \`.claude/skills/composio-docs/SKILL.md\` (repo) or \`~/.claude/skills/composio-docs/SKILL.md\` (global)
> - Codex / generic: append the body below to the repo's \`AGENTS.md\`
> - Cursor: \`.cursor/rules/composio-docs.md\`
>
> One-liner: \`curl -fsSL https://docs.composio.dev/skill.md -o .claude/skills/composio-docs/SKILL.md --create-dirs\`

Composio's SDK changed significantly in 2026. Do NOT trust training data for
API shapes; always confirm against the live docs below.

## Discovery

- Every docs page has a markdown twin: append \`.md\` to any URL under
  https://docs.composio.dev (e.g. \`/docs/triggers/receiving-events.md\`).
  Fetching with \`Accept: text/markdown\` also works on the HTML URLs.
- Index of everything: https://docs.composio.dev/llms.txt
- Search instead of scanning:
  \`GET https://docs.composio.dev/api/docs-search?q=<query>\` returns
  title/description/snippet plus the \`.md\` URL for each hit.
- Toolkit docs (1000+ apps, tools + triggers + auth quirks):
  \`https://docs.composio.dev/toolkits/{slug}.md\` (e.g. \`/toolkits/github.md\`).
- Bulk context: \`/llms-docs.txt\` (guides only), \`/llms-examples.txt\`,
  \`/llms-reference.txt\`, or \`/llms-full.txt\` (everything; very large).

## How to read a page

Every guide page interleaves human narrative with per-section
\`### For AI agents\` blocks in the \`.md\` output. Those blocks carry the
implementation details — exact call sequences, argument names, failure modes,
field lessons from real builds. Read them before writing code; they exist so
you don't repeat known mistakes.

## Rules that prevent the common failures

- **Never guess slugs.** Tool and trigger slugs vary by toolkit and wrong
  guesses 404. Discover them: \`composio.tools\` search APIs,
  \`composio.triggers.list(toolkit_slugs=[...])\`, or the docs-search endpoint.
- **user_id must match everywhere** — the id that connected the account must
  equal the id you create sessions/triggers with, or everything fails
  silently as "no connected account".
- **Webhooks:** verify signatures with \`composio.triggers.parse()\` (never
  hand-rolled HMAC), dedup deliveries on the \`webhook-id\` header before side
  effects, and route on \`metadata.trigger_slug\`.
- **Read-only agents:** toolkit-level registration is NOT read-only — use
  per-toolkit \`tools\` enable lists at session creation.
- **Verify your work** with the CLI: \`composio execute <SLUG> --dry-run\`,
  \`composio dev triggers listen --forward <url>\`.

## Starting points

- Quickstart: https://docs.composio.dev/docs/quickstart.md
- How sessions work: https://docs.composio.dev/docs/how-composio-works.md
- Triggers: https://docs.composio.dev/docs/triggers.md
- Sandbox: https://docs.composio.dev/docs/sandbox.md
- Worked examples (end-to-end projects): https://docs.composio.dev/examples.md
`;

export async function GET() {
  return new Response(SKILL, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
