# Plan 005: TS core hygiene — guard schema regexes, fix URL detection, redact error telemetry

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b2334fb8c..HEAD -- ts/packages/json-schema-to-zod/src ts/packages/core/src/utils/fileUtils.node.ts ts/packages/core/src/utils/modifiers/FileToolModifier.node.ts ts/packages/core/src/telemetry/Telemetry.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M (three independent fixes; each is small)
- **Risk**: LOW
- **Depends on**: 003 (only for the telemetry policy — the redaction shape must match what 003 ships for Python; if 003 was modified during review, mirror the final policy)
- **Category**: bug / security
- **Planned at**: commit `b2334fb8c`, 2026-07-03

## Why this matters

Three small defects in `@composio/core` and `@composio/json-schema-to-zod`, none touching the public interface:

1. **A bad `pattern` in any tool schema throws** during JSON-schema→Zod conversion (`new RegExp(pattern)` unguarded), aborting tool listing/wrapping for the whole batch instead of degrading one field. Schemas are semi-trusted: they come from the backend toolkit catalog and from user custom tools. Pattern-property regexes are also recompiled inside the validation hot loop, and their error message interpolates the wrong variable.
2. **`file.startsWith('http')` misclassifies local paths** like `http_export/report.pdf` as URLs. Misclassified paths skip the upload allowlist and sensitive-path checks (those only run for local paths) and get fetched over the network instead.
3. **Error telemetry ships `error.message` + `error.stack` off-box by default** to `telemetry.composio.dev`. Messages embed tool arguments and backend response fragments; stacks embed local paths. Plan 003 fixes the identical issue in Python; this keeps the SDKs at parity per `docs/decisions/cross-sdk-parity-policy.md`.

## Current state

- `ts/packages/json-schema-to-zod/src/parsers/parse-string.ts:41-43`:
  ```ts
  zodSchema = extendSchemaWithMessage(zodSchema, jsonSchema, 'pattern', (zs, pattern, errorMsg) =>
    zs.regex(new RegExp(pattern), errorMsg)
  );
  ```
- `ts/packages/json-schema-to-zod/src/parsers/parse-object.ts:146-166` — inside `superRefine`, per validated key, per pattern:
  ```ts
  for (const patternPropertyKey in normalizedSchema.patternProperties) {
    const regex = new RegExp(patternPropertyKey);   // recompiled every key, every safeParse; throws on bad pattern
    if (key.match(regex)) {
      ...
      message: `Invalid input: Key matching regex /${key}/ must match schema`,  // interpolates key, should be the pattern
  ```
- `ts/packages/core/src/utils/fileUtils.node.ts:251` — `if (file.startsWith('http')) { return await readFileContentFromURL(file, signal); }`; `:276` — `const isLocalPath = typeof file === 'string' && !file.startsWith('http');` (gates `assertPathInsideUploadDirs` and `assertSafeFileUploadPath` at `:278-286`).
- `ts/packages/core/src/utils/modifiers/FileToolModifier.node.ts:150-153`:
  ```ts
  if (typeof value === 'string') {
    // Match the URL/local-path split used downstream in
    // getFileDataAfterUploadingToS3 so the hook sees the same categorisation.
    const source = value.startsWith('http') ? 'url' : 'path';
  ```
