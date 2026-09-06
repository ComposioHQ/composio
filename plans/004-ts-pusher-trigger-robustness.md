# Plan 004: Stop trigger subscriptions from crashing the host and leaking chunk buffers (TS)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b2334fb8c..HEAD -- ts/packages/core/src/services/pusher ts/packages/core/test`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED (realtime path; behavior change is "crash → catchable error", which is what callers already expect from `subscribe()`)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b2334fb8c`, 2026-07-03

## Why this matters

Triggers are a stable v1 surface. Two defects in the Pusher service behind `triggers.subscribe()`:

1. **Crash**: the `pusher:subscription_error` handler `throw`s inside an event callback that runs after `subscribe()` has already returned. Nothing can catch it — a server-side subscription rejection (bad auth, channel denied) becomes an unhandled exception that can take down a long-running host process instead of surfacing as the `ComposioFailedToSubscribeToPusherChannelError` that `subscribe()` already throws for other failures.
2. **Leak + silent loss**: chunked trigger messages are reassembled in a map that is only cleaned up on successful delivery or parse error. If any chunk is dropped, the partial buffer stays forever and the event is silently lost. The completeness check (`ev.chunks.length === Object.keys(ev.chunks).length`) also never fires when the final chunk's index leaves a gap (sparse array: `length` counts the highest index + 1, `keys` counts filled slots).

## Current state

