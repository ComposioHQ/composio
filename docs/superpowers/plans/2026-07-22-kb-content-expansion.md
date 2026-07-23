# Knowledge Base Content Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit all canonical public support knowledge and add a first batch of 15–20 verified, web-native KB articles without merging, deploying, synchronizing repositories, or publishing stale claims.

**Architecture:** A read-only audit tool inventories the local `support-workflows` snapshot and produces nonpublic review artifacts. The KB manifest moves to explicit source references so one web article can select and combine multiple public sections while retaining exact provenance. Existing generation, search, sitemap, and browse pipelines consume the expanded manifest without a second runtime content system.

**Tech Stack:** Bun, TypeScript, Markdown/MDX, Fumadocs, Next.js 16, existing unified Algolia record generation, Bun test.

## Global Constraints

- Work only on `codex/public-kb-docs`; do not merge, push, deploy, or mutate production Algolia.
- Read canonical knowledge from the local `ComposioHQ/support-workflows` snapshot at commit `5eed614`.
- Never read or copy `private.md`, customer files, internal workflows, raw ticket exports, or private provenance into public artifacts.
- Do not add automatic repository synchronization; the audit command requires an explicit local source path.
- Keep `support-workflows` canonical and the Composio repo responsible only for audit artifacts, pinned public source snapshots, publication metadata, generated pages, and search.
- Publish only `evergreen` content with a 180-day review window or `time-sensitive` content with a 90-day review window.
- Use “Composio For You”; never publish the deprecated “Rube” product name.
- Existing Docs, OAuth, reference, toolkit, example, and changelog pages remain canonical; classify equivalent support content as `link-only`.

---

### Task 1: Build the read-only section inventory and audit renderer

**Files:**
- Create: `docs/lib/kb/audit.ts`
- Create: `docs/scripts/audit-kb-sections.ts`
- Create: `docs/tests/static/kb-audit.test.ts`
- Modify: `docs/package.json`

**Interfaces:**
- Consumes: an explicit filesystem path to a local `support-workflows` checkout.
- Produces: `inventoryPublicKb(sourceRoot: string): KbAuditInventory`, `renderAuditCsv(rows: KbAuditRow[]): string`, and `renderAuditMarkdown(inventory: KbAuditInventory, rows: KbAuditRow[]): string`.
- `KbAuditInventory` reports `fileCount`, `levelTwoSectionCount`, `bodyOnlyFileCount`, and ordered public candidates.
- The inventory never opens a file whose basename is not `public.md`.

- [ ] **Step 1: Write the failing audit fixture test**

Create a temporary fixture with one `kb/platform/example/public.md`, one body-only public page, and neighboring `private.md` files. Assert:

```ts
const inventory = inventoryPublicKb(root);
expect(inventory.fileCount).toBe(2);
expect(inventory.levelTwoSectionCount).toBe(2);
expect(inventory.bodyOnlyFileCount).toBe(1);
expect(inventory.candidates.map((item) => item.heading)).toEqual([
  'First answer',
  'Second answer',
  null,
]);
expect(JSON.stringify(inventory)).not.toContain('private-only phrase');
```

Also assert stable IDs use `source-path#normalized-heading`, CSV values are correctly quoted, and the Markdown summary reports state counts.

- [ ] **Step 2: Run the audit test and verify RED**

Run: `bun test tests/static/kb-audit.test.ts`

Expected: FAIL because `@/lib/kb/audit` does not exist.

- [ ] **Step 3: Implement the inventory types and public-only walker**

Define:

```ts
export type KbAuditState = 'publish' | 'link-only' | 'needs-verification' | 'exclude';

export interface KbAuditCandidate {
  id: string;
  sourcePath: string;
  sourceTitle: string;
  heading: string | null;
  body: string;
  category: string;
  tags: string[];
}

export interface KbAuditRow extends KbAuditCandidate {
  proposedTitle: string;
  state: KbAuditState;
  reason: string;
  existingUrl: string;
  freshness: '' | 'evergreen' | 'time-sensitive';
  verificationSource: string;
  supportSignal: string;
  priorityScore: number;
}

export interface KbAuditInventory {
  fileCount: number;
  levelTwoSectionCount: number;
  bodyOnlyFileCount: number;
  candidates: KbAuditCandidate[];
}
```

