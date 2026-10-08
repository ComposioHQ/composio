---
name: good-docs-audit
description: Audit a doc, guide, README, or block of prose against the good-docs-writing style guide and report violations. Use when the user asks to review, critique, lint, or check the voice and tone of documentation or text. Produces a structured findings report (file:line, rule violated, offending text, suggested rewrite) and does NOT edit files unless explicitly asked.
---

# Good docs audit

Review target documentation against the `good-docs-writing` rules and report where the writing drifts from that voice. Default behavior is **report only**: produce findings, do not edit. Only modify files if the user explicitly says to fix, rewrite, or apply.

Read `references/audit-process.md` for the procedure, the prioritized violation checklist, the report format, and the reporting rules.

Non-negotiables:

- Read `good-docs-writing` (and its `references/style-guide.md`) first. Those rules are the rubric; this skill is the process.
- Cite `file:line` for every finding and quote the exact offending text.
- Give a real rewrite in the target voice, not "consider revising."
- Don't invent violations. A short report is a good outcome.
