# Changelog → Docs Updater

Analyzes new changelog entries and updates documentation to reflect the changes.

## When This Runs

Triggered when a changelog file (`docs/content/changelog/*.mdx`) is pushed to `next`. Creates a PR with suggested documentation updates.

## Process

1. Read each new/modified changelog file
2. Categorize the changes (breaking change, new feature, deprecation, bug fix, behavior change)
3. For each change, search `docs/content/docs/` for pages that reference the affected feature
4. Make targeted documentation updates

## What to Update

| Changelog Type | Docs Action |
|---|---|
| **Breaking change** (new API signature, removed parameter) | Update code examples in affected guides to use the new API |
| **New feature** (new parameter, new method, new option) | Add to the relevant existing guide where it fits naturally |
| **Deprecation** | Add a `<Callout type="warn">` note near the deprecated usage |
| **Behavior change** (default changed, response format changed) | Update descriptions and examples that reference the old behavior |
| **Toolkit changes** (new toolkit, toolkit deprecation, credential removal, toolkit-level config) | No docs changes needed (toolkit pages are auto-generated) |
| **Bug fix** (no API change) | No docs changes needed |
| **Performance improvement** | No docs changes needed |
| **Infrastructure / internal changes** | No docs changes needed |

## Rules

- Only modify files in `docs/content/docs/` and `docs/content/cookbooks/`
- Do NOT create new pages — only update existing ones
- Do NOT add changelog-style content ("as of v0.6.0...") to docs. Docs should describe current behavior.
- Do NOT make cosmetic or stylistic changes unrelated to the changelog
- Follow existing patterns in the docs (Tabs for Python/TypeScript, `<Callout>` for warnings)
- TypeScript code blocks in MDX are type-checked at build time. Add proper imports above `// ---cut---` lines. See `docs/.claude/context/twoslash.md` for details.
- If no documentation changes are needed, make no file changes

## Key Docs Pages

These are the most commonly affected pages. Search broadly, but start here:

| Topic | Docs Page |
|---|---|
| Sessions API | `configuring-sessions.mdx` |
| Authentication | `authentication.mdx`, `authenticating-users/` |
| Tools & toolkits | `tools-and-toolkits.mdx`, `tools-direct/` |
| Triggers & webhooks | `triggers.mdx`, `webhook-verification.mdx`, `setting-up-triggers/` |
| Connected accounts | `managing-multiple-connected-accounts.mdx`, `auth-configuration/connected-accounts.mdx` |
| Auth configs | `using-custom-auth-configuration.mdx`, `auth-configuration/` |
| White labeling | `white-labeling-authentication.mdx` |
| Migration | `migration-guide/` |
| SDK quickstart | `quickstart.mdx` |
| Providers | `providers/` |