- `ts/packages/core/src/telemetry/Telemetry.ts:211-233` — `prepareAndSendErrorTelemetry` builds, for all three error branches (`ComposioClientError` / `ComposioError` / `Error`), a payload containing `errorId`, `name`, (`code`,) `message`, `stack`. Sent via `sendErrorTelemetry` unless disabled (`shouldSendTelemetry`, `:172-179`: off only when `NODE_ENV` ∈ {test, ci}, `TELEMETRY_DISABLED=true`, or constructor opt-out).
- Conventions: vitest tests in `ts/packages/json-schema-to-zod/test` (or `src/**/*.test.ts` — check `ls`) and `ts/packages/core/test`; strict TS; internal helpers live in `src/utils/` and are exported only if the public barrel re-exports them.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| j-s-t-z tests | `pnpm --filter @composio/json-schema-to-zod test` | all pass |
| Core tests | `pnpm --filter @composio/core test` | all pass |
| Typecheck both | `pnpm --filter @composio/json-schema-to-zod typecheck && pnpm --filter @composio/core typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `ts/packages/json-schema-to-zod/src/parsers/parse-string.ts`
- `ts/packages/json-schema-to-zod/src/parsers/parse-object.ts`
- `ts/packages/core/src/utils/fileUtils.node.ts`
- `ts/packages/core/src/utils/modifiers/FileToolModifier.node.ts`
- `ts/packages/core/src/telemetry/Telemetry.ts`
- Test files for the above (existing or new, in each package's established test location)

**Out of scope**:
- `TelemetryPayload` *type* widening/narrowing that would ripple into exported types — check `grep -rn "TelemetryPayload" ts/packages/core/src/index.ts`; if the type is publicly exported, make `message`/`stack` optional rather than removing the fields from the type.
- The `s3url` host-allowlist hardening in `FileToolModifier.node.ts` (`hydrateDownloads`) — separate design decision, see plans/README.md backlog.
- Python (plan 003), browser/workerd fileUtils variants unless they contain the same `startsWith('http')` pattern (check: `grep -rn "startsWith('http')" ts/packages/core/src/` and fix all hits — they are all the same bug).

## Git workflow

- Branch from `next`: `advisor/005-ts-core-hygiene`
- One commit per step is fine; conventional commits, e.g. `fix(json-schema-to-zod): tolerate invalid regex patterns`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Guard schema regex compilation (parse-string.ts)

Wrap the pattern extension so an invalid pattern degrades to "no pattern constraint" instead of throwing:

```ts
zodSchema = extendSchemaWithMessage(zodSchema, jsonSchema, 'pattern', (zs, pattern, errorMsg) => {
  try {
    return zs.regex(new RegExp(pattern), errorMsg);
  } catch {
    // Invalid pattern in a semi-trusted schema: skip the constraint rather
    // than failing the whole tool's schema conversion.
    return zs;
  }
});
```

**Verify**: `pnpm --filter @composio/json-schema-to-zod test` → passes.

### Step 2: Precompile pattern-property regexes and fix the message (parse-object.ts)

Above the `superRefine` at `:146`, build the regex map once, skipping invalid patterns:

```ts
const patternRegexes = new Map<string, RegExp>();
for (const patternPropertyKey in normalizedSchema.patternProperties) {
  try {
    patternRegexes.set(patternPropertyKey, new RegExp(patternPropertyKey));
  } catch {
    // Invalid pattern: treat as non-matching rather than throwing at conversion time.
  }
}
```

Inside the loop, replace `const regex = new RegExp(patternPropertyKey)` with a lookup (`const regex = patternRegexes.get(patternPropertyKey); if (!regex) continue;`) and fix the issue message to reference the pattern, not the key:

```ts
message: `Invalid input: Key matching regex /${patternPropertyKey}/ must match schema`,
```

Note: `parseObjectProperties`/`parseSchema` may still throw for other malformed sub-schemas — leave that behavior alone; this plan only covers regex compilation.

**Verify**: `pnpm --filter @composio/json-schema-to-zod test` → passes, plus new tests in Step 5.

### Step 3: Real URL detection for file inputs

In `fileUtils.node.ts`, add near the top (not exported from the package barrel):

```ts
export const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);
```

Replace all `startsWith('http')` call sites found by `grep -rn "startsWith('http')" ts/packages/core/src/`:
- `fileUtils.node.ts:251` → `if (isHttpUrl(file))`
- `fileUtils.node.ts:276` → `const isLocalPath = typeof file === 'string' && !isHttpUrl(file);`
- `FileToolModifier.node.ts:153` → `const source = isHttpUrl(value) ? 'url' : 'path';` (import `isHttpUrl` from `../fileUtils.node` — match the file's existing relative-import style; the code comment there says the split must match downstream, which this preserves by construction).
- Any additional hits the grep finds: same substitution.

**Verify**: `grep -rn "startsWith('http')" ts/packages/core/src/` → empty; `pnpm --filter @composio/core test` → passes.

### Step 4: Redact error telemetry

In `Telemetry.ts` `prepareAndSendErrorTelemetry` (`:211-233`), drop `message` and `stack` from all three branches, keeping `errorId`, `name`, and `code` where present — the identical policy plan 003 ships for Python:

```ts
if (error instanceof ComposioClientError) {
  telemetryPayload.error = { errorId: error.errorId, name: error.name };
} else if (error instanceof ComposioError) {
  telemetryPayload.error = { errorId: error.errorId, name: error.name, code: error.code };
} else if (error instanceof Error) {
  telemetryPayload.error = { errorId: error.errorId, name: error.name ?? 'Unknown error' };
}
```

If the `TelemetryPayload` error type requires `message`, make those fields optional in the type (internal type — but see Out of scope if publicly exported).

**Verify**: `pnpm --filter @composio/core typecheck` → exit 0; `grep -n "stack" ts/packages/core/src/telemetry/Telemetry.ts` → no payload assignments remain (type definitions may still mention it as optional).

### Step 5: Tests

- json-schema-to-zod (find the existing test dir: `ls ts/packages/json-schema-to-zod`; model on an existing parser test):
  1. String schema with invalid `pattern` (e.g. `"("`) converts without throwing; valid strings pass, pattern constraint simply absent.
  2. Object schema with an invalid `patternProperties` key converts; validation treats it as non-matching.
  3. Object schema with a valid pattern property rejects a bad value and the issue message contains the PATTERN (regression for the interpolation fix).
- core:
  4. `isHttpUrl`: true for `http://x`, `https://X/y`; false for `http_export/report.pdf`, `httpdocs/a.txt`, `./http/x`.
  5. Telemetry: unit-test `prepareAndSendErrorTelemetry`'s payload (existing telemetry tests: `grep -rln "telemetry" ts/packages/core/test` — extend if present) asserting `message`/`stack` are absent and `name`/`code`/`errorId` present.