Use `parsePublicKbDocument()` for metadata validation. Extract every `##` section. For a file with no `##`, create one candidate with `heading: null`. Sort by `sourcePath`, then source order.

- [ ] **Step 4: Implement deterministic CSV and Markdown output**

CSV columns must be exactly:

```ts
const AUDIT_COLUMNS = [
  'source_paths',
  'source_headings',
  'proposed_title',
  'state',
  'reason',
  'existing_url',
  'freshness',
  'verification_source',
  'support_signal',
  'priority_score',
] as const;
```

The Markdown report must state the source commit, 115-file/670-section totals, classification counts, selected first batch, risk themes, and noncanonical archive findings.

- [ ] **Step 5: Add an explicit-source CLI**

The CLI accepts:

```text
bun scripts/audit-kb-sections.ts \
  --source-root /absolute/path/to/support-workflows \
  --decisions kb/audits/2026-07-22-decisions.json \
  --output-dir kb/audits
```

It must reject a missing or relative `--source-root`, reject a checkout whose `git rev-parse HEAD` is not `5eed614`, and never modify the source checkout. Add:

```json
"audit:kb": "bun scripts/audit-kb-sections.ts"
```

to `package.json`.

- [ ] **Step 6: Run focused tests**

Run: `bun test tests/static/kb-audit.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the audit engine**

```bash
git add docs/lib/kb/audit.ts docs/scripts/audit-kb-sections.ts docs/tests/static/kb-audit.test.ts docs/package.json
git commit -m "feat(docs): add public KB content audit"
```

---

### Task 2: Add multi-section provenance to the publication manifest

**Files:**
- Modify: `docs/lib/kb/types.ts`
- Modify: `docs/lib/kb/source-document.ts`
- Modify: `docs/lib/kb/catalog.ts`
- Modify: `docs/lib/kb/generate.ts`
- Modify: `docs/kb/manifest.json`
- Modify: `docs/tests/static/kb-catalog.test.ts`
- Modify: `docs/tests/static/kb-generation.test.ts`

**Interfaces:**
- Produces `KbSourceReference { sourcePath: string; sourceHeading: string | null }`.
- `KbGuideDefinition.sources` replaces singular `sourcePath` and `sourceHeading`.
- `extractGuideSections(document, references)` returns a focused body assembled from one or more exact public sections.
- Manifest schema becomes version `2`.

- [ ] **Step 1: Write failing provenance tests**

Update the catalog fixture to use:

```ts
sources: [
  { sourcePath: 'kb/platform/example/public.md', sourceHeading: 'Stable answer' },
  { sourcePath: 'kb/platform/example/public.md', sourceHeading: 'Second answer' },
],
```

Assert the assembled body is:

```md
## Stable answer

This is safe public guidance.

## Second answer

This is the second safe answer.
```

Add tests rejecting an empty `sources` array, a missing heading, a nonpublic source, and a private marker in any referenced public document.

- [ ] **Step 2: Run catalog and generation tests and verify RED**

Run: `bun test tests/static/kb-catalog.test.ts tests/static/kb-generation.test.ts`

Expected: FAIL because the manifest supports only one source reference.

- [ ] **Step 3: Add the version-2 source-reference contract**

Use:

```ts
export interface KbSourceReference {
  sourcePath: string;
  sourceHeading: string | null;
}

export interface KbGuideDefinition {
  slug: string;
  title: string;
  description: string;
  sources: KbSourceReference[];
  topics: string[];
  tags: string[];
  aliases: string[];
  relatedGuides: string[];
  externalResources: string[];
  updatedAt: string;
  lastVerifiedAt: string | null;
  reviewAfter: string | null;
  freshness: KbFreshness;
  state: KbPublicationState;
  featured: boolean;
}

