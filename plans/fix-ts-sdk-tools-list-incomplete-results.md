# fix: TS SDK tools.list returns incomplete results

> Source: [PLEN-2394](https://linear.app/composio/issue/PLEN-2394)
> Branch: `plen-2394-ts-sdk-bug-composioclient-returns-incomplete-tool-list-limit`

## Diagnosis

`composio.tools.getRawComposioTools({ toolkits: ['airtable'] })` returns 17 tools where Python returns 23. The cause is the auto-`important: 'true'` heuristic at `ts/packages/core/src/models/Tools.ts:390-400`: when `toolkits` is set without `limit`, the wrapper silently appends `important: 'true'` to the request. The server then filters server-side to the "important" subset — exactly the 17 the user reports.

The reporter's framing ("`limit` ignored, `toolkit_versions` missing in TS types") doesn't match what's actually shipped: `@composio/client@0.1.0-alpha.70` already types both fields and serializes numbers correctly. `@composio/core` already sends `toolkit_versions: 'latest'` by default (`Tools.ts:435`). The truncation is purely from `important: 'true'`.

## Fix

Two coordinated changes, one PR, one changeset:

1. **Remove the auto-`important` heuristic from `getRawComposioTools`.** A method named "raw" should not silently filter. Callers who want the curated subset can pass `important: true` explicitly.
2. **Surface `toolkitVersions` as a per-call override in the public type.** Currently it's only configurable at SDK init. This is what the reporter actually wants when they ask for "parity with Python's `toolkit_versions=latest` flow" — an escape hatch without re-instantiating `Composio`.

The `tools.get` (provider-tool fetch) call site is **out of scope**. If reviewers want the heuristic preserved there, do that in a separate PR with the `tools.get` call site as the named context.

## Reproduction (pre-work, not acceptance criteria)

Two calls, no matrix:

```ts
// before fix — confirms the heuristic is the cause
await composio.tools.getRawComposioTools({ toolkits: ['airtable'] });           // 17
await composio.tools.getRawComposioTools({ toolkits: ['airtable'], important: false }); // 23
```

If the second call returns 23, the diagnosis is confirmed. Move to implementation.

## Implementation

### 1. `ts/packages/core/src/types/tool.types.ts`

**Schema first** — Zod `safeParse` strips unknown keys, so the schema update must precede the type update. Otherwise `queryParams.data.toolkitVersions` is permanently `undefined` no matter what the caller passes.

```ts
export const ToolListParamsSchema = z.object({
  tools: z.array(z.string()).optional(),
  toolkits: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().optional(),
  search: z.string().optional(),
  authConfigIds: z.array(z.string()).optional(),
  important: z.boolean().optional(),
  toolkitVersions: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
});
```

Add `toolkitVersions?: string | Record<string, string>` to `BaseParams` (line 191). Pick it into every variant where it's meaningful — recommend all variants except `SearchOnlyParams` if `search` doesn't accept version pinning today (verify with the API; default to including it).

### 2. `ts/packages/core/src/models/Tools.ts`

Replace the heuristic block (lines 390-400) and the `effectiveImportant` derivation. Drop `shouldAutoApplyImportant` entirely:

```ts
const effectiveImportant =
  'important' in queryParams.data ? queryParams.data.important : false;

const effectiveToolkitVersions =
  queryParams.data.toolkitVersions ?? this.toolkitVersions;
```

In the `filters` construction (lines 422-436), replace the existing `toolkit_versions` line:

```ts
...(effectiveToolkitVersions !== undefined ? { toolkit_versions: effectiveToolkitVersions } : {}),
```

Leave the `...(limit ? { limit } : {})` pattern — it already handles the `null`/`undefined`-strip concern correctly. Don't introduce a generic `omitNullish` helper for two call sites.

### 3. `ts/packages/core/test/tools/tools.test.ts`

Update the existing test at lines 72-89 — it asserts `important: 'true'` is sent. After the fix, that assertion goes away:

```ts
it('should not auto-apply important when only toolkits is provided', async () => {
  const query = { toolkits: ['github'] };
  mockClient.tools.list.mockResolvedValueOnce({ items: [toolMocks.rawTool], totalPages: 1 });
  await context.tools.getRawComposioTools(query);
  expect(mockClient.tools.list).toHaveBeenCalledWith({
    toolkit_slug: 'github',
    toolkit_versions: 'latest',
  });
});
```

Add three new tests (collapse string + object form with `it.each`):

```ts
it.each([
  ['string', 'v1.2'],
  ['object', { github: 'v1', gmail: 'v2' }],
])('should forward per-call toolkitVersions (%s form)', async (_, value) => {
  // assert client.tools.list receives toolkit_versions: <value>
});

it('should fall back to SDK-init toolkitVersions when not in query', async () => {
  // pass query without toolkitVersions; assert 'latest' (or whatever the test ctx sets)
});

it('should not leak per-call override into subsequent calls', async () => {
  // call once with toolkitVersions: 'v1', then again without; assert second call uses default
});
```

Schema-level test (cheap, catches the silent-strip regression Kieran flagged):

```ts
it('schema accepts toolkitVersions', () => {
  expect(ToolListParamsSchema.safeParse({ toolkits: ['x'], toolkitVersions: 'v1' }).success).toBe(true);
});
```

## Acceptance criteria

- [x] Reproduction confirms the heuristic is the cause — existing test `tools.test.ts:72-89` already proved it via mocks (asserted `important: 'true'` was sent for `{ toolkits: ['github'] }` — that's the smoking gun).
- [x] Tests at `tools.test.ts:72-89` and `:134-153` (and 5 toolkit-version tests around `:1410-1864`) updated to expect no auto `important: 'true'`.
- [x] New tests pass: per-call override (table-driven, string + object form), fallback to SDK-init default, no state leak across calls.
- [x] Schema accepts `toolkitVersions` (two new schema-level tests for `'latest'` and `Record` forms).
- [x] `pnpm test` clean for `@composio/core` (902 tests pass). Repo lint pre-existing failure unrelated to changed files.
- [x] Changeset added at `.changeset/fix-tools-list-toolkit-versions.md`: `@composio/core: minor`, behavior-change framed, no Linear ID in body.

## Risks

* **Behavior change is observable.** Any caller relying on `getRawComposioTools` to silently return only "important" tools will see more tools after the fix. Mitigated by: minor-bump semver and explicit changeset framing.
* **`tools.get` heuristic preserved.** This PR scopes the change to `getRawComposioTools`. The `tools.get` call site (used by Provider-tool flows) is unchanged and may surface the same surprise later. Tracked separately if it does.

## Files

* `ts/packages/core/src/models/Tools.ts:390-400, 422-436` — heuristic removal + `toolkitVersions` per-call wire-up.
* `ts/packages/core/src/types/tool.types.ts:180-256` — schema + type extension.
* `ts/packages/core/test/tools/tools.test.ts:72-89` — existing test update + new tests.
* `pnpm-workspace.yaml` — `@composio/client: 0.1.0-alpha.70` (unchanged).
