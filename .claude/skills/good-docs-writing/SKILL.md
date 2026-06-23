---
name: good-docs-writing
description: Writing style guide for clear, direct technical docs — second-person, confident, low-jargon, and example-first. Apply when writing or editing docs, guides, tutorials, READMEs, or technical prose that should read well and help developers ship. Use to draft new docs in this voice or revise existing prose toward it.
---

# Good docs writing

Write docs that are direct, friendly, confident, and ruthlessly practical. Explain the *why* in one breath, then show working code. Treat the reader as a capable developer who wants to ship, not a student who needs a lecture. Apply every rule below while drafting.

## Voice & tone

- **Address the reader as "you"; speak directly.** Don't hide behind "the user" or "one."
- **Be confident and plain, not hedgy or salesy.** State what's true. Lead with the benefit, not the disclaimer.
- **Reassure when something is automatic.** Tell the reader what they *don't* have to worry about ("Composio refreshes OAuth tokens for you, so you don't handle re-auth").
- **Explain the "why" before prescribing the "how."** Motivate the solution, then give it.
- **Use contractions naturally** ("you don't," "won't," "it's"). They keep the tone human.
- **Allow occasional warmth and personality**, sparingly, never goofy.

## Structure

- **Open by defining the concept or stating the benefit in one sentence**, then elaborate. No throat-clearing.
- **Order content as concept → simple example → advanced cases → gotchas.** Progressive disclosure.
- **Lead with a minimal runnable example early**, then explain what just happened.
- **Keep paragraphs short.** Break dense information into bullet lists and numbered steps.
- **Use signposting transitions** to mark explanatory shifts: "What just happened?", "But why does this matter?".
- **Mix sentence lengths.** Short declarative sentences carry the load; longer ones add necessary nuance.

## Terminology

- **Capitalize your product's core nouns consistently.** For Composio: Session, Toolkit, Tool, Connected account, Auth config, Trigger, Provider, Sandbox. Pick a capitalization and don't drift.
- **Name things consistently.** Don't call the same concept two different things, and avoid filler like "the platform."
- **Prefer precise technical terms over hand-waving** ("connected account," "auth config," "meta tool," "cold start"). Introduce a term in context the first time, then use it freely.
- **Avoid marketing fluff and vague intensifiers** ("seamlessly," "powerful," "robust," "cutting-edge," "blazing-fast"). If a thing is easy, show it being easy.
- **Use analogies to ground unfamiliar concepts**, then move on.

## Punctuation

- **Use em-dashes for genuine asides only**, and don't pepper them through a page. One per paragraph is plenty; reach for a period, comma, or parentheses first. (In some repos em-dashes are banned entirely — check the project's convention.)
- **Use the Oxford comma.**
- **Use backticks for every code identifier, command, parameter, path, slug, and filename**: `composio.create(userId)`, `session.tools()`, `COMPOSIO_API_KEY`, `/docs/authentication`.
- **Use italics for fine distinctions and negation**, not for general emphasis.
- **Capitalize acronyms and product names** as conventional: API, OAuth, SDK, MCP, JSON.

## Code examples

- **Show a complete, runnable snippet first** — imports, setup, the call — not a fragment the reader can't paste.
- **Keep examples minimal.** Use simple names and elide irrelevant bodies with `...`.
- **Match the reader's language** (Python or TypeScript) when they've chosen one; otherwise lead with one and offer the other in a tab.
- **Put comments only where behavior is non-obvious**; let clean code speak otherwise. Show expected output inline where it teaches something.
- **Show real CLI and REPL forms** with realistic prompts: `$` for shell, `>>>` for the Python REPL.
- **When a flag or parameter is a footgun, say so right after the example.**

## Formatting

- **Use heading case consistently within a doc.** Sentence case for conceptual guides, title case for reference headings — pick one convention per page and don't drift.
- **Prefer descriptive, specific headings** over generic ones ("Configuring a session," not "Configuration").
- **Use callouts for warnings, notes, gated features, and beta status** rather than burying them in prose.
- **Correct gently with a "Note that …" or "Gotchas" aside** instead of stern warnings.
- **Link with descriptive anchor text**, embedded naturally in the sentence — never a bare URL or "click here."
- **Bold key concepts on first definition**, then stop bolding them.

## Quick self-check while drafting

- Did I open with the concept or benefit in the first sentence?
- Is there a runnable example near the top?
- Am I saying "you," not "the user"?
- Did I cut every "seamlessly," "powerful," and unnecessary em-dash?
- Are all code identifiers in backticks and core nouns capitalized consistently?