export interface KbManifest {
  schemaVersion: 2;
  // existing source, topics, and guides fields
}
```

- [ ] **Step 4: Assemble one or more public sections**

Keep `extractGuideBody(document, heading)` for one reference. Add `extractGuideSections()` that includes section headings only when a guide has multiple references and joins sections with two newlines. `sourceHeading: null` selects the whole body only for a source document with no level-two headings; reject null on a document containing `##` sections so provenance cannot accidentally widen.

- [ ] **Step 5: Validate every referenced source before publication**

In `buildKbCatalog`, cache parsed documents by path, require at least one source, verify `visibility: public`, apply every existing private-marker check to every referenced document, and build `sourceMetadata` as an array aligned with `sources`.

- [ ] **Step 6: Migrate all existing manifest entries**

Change each existing guide from:

```json
"sourcePath": "kb/platform/pagination/public.md",
"sourceHeading": "Pagination limits are endpoint-specific"
```

to:

```json
"sources": [
  {
    "sourcePath": "kb/platform/pagination/public.md",
    "sourceHeading": "Pagination limits are endpoint-specific"
  }
]
```

Set `schemaVersion` to `2`.

- [ ] **Step 7: Emit exact provenance in generated frontmatter**

Replace singular source fields with:

```ts
`sources: ${JSON.stringify(guide.sources)}`,
```

Keep `sourceCommit`, `lastVerifiedAt`, `reviewAfter`, `freshness`, topics, aliases, and related resources unchanged.

- [ ] **Step 8: Run focused tests**

Run: `bun test tests/static/kb-catalog.test.ts tests/static/kb-generation.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the provenance migration**

```bash
git add docs/lib/kb docs/kb/manifest.json docs/tests/static/kb-catalog.test.ts docs/tests/static/kb-generation.test.ts
git commit -m "refactor(docs): support multi-section KB provenance"
```

---

### Task 3: Produce the complete 115-file content audit

**Files:**
- Create: `docs/kb/audits/2026-07-22-decisions.json`
- Create: `docs/kb/audits/2026-07-22-section-audit.csv`
- Create: `docs/kb/audits/2026-07-22-content-gap-audit.md`
- Modify: `docs/tests/static/kb-audit.test.ts`

**Interfaces:**
- Consumes the audit engine and explicit editorial overrides keyed by stable candidate ID.
- Produces one classified row per 670 level-two sections plus four body-only files.

- [ ] **Step 1: Add failing real-inventory assertions**

Gate the real local fixture behind the known workspace path and assert:

```ts
expect(inventory.fileCount).toBe(115);
expect(inventory.levelTwoSectionCount).toBe(670);
expect(inventory.bodyOnlyFileCount).toBe(4);
```

Also parse the generated CSV and assert every row has one allowed state and a nonempty reason.

- [ ] **Step 2: Run the real-inventory test and verify RED**

Run: `bun test tests/static/kb-audit.test.ts`

Expected: FAIL because the decisions and generated audit artifacts do not exist.

- [ ] **Step 3: Create deterministic baseline decisions**

Apply these rules in order:

1. Exact sections already published in the pilot are `publish` with their current canonical KB URL.
2. Sections under `kb/incidents/` are `exclude` with reason `Resolved incident guidance remains on the status/archive surface.`
3. Explicit deduplication overrides are `link-only` with a working Docs, OAuth, reference, or toolkit URL.
4. First-batch sections are `publish` only after Tasks 4 and 5 record successful verification.
5. Every remaining public section is `needs-verification` with reason `Not selected for first-batch verification; compare this public support claim with current authoritative product or provider sources before publishing.`

The decisions JSON stores only overrides; the CLI supplies rules 2 and 5 so it stays reviewable.

- [ ] **Step 4: Record noncanonical archive findings**

The Markdown report must state:

- `platform/compliance-data-handling`, Google Classroom, Google Tasks, Kommo, and Linear exist only in `public-kb` relative to current canonical public pages and require canonical proposals plus verification.
- `routing` is internal and excluded.
- `toolkits/rube` is obsolete naming and excluded; any durable consumer fact must be rewritten for Composio For You in canonical support knowledge.
- `README` and `index` are navigation, not article candidates.

- [ ] **Step 5: Generate the initial audit artifacts**

Run:

```bash
bun run audit:kb -- \
  --source-root /Users/sohambasu/Documents/composio/support/kb-exploration/support-workflows \
  --decisions kb/audits/2026-07-22-decisions.json \
  --output-dir kb/audits
