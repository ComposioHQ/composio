---
name: good-docs-writing
description: Writing style guide derived from Modal's documentation voice. Apply when writing or editing docs, guides, tutorials, or technical prose that should read direct, second-person, confident, low-jargon, and example-first. Use to draft new docs in this voice or to revise existing prose toward it.
---

# Good docs writing

Write docs the way Modal writes them: direct, friendly, confident, and ruthlessly practical (this guide is derived from Modal's documentation voice). Explain the *why* in one breath, then show working code. Treat the reader as a capable developer who wants to ship, not a student who needs a lecture. Apply every rule below while drafting. Each rule is an imperative followed by a real Modal example as evidence.

## Voice & Tone

- **Address the reader as "you"; speak directly.** Don't hide behind "the user" or "one."
  > "Modal's goal is to make running code in the cloud feel like you're running code locally."
- **Be confident and plain, not hedgy or salesy.** State what's true. Lead with the benefit, not the disclaimer.
  > "Modal makes it trivially easy to scale compute across thousands of containers."
- **Reassure when something is automatic.** Tell the reader what they *don't* have to worry about.
  > "For the most part, scaling out will happen automatically, and you won't need to think about it."
- **Explain the "why" before prescribing the "how."** Motivate the solution, then give it.
- **Use contractions naturally** ("you don't," "won't," "it's"). They keep the tone human.
- **Allow occasional warmth and personality** ("That's it!", "Take a breath of fresh air"), sparingly, never goofy.

## Structure

- **Open by defining the concept or stating the benefit in one sentence**, then elaborate. No throat-clearing.
  > "An `App` represents an application running on Modal. It groups one or more Functions for atomic deployment and acts as a shared namespace."
- **Order content as concept → simple example → advanced cases → gotchas.** Progressive disclosure.
- **Lead with a minimal runnable example early**, then explain what just happened.
- **Keep paragraphs short.** Break dense information into bullet lists and numbered steps.
- **Use signposting transitions** to mark explanatory shifts: "What just happened?", "But why does this matter?", "Now, as before, …".
- **Mix sentence lengths.** Short declarative sentences carry the load; longer ones add necessary nuance.
  > "The timeout duration is a measure of a Function's *execution* time. It does not include scheduling time or any other period besides the time your code is executing in Modal."

## Terminology

- **Capitalize your product's core nouns as proper concepts** the way Modal capitalizes App, Function, Image, Volume, Secret, Sandbox, Cls. Capitalize a noun when it names the product, lowercase for the generic idea.
- **Name the product consistently**; never "the Modal platform" filler.
- **Prefer precise technical terms over hand-waving** — "cold start," "autoscaler," "ephemeral," "atomic deployment," "warm pool," "scaledown window." Introduce a term in context the first time, then use it freely.
  > "This is known as a *cold start*, and it is often associated with higher latency."
- **Avoid marketing fluff and vague intensifiers** ("seamlessly," "powerful," "robust," "cutting-edge"). If a thing is easy, show it being easy.
- **Use analogies to ground unfamiliar concepts**, then move on.
  > "Containers are like light-weight virtual machines."

## Punctuation

- **Do not use em-dashes (—).** Rewrite the sentence with a period, comma, colon, or parentheses instead. This is a hard rule; remove every em-dash before you ship. (This overrides Modal's softer "em-dashes for genuine asides only" guidance — em-dashes are banned here.)
- **Use the Oxford comma.**
- **Use backticks for every code identifier, command, parameter, path, and filename**: `@app.function()`, `modal deploy`, `scaledown_window`, `/gpu-glossary/`.
- **Use italics for fine distinctions and negation**, not for general emphasis.
  > "This automatic upgrade does *not* change the cost of the GPU."
- **Capitalize acronyms and hardware names** as conventional: GPU, ASGI, A100, H100.

## Code examples

- **Show a complete, runnable snippet first** — imports, decorator, function — not a fragment the reader can't paste.
- **Keep examples minimal.** Use simple names (`f`, `app`) and elide irrelevant bodies with `...`.
- **Show the decorator pattern Modal uses** (`@app.function()`, `@app.cls()`) and method chaining for Images.
- **Put comments only where behavior is non-obvious**; let clean code speak otherwise. Show expected output inline where it teaches something (`# 42`).
- **Show real CLI invocation forms** with realistic prompts: `$ ` or `%` for shell, `>>>` for the Python REPL.
  > "modal run script.py::app.f"
- **When a flag is a footgun, say so right after the example.**
  > "Remember to remove `force_build=True` after you've rebuilt the Image, or it will rebuild every time you run your code."

## Formatting

- **Use heading case consistently within a doc.** Modal leans toward sentence case for conceptual guides ("How do Web Functions run in the cloud?", "Scaling out") and title case for reference-style headings ("Volume commits and reloads"). Pick one convention per page and don't drift.
- **Prefer descriptive, specific headings** over generic ones — "Entrypoints for ephemeral Apps," not "Entrypoints."
- **Use callouts for warnings, notes, gated features, and beta status** rather than burying them in prose.
  > "Deployment rollbacks are available on the Team and Enterprise plans."
- **Correct gently with a "Note that …" or "Gotchas" aside** instead of stern warnings.
- **Link with descriptive anchor text**, embedded naturally in the sentence — never a bare URL or "click here."
- **Bold key concepts on first definition**, then stop bolding them.

## Quick self-check while drafting

- Did I open with the concept or benefit in the first sentence?
- Is there a runnable example near the top?
- Am I saying "you," not "the user"?
- Did I remove every em-dash?
- Did I cut every "seamlessly," "powerful," and other vague intensifier?
- Are all code identifiers in backticks and core nouns (App, Function, Volume) capitalized?
