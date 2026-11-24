# Style guide

Use this shared standard when drafting, restructuring, or auditing Composio docs.
It adapts the [pstack technical-writing standard](https://github.com/cursor/plugins/blob/ca782ed8b3c2c521cead8e1720d55c3a5dbf2347/pstack/skills/technical-writing/SKILL.md)
and its [unslop rules](https://github.com/cursor/plugins/blob/ca782ed8b3c2c521cead8e1720d55c3a5dbf2347/pstack/skills/unslop/SKILL.md).
The original guide borrowed Modal's tone. The rules and Composio examples here
govern the house voice. Fix a sentence another way when a rule makes it harder
to understand.

## Choose the page's purpose

Give each page one primary purpose. Split and link when a section serves a
different reader task. Use the [structure guide](../../../../docs/agent-guidance/guides/page-structure.md)
and its templates for layout.

- Overviews and explanations establish why the feature matters to you, then
  explain how it works with a focused diagram. Add essential details and links
  to deeper pages. Use an example after the mechanism when it helps explain it.
- How-tos solve a specific task. State the outcome, give prerequisites, and
  show the shortest complete path with its expected result. Link background.
- Tutorials teach through a sequence of visible results. Say what you will
  build and what you should see after each step. Keep explanations brief and
  link conceptual or reference material.
- References describe the contract. Lead with scope, versions, fields, defaults,
  limits, and errors. Keep examples specific to the item being described.
  Link setup and procedures instead of turning the reference into a tutorial.

Keep choices and tradeoffs in explanations. Keep reference prose factual.
Decision records and changelogs use their own templates. An overview's why-first
order does not replace their decision-first or release-summary openings.

## Voice and sentence clarity

- Address the reader as "you" in the present tense. Name the app, agent, or end
  user when that actor is distinct from the reader.
- Say who does what. Use passive voice only when the actor is unknown or
  irrelevant.
- Write instructions as commands. Put conditions and warnings before the
  actions they govern. Show the common case before options and exceptions.
- Use one instruction per sentence and one thought per sentence. Review
  instructions longer than about 20 words and other sentences longer than
  about 25. Split for clarity, not to enforce a count. Vary sentence lengths.
- Make every "it", "they", and "this" refer to one clear thing. Repeat the noun
  when needed. Put "only" and "not" beside the word they modify.
- Keep articles and verbs. Break up long noun strings. Say which parts "and"
  or "or" joins when the sentence could be read two ways.
- Use one name per concept and one verb per action. Prefer "start" consistently
  over alternating between "start" and "initiate". Avoid ambiguous "-ing"
  constructions when a direct verb is clearer.
- Use short, familiar words and natural contractions. Cut filler, redundant
  hedges, vague intensifiers, and ceremonial transitions. Don't call a step
  "simple", "easy", or "quick". Show the steps and result.
- Explain through concrete behavior and examples. Avoid metaphors, analogies,
  idioms, figurative encouragement, and rhetorical question-and-answer hooks.
  Keep the tone friendly without praise, slogans, or promises about future work.

## Terminology

Use public Composio APIs and the terminology appropriate to the example.
Preserve exact identifiers and established product names. Define unfamiliar
terms when first needed. Don't invent names for existing concepts.

Use concrete descriptions, such as "A toolkit groups related tools for an app
or service" and "A connected account stores a user's authenticated connection
to a toolkit." Follow `docs/AGENTS.md` and the relevant product decisions for
catalog terminology. Generic nouns such as tool, toolkit, session, and connected
account stay lowercase unless a product name or identifier requires otherwise.

Name the mechanism or observable effect instead of using words such as
"seamlessly", "powerful", or "robust". A specific fact is more useful than a
claim that a feature is easy.

## Punctuation and formatting

- Use sentence case for authored headings, including reference headings.
  Preserve product names, acronyms, and identifiers. Make headings specific to
  the question or task. Avoid generic labels when a descriptive phrase fits.
- Use one page title and a heading hierarchy without skipped levels. Count
  headings supplied by the renderer, not just those in the Markdown source.
- Replace an em dash with a period or comma. Don't substitute an en dash,
  a hyphen used as a dash, or parentheses. Use colons to introduce lists or
  examples. Keep parentheses for grammatical parenthetical information.
- Use periods instead of semicolons. Use the Oxford comma and straight quotes.
  Spell out alternatives instead of using slashes in prose, and write the
  appropriate singular or plural instead of appending "(s)". Preserve syntax in
  code identifiers, paths, commands, URLs, and quoted source text.
- Backtick code identifiers, commands, parameters, paths, and filenames.
  Use bold for UI labels. Don't bold every concept or acronym.
- Use numbered lists for sequences, bullets for parallel items, and tables for
  lookup or comparison. Introduce a list with a complete sentence. Keep items
  parallel and paragraphs focused on one subject.
- Use descriptive link text. Cut decorative emojis, chatbot phrases, and
  generic conclusions. Finish with a specific next action when one is needed.

## Code examples and caveats

Task examples must include or clearly identify their setup, imports, identity,
and initialization. Show the smallest complete operation that serves the task.
Use public APIs and meaningful names. Don't replace required executable code
with ellipses while calling the example runnable.

Allow checked hidden setup and reference fragments when their context is
explicit. A signature is a contract, not a runnable program. Flag missing
context and misleading claims of runnability instead of requiring every fence
to stand alone. Follow [code example coverage](../../../../docs/agent-guidance/context/code-examples.md)
and [Twoslash guidance](../../../../docs/agent-guidance/context/twoslash.md)
for language parity, checking scope, and hidden setup.

Show the expected result beside the example. Use observed output when available.
Otherwise describe the expected shape or effect. Label illustrative data.
Comments explain non-obvious behavior. Commands intended for copying omit
shell prompts unless the block is explicitly a transcript.

Put warnings before the command or example that requires them. State the
condition and consequence. Keep permissions, cost, version, and support limits
beside the relevant claim or step. Use a callout when prominence helps, and
never hide a required caveat inside optional collapsed content.

## Repository exceptions and review scope

- Follow the repository formatter and language conventions for indentation.
  `.prettierrc` uses spaces. Do not adopt upstream's blanket tab indentation.
- Changelog entries begin their content headings at `h3` because the renderer
  supplies the page title and each entry's `h2`. Follow the
  [changelog guide](../../../../docs/agent-guidance/guides/changelog.md).
- Keep specialized records in their owning format. Use the decision-record
  template for decisions and the release template for changelogs.
- `good-docs-audit` reviews this writing standard. The docs correctness reviewer
  checks whether readers can complete the task without being misled. Its narrower
  scope does not waive this standard or turn every style finding into a blocker.

Before handing over prose, check its purpose, example context, warning placement,
sentence clarity, consistent names, and heading case. Preserve verified contracts
and caveats even when shortening a page.