```

Expected summary: `115 public files, 670 level-two sections, 4 body-only candidates`.

- [ ] **Step 6: Validate privacy and classification completeness**

Run:

```bash
bun test tests/static/kb-audit.test.ts
rg -n "T-[0-9]{2,}|app\.plain\.com|slack\.com/archives|linear\.app/composio|/Users/" kb/audits
```

Expected: tests PASS and `rg` returns no matches. The absolute source path must not be written into either artifact.

- [ ] **Step 7: Commit the audit baseline**

```bash
git add docs/kb/audits docs/tests/static/kb-audit.test.ts
git commit -m "docs: audit canonical public support knowledge"
```

---

### Task 4: Verify and publish eight cross-cutting articles

**Files:**
- Create pinned source copies under:
  - `docs/kb/source/kb/mcp/tool-router-sessions/public.md`
  - `docs/kb/source/kb/platform/project-api-key-permissions/public.md`
  - `docs/kb/source/kb/platform/file-storage/public.md`
  - `docs/kb/source/kb/sdk/tool-execution-retries/public.md`
  - `docs/kb/source/kb/consumer/project-boundaries-and-auth-selection/public.md`
- Modify: `docs/kb/manifest.json`
- Modify: `docs/kb/audits/2026-07-22-decisions.json`
- Modify: `docs/kb/audits/2026-07-22-section-audit.csv`
- Modify: `docs/kb/audits/2026-07-22-content-gap-audit.md`
- Modify: `docs/tests/static/kb-catalog.test.ts`
- Modify: `docs/tests/static/kb-generation.test.ts`

**Interfaces:**
- Adds eight flat `/kb/guide/<slug>` pages backed only by exact public source references.
- Verification evidence is recorded in the audit, not in hidden page content.

- [ ] **Step 1: Add failing slug and freshness tests**

Assert the published catalog contains:

```ts
const crossCuttingSlugs = [
  'tool-router-sessions-do-not-expire',
  'choose-tool-router-connected-accounts',
  'tool-router-session-creation-requires-sessions-write-access',
  'tool-execution-requires-write-access',
  'composio-file-download-urls-are-short-lived',
  'tool-execution-retries-can-repeat-writes',
  'rotate-your-composio-for-you-consumer-key',
  'composio-for-you-connections-are-personal-to-members',
];
```

For each, require valid `lastVerifiedAt`, `reviewAfter`, `time-sensitive`, at least one product area, and a generated flat page.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test tests/static/kb-catalog.test.ts tests/static/kb-generation.test.ts`

Expected: FAIL because the eight manifest entries are absent.

- [ ] **Step 3: Verify Tool Router and permission claims**

Check current Composio Docs, local SDK/API schemas, and current production schemas for:

- session lifetime and deletion;
- user/entity ownership and live versus pinned `connectedAccounts` selection;
- Sessions write permission for session creation;
- Tool execution write permission for tool calls.

Record the canonical URLs or exact schema paths in the audit. If a claim conflicts, keep it `needs-verification` and promote the next fallback from Task 6 instead of weakening the gate.

- [ ] **Step 4: Verify file, retry, and Composio For You claims**

Confirm current file-download TTL behavior, retry semantics for non-idempotent actions, Connect consumer-key rotation UI, and per-member For You connection ownership from current official docs, schemas, or product code. Record evidence and assign a 90-day review window.

