---
name: good-docs-audit
description: Audit a doc, guide, README, or block of prose against the shared good-docs-writing standard and report violations. Use when the user asks to review, critique, lint, or check documentation structure, sentence clarity, voice, examples, or formatting. Produces a structured findings report (file:line, rule violated, offending text, suggested rewrite) and does NOT edit files unless explicitly asked.
---

# Good docs audit

Review target documentation against the shared `good-docs-writing` standard.
Report applicable structure, clarity, voice, and example issues. Default behavior
is report only. Modify files only if the user explicitly says to fix, rewrite,
or apply.

Read `references/audit-process.md` for the procedure, the prioritized violation checklist, the report format, and the reporting rules.

Non-negotiables:

- Read `good-docs-writing` and its `references/style-guide.md` first. Those rules
  are the rubric. This skill owns the process.
- Identify the page's purpose and documented exceptions before applying the rubric.
- Allow checked hidden setup and reference fragments with explicit context. Flag
  missing context or misleading claims that a fragment is runnable.
- Cite `file:line` for every finding and quote the exact offending text.
- Give a real rewrite in the target voice, not "consider revising."
- Don't invent violations. A short report is a good outcome.
