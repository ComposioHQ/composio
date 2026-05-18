# Mechanical / docs-file audit brief for PR #3443

## Bottom line
The current hierarchy is mechanically close, but the `Legacy` section is still a non-collapsible separator, not a folder, so it cannot collapse. The safe fix is to move legacy/direct docs under `docs/content/docs/legacy/`, update root nav to reference `legacy`, then sweep internal links + redirects.

I did **not** edit files.

## Key findings

### 1) `Legacy` is not a collapsible folder yet
- `docs/content/docs/meta.json:60-64` uses a separator plus direct entries:
  - `"---Legacy---"`
  - `"single-toolkit-mcp"`
  - `"proxy-execute"`
  - `"tools-direct"`
  - `"auth-configuration"`
- Because this is a separator, it will render as a flat section, not a collapsible folder.

### 2) Some existing subfolder `meta.json` files are currently bypassed
These folders already have `meta.json`, but root `meta.json` references child pages directly, so the folder title/default-open behavior is not used:
- `toolkits/meta.json` exists, but root uses `toolkits/fetching-tools-and-toolkits`, `toolkits/enable-and-disable-toolkits`, `toolkits/custom-tools-and-toolkits` (`docs/content/docs/meta.json:31-36`)
- `setting-up-triggers/meta.json` exists, but root uses `setting-up-triggers/*` children directly (`docs/content/docs/meta.json:38-43`)
- `observability/meta.json` exists, but root uses `observability/logs` and `observability/usage` directly (`docs/content/docs/meta.json:45-49`)

This is only a problem if collapsible subfolders are desired. For this PR, `legacy` is the important one.

### 3) Stale comments in docs layout
`docs/app/(home)/docs/layout.tsx` still talks about “Get Started” even though the section is now “First Steps”:
- line 3: `// Insert changelog into page tree after Get Started section`
- line 9: `// Find next separator after Get Started...`
- line 13: `// If we can't find proper insertion point...`
- actual lookup is `c.name === 'First Steps'` on lines 6-8

### 4) Title mismatch on Composio Connect page
`docs/content/docs/composio-connect.mdx:1-13`
- frontmatter title is `MCP`
- page body immediately explains **Composio Connect**

This is mechanically inconsistent with the nav slug and reviewer note. Title should bridge product name, e.g. `Composio Connect` or `Composio Connect (MCP)`.

### 5) Legacy folder titles will be misleading if moved as-is
If `auth-configuration/` and `tools-direct/` are moved under `legacy/` without renaming their folder titles:
- `docs/content/docs/auth-configuration/meta.json:2` title is `Authentication`
- `docs/content/docs/tools-direct/meta.json:2` title is `Tools`

Inside `Legacy`, those labels will look current/primary and duplicate the live `Auth` / `Tools` sections. They should be renamed during the move (e.g. `Auth configuration (legacy)` and `Direct tool execution`).

### 6) One redirect is now semantically stale
`docs/next.config.mjs:623-627`
- `/docs/authenticating-users` currently redirects to `/docs/tools-direct/authenticating-tools`
- that destination is a direct/legacy page, while `authenticating-users/` is now a current sessions-first docs folder

Even before a move, this is semantically wrong. After the legacy move it should not keep pointing at the current path.

## Exact move plan

### A. Move these docs into `docs/content/docs/legacy/`
1. `docs/content/docs/single-toolkit-mcp.mdx`
   -> `docs/content/docs/legacy/single-toolkit-mcp.mdx`
2. `docs/content/docs/proxy-execute.mdx`
   -> `docs/content/docs/legacy/proxy-execute.mdx`
3. `docs/content/docs/tools-direct/`
   -> `docs/content/docs/legacy/tools-direct/`
4. `docs/content/docs/auth-configuration/`
   -> `docs/content/docs/legacy/auth-configuration/`

### B. Add a real legacy folder meta
Create `docs/content/docs/legacy/meta.json` with:
- title `Legacy`
- `defaultOpen: false`
- pages in this order:
  - `single-toolkit-mcp`
  - `proxy-execute`
  - `tools-direct`
  - `auth-configuration`

### C. Update root nav
In `docs/content/docs/meta.json`:
- replace lines `60-64` with a single `"legacy"` entry
- remove the `"---Legacy---"` separator

### D. Rename moved folder titles so they read correctly under Legacy
After the move:
- `legacy/tools-direct/meta.json` title should become `Direct tool execution`
- `legacy/auth-configuration/meta.json` title should become `Auth configuration` or `Auth configuration (legacy)`

## Exact link update plan

## 1) Direct path-prefix swaps required after the move
These path families should move to the new legacy namespace:
- `/docs/single-toolkit-mcp` -> `/docs/legacy/single-toolkit-mcp`
- `/docs/proxy-execute` -> `/docs/legacy/proxy-execute`
- `/docs/tools-direct/...` -> `/docs/legacy/tools-direct/...`
- `/docs/auth-configuration/...` -> `/docs/legacy/auth-configuration/...`

## 2) Current docs that should be updated to point directly at legacy pages
Do **not** rely only on redirects for these user-facing docs pages.

