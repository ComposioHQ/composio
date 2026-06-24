---
name: good-docs-audit
description: Audit a doc, guide, README, or block of prose against the good-docs-writing style guide and report violations. Use when the user asks to review, critique, lint, or "check the voice/tone" of documentation or text. Produces a structured findings report (file:line, rule violated, offending text, suggested rewrite) and does NOT edit files unless explicitly asked.
---

# Good docs audit

Review target documentation against the `good-docs-writing` rules and report where the writing drifts from Modal's voice. Default behavior is **report only** — produce findings, do not edit. Only modify files if the user explicitly says to fix, rewrite, or apply.

## Procedure

1. **Read the `good-docs-writing` skill first** so you audit against its current rules (Voice, Structure, Terminology, Punctuation, Code examples, Formatting). Those rules are the rubric; this skill is the process.
2. **Read the target file(s) in full** with line numbers. If the user named a directory or glob, enumerate the docs and audit each. If no target is given, ask which file(s) to audit.
3. **Walk each rule category** against the prose. Note every concrete violation with its line number.
4. **Write the report** in the format below. Keep suggestions concrete — give the actual rewrite, not "consider revising."
5. **Stop and present the report.** Offer to apply fixes; apply only if asked.

## Prioritized checklist

Scan for these in roughly this order — the top items most damage the Modal voice:

1. **Hedging & filler** — "it might be the case that," "in order to," "basically," "simply," "just." Cut or commit.
2. **Passive voice** where active is clearer — "the function is invoked by the client" → "the client invokes the function."
3. **Marketing fluff / vague intensifiers** — "seamlessly," "powerful," "robust," "blazing-fast," "cutting-edge," "world-class." Replace with a concrete claim or delete.
4. **Em-dashes** — flag every em-dash (—); the house style bans them. Suggest a period, comma, colon, or parentheses in its place.
5. **Third-person distance** — "the user," "one," "developers can" where "you" is meant.
6. **Jargon without context** — an undefined acronym or term-of-art on first use with no grounding.
7. **Inconsistent terminology** — the same concept named two ways, or core nouns (App, Function, Image, Volume, Secret) miscapitalized or capitalized inconsistently.
8. **Title-case drift** — heading case that switches between sentence case and title case within one doc.
9. **Missing backticks** — code identifiers, commands, params, paths, or filenames in plain text.
10. **Buried warnings** — gotchas, version notes, or gated-feature notes in prose that should be callouts.
11. **Weak openings** — page or section that doesn't lead with the concept or benefit; throat-clearing before the point.
12. **Fragment / unrunnable code** — snippets that can't be pasted and run, or missing the expected-output / footgun note.

## Report format

Output a summary line, then findings grouped by severity. Each finding uses this shape:

```
- file.md:42 — [Punctuation] Em-dash banned
  Offending: "Modal is fast — really fast — and it scales automatically."
  Rewrite:   "Modal is fast, really fast, and it scales automatically."
```

Structure the full report as:

### Audit: <file or scope>

**Summary:** <N findings — X high, Y medium, Z low. One-line verdict on overall voice fit.>

**High** (breaks the voice / reader-facing clarity)
- `path:line` — [Category] <rule> · Offending: "…" · Rewrite: "…"

**Medium** (consistency and polish)
- `path:line` — [Category] <rule> · Offending: "…" · Rewrite: "…"

**Low** (nits)
- `path:line` — [Category] <rule> · Offending: "…" · Rewrite: "…"

**Patterns:** <recurring issues worth a global fix, e.g. "'the user' used 11× — switch to 'you' throughout.">

## Rules

- **Always cite `file:line`** so findings are actionable. Use the line numbers from your Read.
- **Quote the exact offending text**; don't paraphrase the problem away.
- **Give a real rewrite**, in Modal voice, for every finding — not generic advice.
- **Map each finding to a style-guide category** (Voice, Structure, Terminology, Punctuation, Code, Formatting) in brackets.
- **Don't invent violations.** If the prose already matches the voice, say so. A short report is a good outcome.
- **Don't edit by default.** Report, then offer to apply. Only write to files when explicitly asked.