- [ ] **Step 5: Add exact source references and site-oriented metadata**

Use multiple references for the account-selection article:

```json
"sources": [
  {
    "sourcePath": "kb/mcp/tool-router-sessions/public.md",
    "sourceHeading": "Select among multiple accounts with an alias or account ID"
  },
  {
    "sourcePath": "kb/mcp/tool-router-sessions/public.md",
    "sourceHeading": "The session user must match the connected-account user"
  },
  {
    "sourcePath": "kb/mcp/tool-router-sessions/public.md",
    "sourceHeading": "Connected-account selection is live unless pinned"
  }
]
```

Use answer-oriented titles and descriptions. Map articles to the existing stable product areas and `composio-for-you` where appropriate.

- [ ] **Step 6: Rebuild audit artifacts and generated pages**

Run `bun run audit:kb` with the explicit source path, then `bun run generate:kb`.

Expected: all eight selected rows are `publish`, and eight new MDX routes exist.

- [ ] **Step 7: Run focused tests**

Run:

```bash
bun test tests/static/kb-catalog.test.ts tests/static/kb-generation.test.ts tests/static/knowledge-browse.test.tsx
```

Expected: PASS, including visible Composio For You browse content.

- [ ] **Step 8: Commit the cross-cutting batch**

```bash
git add docs/kb docs/content/kb docs/tests/static
git commit -m "docs(kb): add cross-cutting support answers"
```

---

### Task 5: Verify and publish ten high-value toolkit articles

**Files:**
- Create pinned public source copies for Gmail, GitHub, Slackbot, Outlook, Shopify, Jira, Google Calendar, WhatsApp, and Salesforce under `docs/kb/source/kb/toolkits/`.
- Modify: `docs/kb/manifest.json`
- Modify: `docs/kb/audits/2026-07-22-decisions.json`
- Modify: `docs/kb/audits/2026-07-22-section-audit.csv`
- Modify: `docs/kb/audits/2026-07-22-content-gap-audit.md`
- Modify: `docs/tests/static/kb-catalog.test.ts`
- Modify: `docs/tests/static/kb-generation.test.ts`
- Modify: `docs/tests/static/knowledge-browse.test.tsx`

**Interfaces:**
- Adds ten focused toolkit troubleshooting pages.
- Every provider fact is checked against current official provider documentation; every Composio field, action, or behavior is checked against current Composio schemas or code.

- [ ] **Step 1: Add failing toolkit-batch tests**

Assert these slugs are published and appear on the corresponding `/kb/toolkit/<slug>` aggregation:

```ts
const toolkitSlugs = [
  'upload-gmail-attachments-before-mcp-tool-execution',
  'gmail-label-operations-require-label-ids',
  'github-managed-oauth-tokens-are-redacted',
  'choose-slack-or-slackbot-for-the-right-token-type',
  'use-the-mailbox-address-for-outlook-shared-mailboxes',
  'shopify-subdomain-is-the-store-name-only',
  'jira-pagination-must-keep-the-original-jql',
  'google-calendar-uses-primary-not-me',
  'whatsapp-connections-require-a-waba-id',
  'fix-salesforce-url-not-reset-with-the-correct-subdomain',
];
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test tests/static/kb-catalog.test.ts tests/static/kb-generation.test.ts tests/static/knowledge-browse.test.tsx`

Expected: FAIL because the ten entries are absent.

- [ ] **Step 3: Verify Gmail, GitHub, Slack, and Outlook**

Use only current official sources:

- Gmail API label documentation plus current Composio Gmail schemas for label IDs and attachment inputs;
- the current Composio credential-redaction changelog/docs for masked GitHub managed-OAuth tokens;
- current Slack and Slackbot toolkit auth metadata for user-token versus bot-token behavior;
- Microsoft Graph shared-mailbox addressing plus the current Outlook action schema for the mailbox target.

Record each URL/schema path and the verification date in the audit.

- [ ] **Step 4: Verify Shopify, Jira, Calendar, WhatsApp, and Salesforce**