**Verify**: `pnpm --filter @composio/json-schema-to-zod test && pnpm --filter @composio/core test` → all pass with the new cases.

## Test plan

Listed in Step 5; cases 1–3 pin the conversion crash and the message fix, case 4 pins the classifier, case 5 pins the redaction policy.

## Done criteria

- [ ] Both packages' `test` and `typecheck` exit 0; `pnpm lint` exits 0.
- [ ] `grep -rn "startsWith('http')" ts/packages/core/src/` → empty.
- [ ] `grep -rn "new RegExp" ts/packages/json-schema-to-zod/src/parsers/` → every occurrence inside a try/catch or pre-validated map.
- [ ] Telemetry error payload contains no `message`/`stack` assignment.
- [ ] `git status` shows only in-scope files modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- `TelemetryPayload` (or its error sub-type) is exported from the public barrel AND consumed in exported function signatures — report before changing its shape.
- An existing test asserts telemetry `message`/`stack` transmission as a contract.
- The `startsWith('http')` grep surfaces a hit in generated code (`ts/packages/core/generated/**`) — generated surfaces must not be hand-edited; skip those hits and report.

## Maintenance notes

- Keep the TS and Python error-telemetry payloads in lockstep (parity policy). If a verbose opt-in is ever added, add it to both SDKs in the same release.
- The `s3url` fetch in `hydrateDownloads` (SSRF surface gated behind `dangerouslyAllowAutoUploadDownloadFiles`) and Python's redirect-following downloads (`python/composio/core/models/_files.py:595-599`) are related follow-ups in the backlog — a shared "which hosts may we fetch files from" decision should cover both.
- Reviewer scrutiny: Step 3 must not change behavior for genuine URLs — the only intended change is that `http`-prefixed *local paths* now go down the local path (and therefore through the safety checks).