- `ts/packages/core/src/services/pusher/Pusher.ts` — the whole file is in scope; ~230 lines. Key excerpts at commit `b2334fb8c`:
  - `:173-181` (inside `async subscribe(fn)`):
    ```ts
    channel.bind('pusher:subscription_error', (data: Record<string, unknown>) => {
      const error = data.error ? String(data.error) : 'Unknown subscription error';
      throw new ComposioFailedToSubscribeToPusherChannelError(
        `Trigger subscription error: ${error}`,
        { cause: error }
      );
    });
    ```
  - `:102-148` (inside `bindWithChunking`): module-scoped `events` map per binding:
    ```ts
    const events: { [key: string]: { chunks: string[]; receivedFinal: boolean } } = {};
    channel.bind('chunked-' + event, data => { ...
      ev.chunks[typedData.index] = typedData.chunk;
      if (typedData.final) ev.receivedFinal = true;
      if (ev.receivedFinal && ev.chunks.length === Object.keys(ev.chunks).length) {
        ... JSON.parse(ev.chunks.join('')) ... delete events[typedData.id];
      }
    });
    ```
  - `:184-192` — `safeCallback` wraps the user callback in try/catch (this is the repo's existing convention for "never throw from event handlers"; match it).
- Error types come from `ts/packages/core/src/errors/TriggerErrors.ts` (`ComposioFailedToSubscribeToPusherChannelError` is already imported at `Pusher.ts:5-9`).
- The only caller of `PusherService.subscribe` is the triggers model: `grep -rn "\.subscribe(" ts/packages/core/src/models/Triggers.ts` — confirm during execution.
- Tests: `ls ts/packages/core/test` and `grep -rln "pusher" ts/packages/core/test` — at planning time there was no dedicated unit test for chunk reassembly.
- `PusherService` is internal (`grep -n "Pusher" ts/packages/core/src/index.ts` → not exported from the public barrel — confirm; if it IS exported, see STOP conditions).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Core tests | `pnpm --filter @composio/core test` | all pass |
| Typecheck | `pnpm --filter @composio/core typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `ts/packages/core/src/services/pusher/Pusher.ts`
- `ts/packages/core/src/services/pusher/ChunkAssembler.ts` (new, internal — do NOT export from `src/index.ts`)
- New test file under `ts/packages/core/test/` (e.g. `test/services/chunkAssembler.test.ts`, matching the existing test layout — check `ls ts/packages/core/test` first)

**Out of scope**:
- `ts/packages/core/src/models/Triggers.ts` — `subscribe()`'s external contract (throws `ComposioFailedToSubscribeToPusherChannelError` on failure) is unchanged.
- The public barrel `src/index.ts`.
- Python's trigger path (its Pusher handling is separate; if the same defects exist there, report in Maintenance notes — do not fix here).

## Git workflow

- Branch from `next`: `advisor/004-pusher-robustness`
- Conventional commit, e.g. `fix(core): surface pusher subscription errors and evict stale trigger chunks`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract a pure `ChunkAssembler`

Create `ts/packages/core/src/services/pusher/ChunkAssembler.ts` — a small class with no Pusher/network dependency so it is unit-testable:

```ts
interface PendingMessage {
  chunks: string[];
  received: number;        // count of chunks actually stored
  expected: number | null; // final index + 1, known once final chunk arrives
  updatedAt: number;
}

export class ChunkAssembler {
  constructor(private readonly maxAgeMs: number = 5 * 60_000) {}
  /** Returns the reassembled payload string when complete, else null. */
  add(id: string, index: number, chunk: string, final: boolean, now?: number): string | null
  /** Drops pending messages older than maxAgeMs. Called internally by add(). */
  evictStale(now?: number): void
}
```

Semantics `add` must implement:
- Store `chunk` at `index`; increment `received` only if that slot was empty (duplicate chunks must not double-count).
- On `final === true`, set `expected = index + 1`.
- Complete when `expected !== null && received === expected` → join chunks in index order, delete the entry, return the string.
- Every `add` first calls `evictStale` (an incomplete message older than `maxAgeMs` is deleted; use an injectable `now` parameter for tests instead of calling `Date.now()` inside tests).

### Step 2: Use it in `bindWithChunking`

Replace the inline `events` map logic in `Pusher.ts:102-148` with a `ChunkAssembler` instance per binding. Keep the existing validation (`typeof typedData.id !== 'string'` etc.), the JSON.parse + `logger.error` on parse failure, and the outer try/catch exactly as they are — only the accumulation/completeness/cleanup logic moves.

**Verify**: `pnpm --filter @composio/core typecheck` → exit 0; `pnpm --filter @composio/core test` → existing suite passes.

### Step 3: Stop throwing from the subscription_error handler

`subscribe()` currently resolves as soon as `pusherClient.subscribe(channel)` returns, and the error handler throws uncatchably later. Change `subscribe()` to settle on the actual subscription outcome:

```ts
await new Promise<void>((resolve, reject) => {
  channel.bind('pusher:subscription_succeeded', () => resolve());
  channel.bind('pusher:subscription_error', (data: Record<string, unknown>) => {
    const error = data.error ? String(data.error) : 'Unknown subscription error';
    reject(
      new ComposioFailedToSubscribeToPusherChannelError(
        `Trigger subscription error: ${error}`,
        { cause: error }
      )
    );
  });
});
```

Notes:
- A rejection here propagates through `subscribe()`'s existing outer try/catch (`:197-204`), which already wraps failures in `ComposioFailedToSubscribeToPusherChannelError` — check it does not double-wrap (if it would, rethrow the original when it is already that type).
- If the channel is already subscribed when `subscribe()` is called (Pusher fires `subscription_succeeded` only once), guard with `if ((channel as { subscribed?: boolean }).subscribed) resolve()` before binding, or check the pusher-js API surface used by `PusherClient` in `ts/packages/core/src/types/pusher.types.ts`. If neither state flag nor event is available on the vendored type, STOP and report.
- A late `subscription_error` after success (e.g. re-subscribe on reconnect) must be logged via `logger.error`, not thrown: after the promise settles, rebind the error event to a logging-only handler.

**Verify**: `pnpm --filter @composio/core typecheck` → exit 0; `pnpm --filter @composio/core test` → passes.

### Step 4: Tests

Create the ChunkAssembler unit test (model structure on any existing test in `ts/packages/core/test`, vitest, `describe`/`it`):

1. In-order chunks 0..2 with final on 2 → returns joined payload, internal map empty.
2. Out-of-order arrival (2-final, then 0, then 1) → completes on the last arrival (this fails on the old sparse-array logic; state that in a comment).
3. Duplicate chunk delivery → still completes exactly once, no double-count.
4. Missing chunk + stale eviction: add chunks 0 and 2-final at t=0, call `add` for an unrelated id at t = maxAge+1 → the stale entry is evicted (assert via a size/inspection accessor or by re-sending chunk 1 and confirming no completion).
5. Two interleaved message ids assemble independently.

For Step 3, add a test only if an existing pusher test harness/mocks exist (`grep -rln "pusher" ts/packages/core/test`); if none, note it in Maintenance (mocking the vendored Pusher client from scratch is out of proportion for this plan).

**Verify**: `pnpm --filter @composio/core test` → all pass including 5 new ChunkAssembler tests.

## Test plan

See Step 4. The out-of-order test (case 2) is the regression pin for the completeness-check bug; the eviction test (case 4) pins the leak fix.

## Done criteria

- [ ] `pnpm --filter @composio/core typecheck` exits 0.
- [ ] `pnpm --filter @composio/core test` exits 0 with ≥5 new tests.
- [ ] `grep -n "throw new ComposioFailedToSubscribeToPusherChannelError" ts/packages/core/src/services/pusher/Pusher.ts` shows no throw inside an event-handler callback (only promise rejection / subscribe-level throw).
- [ ] `grep -n "ChunkAssembler" ts/packages/core/src/index.ts` → empty (stays internal).
- [ ] `pnpm lint` exits 0; `git status` shows only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- `PusherService` or `bindWithChunking` is exported from the public barrel `ts/packages/core/src/index.ts` — the internal-refactor assumption breaks; report.
- The vendored `PusherClient` type exposes neither a `subscribed` state nor `subscription_succeeded` binding — Step 3's outcome-promise cannot be implemented cleanly; report with what the type does expose.
- Existing tests depend on the throwing behavior of `subscription_error` (unlikely, but check failures carefully).

## Maintenance notes

- Check whether Python's trigger subscription (`python/composio/core/models/triggers.py`, Pusher handling) has the same two defects; if yes, open a parity follow-up — the cross-SDK parity policy (`docs/decisions/cross-sdk-parity-policy.md`) expects behavior alignment within one minor.
- If backend chunking protocol ever adds an explicit `total` field, `ChunkAssembler.expected` should read it instead of inferring from the final index.
- Reviewer scrutiny: reconnect behavior — ensure the settled-promise pattern doesn't leave `subscribe()` hanging forever if Pusher emits neither event (consider whether the vendored client has a connection timeout; if adding one, keep it generous, e.g. 30s, and throw the same error type).