Use official provider documentation and current toolkit schemas to confirm:

- Shopify expects only the store-name subdomain value;
- Jira pagination must retain its original JQL or filters;
- Google Calendar accepts `primary` and not Gmail-style `me` as calendar ID;
- WhatsApp Business connection flows require WABA ID and map it to current Composio auth fields;
- Salesforce `URL_NOT_RESET` and login routing depend on the configured My Domain/subdomain.

Classify stable provider semantics as `evergreen`; classify Composio field names, actions, and auth-flow details as `time-sensitive`.

- [ ] **Step 5: Add source references and editorial page boundaries**

Combine only sections that answer the same question. For example, the WhatsApp page uses:

```json
"sources": [
  {
    "sourcePath": "kb/toolkits/whatsapp/public.md",
    "sourceHeading": "WABA ID is required for WhatsApp connections"
  },
  {
    "sourcePath": "kb/toolkits/whatsapp/public.md",
    "sourceHeading": "WhatsApp API key auth needs both system user token and WABA ID"
  },
  {
    "sourcePath": "kb/toolkits/whatsapp/public.md",
    "sourceHeading": "WhatsApp OAuth2 initiation still requires `generic_id` as the WABA ID"
  }
]
```

The Gmail attachment page combines its upload and timeout sections; all other listed pages use one to three exact references from one canonical public file.

- [ ] **Step 6: Rebuild audit artifacts and generated pages**

Run the explicit `audit:kb` command and `bun run generate:kb`.

Expected: ten new toolkit rows are `publish`, no toolkit contributes more than two first-batch articles, and every generated page has one canonical URL.

- [ ] **Step 7: Run focused tests**

Run:

```bash
bun test tests/static/kb-catalog.test.ts tests/static/kb-generation.test.ts tests/static/knowledge-browse.test.tsx tests/static/knowledge-corpus.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the toolkit batch**

```bash
git add docs/kb docs/content/kb docs/tests/static
git commit -m "docs(kb): add high-value toolkit answers"
```

---

### Task 6: Resolve the held pagination claim and fill any failed verification slots

**Files:**
- Modify: `docs/kb/manifest.json`
- Modify: `docs/kb/audits/2026-07-22-decisions.json`
- Modify: `docs/kb/audits/2026-07-22-section-audit.csv`
- Modify: `docs/kb/audits/2026-07-22-content-gap-audit.md`
- Modify: selected pinned public source files only if a fallback is promoted.
- Modify: `docs/tests/static/kb-catalog.test.ts`

**Interfaces:**
- Guarantees a final new-article batch between 15 and 20 pages.
- Leaves the auth-config pagination guide either published with evidence or explicitly held.

- [ ] **Step 1: Add a failing held-guide resolution test**

Assert the auth-config pagination definition satisfies exactly one branch:

```ts
if (guide.state === 'published') {
  expect(guide.lastVerifiedAt).not.toBeNull();
  expect(guide.reviewAfter).not.toBeNull();
} else {
  expect(guide.state).toBe('needs-review');
  expect(auditRow.state).toBe('needs-verification');
  expect(auditRow.reason.length).toBeGreaterThan(20);
}
```

- [ ] **Step 2: Verify the live auth-config pagination behavior**

Compare current v3 and v3.1 OpenAPI schemas, official reference pages, and a read-only production request if credentials are already available. Confirm both the maximum page size and `next_cursor` behavior. Do not request credentials or mutate production solely for this check.

- [ ] **Step 3: Publish or retain the hold**

If all authoritative evidence agrees on the 50-item maximum, publish `auth-config-list-pages-return-at-most-50-items` with a 90-day window. Otherwise keep it held and record the exact schema/runtime discrepancy in the nonpublic audit.

- [ ] **Step 4: Promote deterministic fallbacks if fewer than 15 new pages passed**

Verify and promote candidates in this order until the batch reaches 15:

1. `hubspot-oauth-token-fetch-400-check-secret-and-scopes`
2. `outlook-admin-consent-may-be-required`
3. `shopify-order-history-needs-read-all-orders`
4. `github-v2-triggers-create-the-webhook-for-you`
5. `google-sheets-tools-often-require-the-spreadsheet-id`

Apply the same source, deduplication, verification, freshness, and test gates as Tasks 4 and 5.

- [ ] **Step 5: Rebuild and run focused tests**

Run:

```bash
bun run audit:kb -- --source-root /Users/sohambasu/Documents/composio/support/kb-exploration/support-workflows --decisions kb/audits/2026-07-22-decisions.json --output-dir kb/audits
bun run generate:kb
bun test tests/static/kb-audit.test.ts tests/static/kb-catalog.test.ts tests/static/kb-generation.test.ts
```

Expected: PASS and the report states a first batch of 15–20 newly published pages.

- [ ] **Step 6: Commit the resolved batch**

```bash
git add docs/kb docs/content/kb docs/tests/static
git commit -m "docs(kb): finalize reviewed content batch"
```

---

### Task 7: Verify discovery, search quality, privacy, and production build

**Files:**
- Modify: `docs/tests/static/kb-discovery.test.ts`
- Modify: `docs/tests/static/knowledge-corpus.test.ts`
- Modify: `docs/tests/static/knowledge-search.test.ts`
- Modify: `docs/tests/static/knowledge-browse.test.tsx`

**Interfaces:**
- Confirms new KB pages flow through existing normalized search, sitemap, LLM, topic, and toolkit discovery without special-case route lists.

- [ ] **Step 1: Add representative discovery assertions**

Assert:

- all new published slugs have flat `/kb/guide/<slug>` discovery paths;
- held and excluded audit candidates have no route or KB search record;
- Gmail, GitHub, Slack, Outlook, Shopify, Jira, Google Calendar, WhatsApp, and Salesforce toolkit pages include their new KB links;
- Composio For You appears as a browse area after its two articles exist;
- exact error queries such as `URL_NOT_RESET` and `Invalid API key Sessions write` rank the new KB answer ahead of generic docs;
- no generated/searchable record contains the deprecated product name.

- [ ] **Step 2: Run the affected suite**

Run:

```bash
bun test tests/static/kb-discovery.test.ts tests/static/knowledge-corpus.test.ts tests/static/knowledge-search.test.ts tests/static/knowledge-browse.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run the complete privacy scan**

Run:

```bash
rg -n "T-[0-9]{2,}|app\.plain\.com|slack\.com/archives|linear\.app/composio|X-Amz-(Signature|Credential)|/Users/" kb/source content/kb kb/audits
```

Expected: no matches. The audit report must use repository-relative source labels only.

- [ ] **Step 4: Run all repository gates**

Run:

```bash
bun run generate:kb
bun run check:kb
bun run test
bun run types:check
bun run lint:links
bun run sync:search --dry-run
bun run build
git diff --check
```

Expected: all commands succeed; search dry-run includes the expanded KB count; production build completes all routes.

- [ ] **Step 5: Smoke-test local routes**

Keep the existing dev server on port 3200 and verify:

```text
/kb
/kb/search?q=URL_NOT_RESET
/kb/topic/composio-for-you
/kb/toolkit/gmail
/kb/toolkit/salesforce
/kb/guide/tool-router-sessions-do-not-expire
/kb/guide/fix-salesforce-url-not-reset-with-the-correct-subdomain
```

Expected: HTTP 200, readable desktop/mobile layouts, canonical links, and no duplicated source badges.

- [ ] **Step 6: Commit final verification coverage**

```bash
git add docs/tests/static docs/kb/audits docs/content/kb docs/kb/manifest.json
git commit -m "test(docs): verify expanded public knowledge corpus"
```

- [ ] **Step 7: Leave the branch isolated**

Run:

```bash
git status --short
git log --oneline --decorate -12
```

Expected: clean `codex/public-kb-docs`. Do not merge, push, deploy, or run a non-dry-run Algolia replacement.