### Must update in `docs/content/docs/`
- `authenticating-users/manually-authenticating.mdx:13`
- `authenticating-users/shared-connections.mdx:432`
- `common-faq.mdx:12,14,96,109,147,153,188,228,266`
- `glossary.mdx:43,63,115`
- `importing-existing-connections.mdx:25,82,336`
- `managing-multiple-connected-accounts.mdx:187`
- `migration-guide/new-sdk.mdx:470,514,564,712,728,827`
- `migration-guide/tool-router-beta.mdx:69`
- `migration-guide/toolkit-versioning.mdx:162`
- `sessions-vs-direct-execution.mdx:19,179,190`
- `setting-up-triggers/creating-triggers.mdx:233`
- `tools-and-toolkits.mdx:71,102`
- `troubleshooting/authentication.mdx:28`
- `troubleshooting/mcp.mdx:16`
- `troubleshooting/tools.mdx:35`
- `workbench.mdx:10`
- `cli.mdx:373`

### Also update non-docs content that links into these pages
- `docs/content/changelog/04-23-26-file-upload-security.mdx`
- `docs/content/changelog/04-24-26-legacy-auto-upload-config-removal.mdx`
- `docs/content/changelog/11-10-25.mdx`
- `docs/content/changelog/12-03-25.mdx`
- `docs/content/changelog/12-09-25.mdx`
- `docs/content/changelog/12-10-25.mdx`
- `docs/content/cookbooks/app-connections-dashboard.mdx`
- `docs/content/reference/sdk-reference/python/composio.mdx`
- `docs/content/reference/sdk-reference/python/index.mdx`
- `docs/content/reference/sdk-reference/typescript/composio.mdx`
- `docs/content/toolkits/faq/gmail.md`
- `docs/content/toolkits/faq/google_classroom.md`
- `docs/content/toolkits/faq/google_maps.md`
- `docs/content/toolkits/faq/googlecalendar.md`
- `docs/content/toolkits/faq/googledocs.md`
- `docs/content/toolkits/faq/googledrive.md`
- `docs/content/toolkits/faq/googlemeet.md`
- `docs/content/toolkits/faq/googlesheets.md`
- `docs/content/toolkits/faq/googleslides.md`
- `docs/content/toolkits/faq/googlesuper.md`
- `docs/content/toolkits/faq/googletasks.md`

## 3) Links that should be semantically retargeted to current pages instead of legacy pages
These should not keep pointing at `auth-configuration/*` after the move:
- `docs/content/docs/sessions-vs-direct-execution.mdx:24`
  - `/docs/auth-configuration/custom-auth-configs`
  - should point to `/docs/using-custom-auth-configuration`
- `docs/content/docs/common-faq.mdx:129`
  - `/docs/auth-configuration/custom-auth-configs`
  - should point to `/docs/using-custom-auth-configuration`
- `docs/content/docs/glossary.mdx:11`
  - `/docs/auth-configuration/custom-auth-configs`
  - should point to `/docs/using-custom-auth-configuration`
- `docs/content/docs/custom-app-vs-managed-app.mdx:149`
  - card currently points to `/docs/auth-configuration/custom-auth-configs`
  - should point to `/docs/using-custom-auth-configuration`

Everything else that is intentionally about direct execution / low-level auth config APIs can move to `/docs/legacy/...`.

## Redirect / test update plan

### Update redirect destinations in `docs/next.config.mjs`
Anything that currently redirects to moved legacy docs should redirect to the new legacy path.
At minimum, update the destinations in these blocks:
- `260-272` (`mcp-*` redirects)
- `274-304` (`tools-direct` redirects)
- `305-324` (`auth-configuration` redirects)
- `355-371`, `398-399`, `468-479`, `640-681` (other old aliases targeting those pages)

### Specific redirect that should be reconsidered, not just path-swapped
- `623-627`: `/docs/authenticating-users`
  - current destination is direct-tool auth
  - better target after cleanup: `/docs/authentication` or the first current child page, not legacy direct auth

### Update redirect integration test expectations
`docs/tests/integration/redirects.test.ts:18-23`
- `/docs/fetching-tools` expected destination should become `/docs/legacy/tools-direct/fetching-tools`
- `/docs/custom-tools` expected destination should become `/docs/legacy/tools-direct/custom-tools`
- `/docs/mcp-quickstart` expected destination should become `/docs/legacy/single-toolkit-mcp`

## Recommended minimal execution order
1. Move files/folders into `docs/content/docs/legacy/`
2. Add `legacy/meta.json`
3. Replace root `Legacy` separator with `"legacy"`
4. Rename moved folder titles (`Tools` / `Authentication`) to legacy-specific labels
5. Fix internal doc links in current docs first
6. Fix redirects in `docs/next.config.mjs`
7. Update redirect tests
8. Fix stale layout comments + Composio Connect title

## Optional / defer
If the team wants more collapsible hierarchy later, root `meta.json` can also switch these child-path groups to folder entries:
- `toolkits`
- `setting-up-triggers`
- `observability`

That is not required to fix the current `Legacy` problem.