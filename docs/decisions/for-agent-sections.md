# Per-page agent instructions via `<ForAgent>`

## Decision

Every docs page can carry implementation details for AI agents inside inline `<ForAgent title="...">` MDX blocks, kept in the same `.mdx` file as the human guide — one block placed directly under each section it details. Each block renders as a subtle, muted "Implementation details: ..." disclosure on the human page and is unwrapped into a `### For AI agents[: title]` heading in the page's `.md` output (and therefore `llms-full.txt`), so the agent detail sits right after the section it belongs to. Discovery stays on the existing contract: agents find pages through `llms.txt` and append `.md` to any docs URL; no new routes or sidecar files are introduced.

## Context

Human guides and agent-facing implementation detail have different needs: humans want narrative and visuals; agents want exact call sequences, argument names, result shapes, and gotchas. Before this decision, the only agent-specific text in `.md` output was the shared per-page-type `llmGuardrails` blocks — there was no home for *page-specific* agent instructions.

Alternatives considered:

- **Sidecar files (`foo.agent.mdx`)** — cleaner separation for writers, but two files per page drift apart, require new collection wiring plus sidebar exclusion, and add no discoverability (agents still read `/docs/foo.md`).
- **Custom agent-only routes** — less discoverable than the `.md` convention agents already probe for.

The inline block won because the emission pipeline already existed: `mdxToCleanMarkdown()` strips JSX tags but keeps inner text, so only a labeled unwrap was needed to give the section a predictable heading.

## Consequences

- Implementation: `components/for-agent.tsx` (a muted native `<details>` disclosure), registered in `mdx-components.tsx`, unwrapped early in `mdxToCleanMarkdown()` (`lib/source.ts`) so inner content still passes through the remaining cleaners.
- Authoring rules (also in `docs/AGENTS.md`): one block directly under each section it details, with a short `title`; no markdown headings inside (they would enter the page TOC and anchor into a collapsed accordion) — sub-section titles are standalone bold lines, promoted to `####` headings by the `.md` unwrap; implementation detail only — no restating the human guide, no duplicating `llmGuardrails` content.
- Pages without a block are unaffected: no block means no `## For AI agents` section.
- TypeScript code inside the block is Twoslash-checked like any other MDX code block.
- Rollout is incremental; `/docs/sandbox` is the reference page.

## Verification

- `curl -s localhost:3000/docs/sandbox.md` contains `### For AI agents:` headings, each following the section it details, before the guardrails.
- The rendered page shows each block as a collapsed "Implementation details: ..." disclosure.
- `bun run build` passes (MDX compiles, Twoslash checks the block's TS code).
- `bun run lint:links` passes when links inside blocks change.
