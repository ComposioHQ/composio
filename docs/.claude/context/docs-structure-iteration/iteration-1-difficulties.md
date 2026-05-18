# Iteration 1 difficulties

First review loop: Claude and Codex reviewed PR #3443 plus source context before implementation.

## Claude UX review difficulties

Claude's human/docs UX pass found these hard or confusing:

1. **`how-composio-works` contradicted sessions docs**
   - It said sessions were immutable and that users did not need to cache/manage session IDs.
   - `users-and-sessions` said sessions persist, should be reused with `composio.use()`, and can be updated.
   - Difficulty: an AI or human could not infer the correct session lifecycle.

2. **Main Tools page promoted legacy direct execution**
   - `tools-and-toolkits` linked to direct execution as a normal option.
   - Difficulty: the main Tools page sent users toward the path the quickstart labels deprecated.

3. **Homepage was still concept/catalog-first**
   - Large provider grid and feature card list appeared before a clear build path.
   - Difficulty: users saw a feature inventory instead of runnable code or next action.

4. **`Build with Composio` card was not a real destination**
   - It linked to `#get-started` on the same page.
   - Difficulty: user intent (“help me build”) was not honored.

5. **Users & Sessions opened with definitions before code**
   - The most important line, `composio.create(user_id)`, appeared after concept prose.
   - Difficulty: concept-first ordering weakened the sessions-first message.

6. **Legacy separator could not collapse**
   - `---Legacy---` was not a folder.
   - Difficulty: deprecated docs remained visually peer-level with current docs.

7. **Use Composio / plugin weighting was questionable**
   - Claude Code Plugin appeared as a top-level Use Composio entry.
   - Difficulty: a narrow integration looked as important as core SDK/MCP docs.

## Claude Modal-style review difficulties

The Modal-style reviewer was more skeptical of the PR's IA:

1. **Users were asked to self-classify too early**
   - “Use Composio” vs “Build with Composio” required understanding product categories before using the product.

2. **Sessions were too low in the sidebar**
   - If sessions are the core pattern, they should appear immediately after First Steps.

3. **Build with Composio was not actually task-first**
   - It contained an architecture overview and provider grid, not a build tutorial.

4. **MCP/clients were the wrong early audience for SDK builders**
   - Use/MCP/client docs above Sessions distracted from the primary builder path.

5. **`sessions-vs-direct-execution` was buried in Help**
   - Difficulty: the most important “which path should I use?” decision was hard to find.

## Codex AI-agent comprehension difficulties

Codex focused on whether an AI agent would infer the correct current API:

1. **Session lifecycle contradiction**
   - Same issue as Claude: immutable/no-cache vs persist/reuse/update.

2. **Legacy/direct execution too foregrounded**
   - Sidebar and Tools page made direct execution look current.

3. **Meta tool count mismatch**
   - Composio Connect said 7 meta tools, while core docs/reference showed 6. `WAIT_FOR_CONNECTIONS` needed to be either removed or documented as optional.

4. **Tool Router → Sessions bridge was missing**
   - Migration docs mentioned Tool Router graduating to sessions, but core docs did not make the new stable abstraction obvious.

5. **Auth pages leaked legacy/tool-router wording**
   - Some current Auth pages still said “tool-router session” or linked into direct-auth docs.

6. **Tools browsing page used direct APIs**
   - `composio.tools.get(...)` and `getRawComposioToolBySlug(...)` appeared inside the current Tools section.

## Codex mechanical audit difficulties

Codex's mechanical pass found the risky parts of fixing this:

1. **Moving legacy docs requires broad link updates**
   - Docs, changelog, cookbooks, reference, toolkit FAQs, redirects, and tests all linked to `/docs/tools-direct` or `/docs/auth-configuration`.

2. **Folder titles would be misleading after moving**
   - `tools-direct/meta.json` had title `Tools`; `auth-configuration/meta.json` had title `Authentication`.
   - Difficulty: inside Legacy, those titles would look like current primary sections unless renamed.

3. **Redirects needed wildcard preservation**
   - Modifier and legacy deep links needed `:path*` preserved.

4. **Static navigation tests did not understand external Markdown links**
   - The OAuth2 Guides external link in `meta.json` was valid Fumadocs syntax but failed the local test.
